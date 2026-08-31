import {
  BOARD_PROMPT_IDS,
  CHECK_VERDICT_SCHEMA,
  DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS,
  DEFAULT_BOARD_CHECK_REPORT_INSTRUCTIONS,
} from './prompts.js';

const JUDGE_TIMEOUT_MS = 120_000;
const DIFF_CHAR_BUDGET = 24_000;
const ANSWER_CHAR_BUDGET = 16_000;
const OVERRIDE_MAX = 20_000;

/**
 * Board delivery checker — the "Checking" column's processor. When a worker
 * session goes idle the checker judges the deliverable against the card's
 * completion criteria: report cards are judged from the final answer, PR
 * cards wait for CI then get an AI pre-review of the diff. Failing within
 * budget hands concrete feedback back to the worker session (self-heal);
 * past budget the card needs human attention.
 */
export const createBoardChecker = ({
  service,
  generate,
  readPromptOverride,
  fetchPrDiff = async () => null,
  fetchFinalAnswer = async () => null,
  sendSessionMessage = async () => {},
  updateBranch = async () => { throw new Error('update-branch not configured'); },
  now = () => Date.now(),
  log = console,
} = {}) => {
  if (!service) throw new Error('checker requires board service');

  const resolveSystem = async (promptId, fallback) => {
    if (!readPromptOverride) return fallback;
    try {
      const override = await readPromptOverride(promptId);
      if (override && override.trim().length > 0 && override.length <= OVERRIDE_MAX) return override;
    } catch (error) {
      log.warn('[Board] check prompt override read failed, using built-in:', error?.message ?? error);
    }
    return fallback;
  };

  const parseVerdict = (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('checker returned unparseable verdict');
    }
    const verdict = parsed.verdict === 'pass' ? 'pass' : parsed.verdict === 'needs_work' ? 'needs_work' : null;
    if (!verdict) throw new Error('checker returned an invalid verdict');
    return { verdict, feedback: String(parsed.feedback ?? '').slice(0, 4_000) };
  };

  const judge = async (config, { promptId, fallback, context }) => {
    const options = {
      prompt: context.slice(0, DIFF_CHAR_BUDGET + ANSWER_CHAR_BUDGET),
      system: await resolveSystem(promptId, fallback),
      responseSchema: CHECK_VERDICT_SCHEMA,
      timeoutMs: JUDGE_TIMEOUT_MS,
    };
    if (config.defaultModel) options.model = config.defaultModel;
    const generated = await generate(options);
    return parseVerdict(generated.text);
  };

  const routePassed = (task) => {
    // Green-review plans skip the human gate and merge as soon as queued.
    if (task.evaluation?.plan?.review === 'green' && task.pr?.number && !task.pr.draft) {
      return service.moveToMerging(task.id).task;
    }
    return service.moveToReview(task.id).task;
  };

  const applyVerdict = async (task, config, { verdict, feedback }) => {
    if (verdict === 'pass') return routePassed(task);
    const attempts = (task.checkAttempts ?? 0) + 1;
    if (attempts > (config.checkRetries ?? 2)) {
      return service.blockTask(task.id, `delivery checks failed after ${task.checkAttempts ?? 0} self-heal rounds`).task;
    }
    try {
      await sendSessionMessage({
        task,
        text: `TaskHunter board checker reviewed this card's deliverable and requires changes:\n\n${feedback}\n\nFix them on this branch, update the deliverable, and confirm when every criterion is met.`,
      });
    } catch (error) {
      log.warn('[Board] self-heal message failed:', error?.message ?? error);
    }
    return service.sendBackForRework(task.id, { checkAttempts: attempts }).task;
  };

  /** Judge one card currently in the Checking column. Returns its outcome. */
  const checkTask = async (task, project, config) => {
    if (task.pr?.number && !task.pr.merged) {
      if (prBlocked(task.pr)) return waiting(task, prBlockedReason(task.pr));
      // CI still running or GitHub still computing mergeability: wait, no judge.
      if (task.pr.mergeable !== true || !['clean', 'unknown'].includes(task.pr.checks)) {
        return waiting(task, 'waiting-ci');
      }

      let diff = null;
      try {
        diff = await fetchPrDiff({ project, pr: task.pr });
      } catch (error) {
        log.warn('[Board] PR diff fetch failed:', error?.message ?? error);
      }
      if (!diff) return waiting(task, 'waiting-diff');

      const context = [
        `# Card: ${task.title}`,
        task.evaluation?.plan?.goalDefinition ? `## Completion criteria\n${task.evaluation.plan.goalDefinition}` : `## Goal\n${task.description}`,
        `## Pull request #${task.pr.number}: ${task.pr.url ?? ''}`,
        `## Diff\n${diff.slice(0, DIFF_CHAR_BUDGET)}`,
      ].join('\n\n');
      const verdict = await judge(config, {
        promptId: BOARD_PROMPT_IDS.checkPr,
        fallback: DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS,
        context,
      });
      return applyVerdict(task, config, verdict);
    }

    // A PR-plan card whose session produced no PR (stopped on a question,
    // or skipped the push) is not judgeable as a report — wait honestly.
    if (task.evaluation?.plan?.deliverable === 'pr') return waiting(task, 'waiting-pr');

    const answer = await fetchFinalAnswer({ task, project }).catch((error) => {
      log.warn('[Board] final answer fetch failed:', error?.message ?? error);
      return null;
    });
    if (!answer) return waiting(task, 'waiting-answer');

    const context = [
      `# Card: ${task.title}`,
      task.evaluation?.plan?.goalDefinition ? `## Completion criteria\n${task.evaluation.plan.goalDefinition}` : `## Goal\n${task.description}`,
      `## Worker's final answer\n${answer.slice(0, ANSWER_CHAR_BUDGET)}`,
    ].join('\n\n');
    const verdict = await judge(config, {
      promptId: BOARD_PROMPT_IDS.checkReport,
      fallback: DEFAULT_BOARD_CHECK_REPORT_INSTRUCTIONS,
      context,
    });
    return applyVerdict(task, config, verdict);
  };

  const prBlocked = (pr) => pr.mergeable === false && ['behind', 'dirty'].includes(pr.checks);
  const prBlockedReason = (pr) => (pr.checks === 'dirty' ? 'needs-rebase' : 'behind-base');

  const waiting = (task, stage) => {
    service.setCheck(task.id, { stage, at: now() });
    return task;
  };

  /** Self-heal a conflicted/behind PR under review (checker-owned retries). */
  const attemptRebase = async (task) => {
    const attempts = (task.checkAttempts ?? 0) + 1;
    const config = (await service.list()).config;
    if (attempts > (config.mergeRetries ?? 2)) {
      service.blockTask(task.id, 'branch conflict could not be resolved automatically');
      return;
    }
    try {
      await updateBranch({ owner: task.pr?.owner, repo: task.pr?.repo, number: task.pr?.number });
      service.setCheck(task.id, { stage: 'rebasing', at: now() });
    } catch (error) {
      log.warn('[Board] checker rebase failed:', error?.message ?? error);
    }
  };

  /** Forward human review notes back to the worker session for rework. */
  const sendReviewFeedback = async ({ task, note }) => {
    const text = note && note.trim()
      ? `TaskHunter board review requires changes before this card can land:\n\n${note.trim()}\n\nAddress every point, update the deliverable, and confirm when done.`
      : 'TaskHunter board review was not accepted. Continue working on this card: identify what the reviewer would most likely flag, fix it, and confirm when every completion criterion is met.';
    await sendSessionMessage({ task, text });
  };

  return { checkTask, attemptRebase, sendReviewFeedback };
};

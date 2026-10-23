import {
  BOARD_PROMPT_IDS,
  CHECK_VERDICT_SCHEMA,
  DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS,
  DEFAULT_BOARD_CHECK_REPORT_INSTRUCTIONS,
} from './prompts.js';

const JUDGE_TIMEOUT_MS = 120_000;
// PR diff budget: max chars of diff fed to the judge. 24k ≈ 6k tokens; combined with
// ANSWER_CHAR_BUDGET (16k) and system prompt the total stays under the 40k context
// cap (TOTAL_CONTEXT_BUDGET) so the judge never exceeds the model's context window.
// Caller (feature-routes-runtime) requests diff via GitHub API with per_page 30 —
// large PRs with >30 files are truncated server-side; truncation is handled here
// smartly (keep file headers + key patches) rather than naive head-slice, so the
// judge still sees high-signal changes even when over budget.
const DIFF_CHAR_BUDGET = 24_000;
const ANSWER_CHAR_BUDGET = 16_000;
// Hard cap for judge context (prompt + diff + answer). Prompt + diff + answer are
// joined then sliced to this, guaranteeing model input stays within limits.
const TOTAL_CONTEXT_BUDGET = 40_000;
const OVERRIDE_MAX = 20_000;
const WAITING_TIMEOUT_MS = 10 * 60 * 1000;

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

  // Smart diff truncation: when diff exceeds DIFF_CHAR_BUDGET, keep file headers
  // and beginning of patches (70% head) plus tail (30%) with a marker, so judge
  // sees both early file headers and trailing changes instead of a blind cut.
  const truncateDiff = (diff) => {
    if (diff.length <= DIFF_CHAR_BUDGET) return diff;
    const head = Math.floor(DIFF_CHAR_BUDGET * 0.7);
    const tail = DIFF_CHAR_BUDGET - head - 80;
    const truncated = diff.length - DIFF_CHAR_BUDGET;
    return `${diff.slice(0, head)}\n\n...[diff truncated ${truncated} chars — showing first ${head} and last ${tail} chars]...\n\n${diff.slice(diff.length - tail)}`;
  };

  const judge = async (config, { promptId, fallback, context }) => {
    const options = {
      prompt: context.slice(0, TOTAL_CONTEXT_BUDGET),
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
      if (prBlocked(task.pr)) return waiting(task, prBlockedReason(task.pr), config);
      // CI still running or GitHub still computing mergeability: wait, no judge.
      if (task.pr.mergeable !== true || !['clean', 'unknown'].includes(task.pr.checks)) {
        return waiting(task, 'waiting-ci', config);
      }

      let diff = null;
      try {
        diff = await fetchPrDiff({ project, pr: task.pr });
      } catch (error) {
        log.warn('[Board] PR diff fetch failed:', error?.message ?? error);
      }
      if (!diff) return waiting(task, 'waiting-diff', config);

      const context = [
        `# Card: ${task.title}`,
        task.evaluation?.plan?.goalDefinition ? `## Completion criteria\n${task.evaluation.plan.goalDefinition}` : `## Goal\n${task.description}`,
        `## Pull request #${task.pr.number}: ${task.pr.url ?? ''}`,
        `## Diff\n${truncateDiff(diff)}`,
      ].join('\n\n');
      const verdict = await judge(config, {
        promptId: BOARD_PROMPT_IDS.checkPr,
        fallback: DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS,
        context,
      });
      return applyVerdict(task, config, verdict);
    }

    // A PR-plan card with no open PR: the worker's session went idle without
    // a deliverable. The board runs unattended, so instead of waiting
    // silently, judge the worker's last message and nudge it to keep going —
    // including answering its own questions, which no user can here. The
    // check budget bounds these nudges; past it the card is blocked.
    if (task.evaluation?.plan?.deliverable === 'pr') {
      const answer = await fetchFinalAnswer({ task, project }).catch((error) => {
        log.warn('[Board] final answer fetch failed:', error?.message ?? error);
        return null;
      });
      const context = [
        `# Card: ${task.title}`,
        task.evaluation?.plan?.goalDefinition ? `## Completion criteria\n${task.evaluation.plan.goalDefinition}` : `## Goal\n${task.description}`,
        '## Status\nNo pull request has been opened yet; the worker session has gone idle.',
        ...(answer ? [`## Worker's last message\n${answer.slice(0, ANSWER_CHAR_BUDGET)}`] : []),
      ].join('\n\n');
      const verdict = answer
        ? await judge(config, {
            promptId: BOARD_PROMPT_IDS.checkPr,
            fallback: DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS,
            context,
          })
        : {
            verdict: 'needs_work',
            feedback: 'Your session stopped without opening a pull request. Continue working until every goal criterion is met and the pull request is open against the default branch.',
          };
      // A PR deliverable is never complete without an open PR.
      return applyVerdict(task, config, verdict.verdict === 'pass'
        ? { verdict: 'needs_work', feedback: verdict.feedback || 'Open the pull request against the default branch once every goal criterion is met.' }
        : verdict);
    }

    const answer = await fetchFinalAnswer({ task, project }).catch((error) => {
      log.warn('[Board] final answer fetch failed:', error?.message ?? error);
      return null;
    });
    if (!answer) return waiting(task, 'waiting-answer', config);

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

  const waiting = (task, stage, config = null) => {
    const current = now();
    const existing = task.check;
    // If same stage has persisted beyond WAITING_TIMEOUT_MS, count it as one
    // failed attempt against the check budget. This prevents waiting-ci /
    // waiting-diff / waiting-answer from spinning forever in checking. After
    // the budget (checkRetries / maxAttempts) is exceeded the card is blocked
    // for human attention — at least finite waiting before block.
    if (existing && existing.stage === stage && typeof existing.at === 'number') {
      if (current - existing.at > WAITING_TIMEOUT_MS) {
        const attempts = (task.checkAttempts ?? 0) + 1;
        let limit = 2;
        if (config) {
          limit = config.checkRetries ?? config.maxAttempts ?? 2;
        } else {
          try {
            const doc = service.loadDoc();
            limit = doc.config?.checkRetries ?? doc.config?.maxAttempts ?? 2;
          } catch {}
        }
        if (attempts > limit) {
          return service.blockTask(task.id, `delivery checks failed after waiting for ${stage} (${attempts} attempts)`).task;
        }
        try {
          const doc = service.loadDoc();
          const currentTask = doc.tasks.find((entry) => entry.id === task.id);
          if (currentTask) {
            currentTask.checkAttempts = attempts;
            currentTask.check = { stage, at: current };
            currentTask.updatedAt = current;
            service.saveDoc(doc);
            return service.loadDoc().tasks.find((entry) => entry.id === task.id) ?? task;
          }
        } catch (error) {
          log.warn('[Board] waiting attempts persist failed:', error?.message ?? error);
        }
        service.setCheck(task.id, { stage, at: current });
        return service.loadDoc().tasks.find((entry) => entry.id === task.id) ?? task;
      }
    }
    service.setCheck(task.id, { stage, at: current });
    return service.loadDoc().tasks.find((entry) => entry.id === task.id) ?? task;
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

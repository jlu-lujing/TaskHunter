/**
 * Board AI touchpoints as overridable magic prompts (Settings → Magic
 * Prompts). The UI catalog in packages/ui/src/lib/magicPrompts.ts declares
 * the same default texts for display/editing; keep them in sync — a unit
 * test guards equality.
 */
export const BOARD_PROMPT_IDS = Object.freeze({
  evaluate: 'board.evaluate.instructions',
  dispatchPr: 'board.dispatch.pr.instructions',
  dispatchReport: 'board.dispatch.report.instructions',
  checkReport: 'board.check.report.instructions',
  checkPr: 'board.check.pr.instructions',
});

export const DEFAULT_BOARD_EVALUATE_INSTRUCTIONS = [
  'You are the launch evaluator for a TaskHunter kanban board. From the task card alone (no repository access), produce the launch plan.',
  'goalDefinition: the completion criteria an auditor will judge the finished work against — end goals, what must exist and work, how each major part is verified. Omit implementation steps. Preserve file paths, commands, and identifiers verbatim. Stay under 1200 characters. Write it in the same language as the task.',
  "deliverable: 'pr' when the outcome is a code change to the project (implemented on a branch, opened as a pull request); 'report' when the outcome is investigation, analysis, or writing answered directly in the conversation.",
  "review: 'green' only for low-risk, mechanical changes that are safe to merge automatically once CI is green; otherwise 'human'.",
  'rationale: one short sentence in the task language.',
].join('\n');

export const DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS = [
  '## Goal (completion criteria)',
  '{{goal_definition}}',
  '',
  '## Deliverable',
  'Implement the change in this worktree and open a pull request against the project default branch once every goal criterion is met. Do not merge it yourself — the board merge queue handles that.',
  '',
  '## Autonomy',
  'You run unattended on an automation board with no user to consult. Never stop to ask a question or wait for input. When you must choose between options, pick the one that best satisfies the goal criteria and record the decision and its rationale in the pull request description. If a detail is ambiguous, make a reasonable, conservative assumption and note it.',
  '',
  '## Reporting back',
  'Before you stop, report this card with exactly one board action: board.finish once every goal criterion is delivered, board.noop with a reason if you determined no work is needed, or board.blocked with a reason if something outside this session stops you. Stopping without a receipt forces the board to guess.',
].join('\n');

export const DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS = [
  '## Goal (completion criteria)',
  '{{goal_definition}}',
  '',
  '## Deliverable',
  'Answer directly in this session as a self-contained report that satisfies every goal criterion.',
  '',
  '## Autonomy',
  'You run unattended on an automation board with no user to consult. Never stop to ask a question or wait for input. When something is ambiguous, make a reasonable, conservative assumption, state it in the report, and keep going.',
  '',
  '## Reporting back',
  'Before you stop, report this card with exactly one board action: board.finish once every goal criterion is delivered, board.noop with a reason if you determined no work is needed, or board.blocked with a reason if something outside this session stops you. Stopping without a receipt forces the board to guess.',
].join('\n');

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Fill `{{key}}` placeholders; unknown placeholders stay untouched on purpose. */
export const renderBoardTemplate = (template, variables) => template.replace(PLACEHOLDER_PATTERN, (match, key) => (
  Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
));

export const DEFAULT_BOARD_CHECK_REPORT_INSTRUCTIONS = [
  'You are the delivery checker for a TaskHunter kanban card whose deliverable is a report answered in the session.',
  "Judge ONLY whether the worker's final answer satisfies every completion criterion. verdict 'pass' requires ALL criteria demonstrably met by the answer itself (not the worker's intentions) and the answer being self-contained.",
  "Otherwise verdict 'needs_work' with feedback: concrete, actionable fixes addressed to the worker agent — name what is missing, wrong, or unverified. Never flag style, verbosity, or hypothetical improvements.",
  'Answer in the language of the task.',
].join('\n');

export const DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS = [
  'You are the delivery checker for a TaskHunter kanban card whose deliverable is a pull request.',
  "The context contains either the pull request diff (when a PR is open) or the worker's last message (when no PR exists yet and the worker's session has gone idle).",
  "When a diff is present, judge whether it fulfills every completion criterion and contains no real defects. verdict 'pass' when the change clearly satisfies the goal; 'needs_work' otherwise. Report only high-signal issues: criteria not implemented, correctness bugs, security risks, missing pieces the change itself set out to cover. Do NOT report pre-existing issues, lint-level style, or speculative concerns.",
  "When no PR exists yet the deliverable is incomplete, so verdict 'needs_work'. In feedback, direct the worker to keep going: if its last message asked the user a question or waited for input, remind it that the board runs fully autonomous and there is no user to answer — decide on its own in the way that best satisfies the goal criteria, record the decision, and continue until the pull request is open against the default branch.",
  'feedback is addressed to the worker agent: concrete, actionable fixes with file references where possible. Answer in the language of the task.',
].join('\n');

/** Structured verdict every delivery check must return. */
export const CHECK_VERDICT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'feedback'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'needs_work'] },
    feedback: { type: 'string', description: 'Concrete fixes for the worker agent; empty when passing.' },
  },
});

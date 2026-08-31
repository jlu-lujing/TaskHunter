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
].join('\n');

export const DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS = [
  '## Goal (completion criteria)',
  '{{goal_definition}}',
  '',
  '## Deliverable',
  'Answer directly in this session as a self-contained report that satisfies every goal criterion.',
].join('\n');

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Fill `{{key}}` placeholders; unknown placeholders stay untouched on purpose. */
export const renderBoardTemplate = (template, variables) => template.replace(PLACEHOLDER_PATTERN, (match, key) => (
  Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
));

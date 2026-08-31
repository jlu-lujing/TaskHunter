import type { I18nKey } from '@/lib/i18n';

/**
 * Agent pipeline columns. One column = one owner:
 * backlog(human) → planning(evaluator) → queued(scheduler) → running(worker)
 * → checking(delivery checker) → review(human) → merging(merge bot) → done;
 * blocked = "needs attention" (anything waiting on a human beyond review).
 */
export type BoardStatus =
  | 'backlog'
  | 'planning'
  | 'queued'
  | 'running'
  | 'checking'
  | 'review'
  | 'merging'
  | 'done'
  | 'blocked';

export type BoardLaunchPlan = {
  goalDefinition: string;
  deliverable: 'pr' | 'report';
  review: 'human' | 'green';
  rationale: string;
  evaluatedBy?: string;
};

export type BoardEvaluation = {
  status: 'running' | 'done' | 'failed';
  plan: BoardLaunchPlan | null;
  error: string | null;
};

export type BoardPullRequest = {
  number: number;
  owner: string | null;
  repo: string | null;
  url: string | null;
  state: string;
  merged: boolean;
  draft: boolean;
  mergeable: boolean | null;
  checks: string;
  headSha: string | null;
};

export type BoardMergeQueue = {
  state: 'queued' | 'merging' | 'rebasing';
  enqueuedAt: number;
  rebaseAttempts?: number;
};

export type BoardCheck = {
  stage: string;
  at: number;
  error?: string | null;
};

export type BoardConfig = {
  defaultModel: string | null;
  maxConcurrent: number;
  automationDefault: 'plan' | 'auto';
  mergeRetries: number;
  maxAttempts: number;
  checkRetries: number;
};

export type BoardTask = {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  status: BoardStatus;
  labels: string[];
  sessionIds: string[];
  evaluation?: BoardEvaluation | null;
  branch?: string | null;
  pr?: BoardPullRequest | null;
  queue?: BoardMergeQueue | null;
  check?: BoardCheck | null;
  checkAttempts?: number;
  blockedReason?: string | null;
  queuedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export const BOARD_STATUSES: readonly BoardStatus[] = Object.freeze([
  'backlog',
  'planning',
  'queued',
  'running',
  'checking',
  'review',
  'merging',
  'done',
  'blocked',
] as const);

export const BOARD_STATUS_BY_VALUE: Record<string, BoardStatus> = Object.fromEntries(
  BOARD_STATUSES.map((status) => [status, status]),
);

export const BOARD_STATUS_LABEL_KEYS = {
  backlog: 'board.status.backlog',
  planning: 'board.status.planning',
  queued: 'board.status.queued',
  running: 'board.status.running',
  checking: 'board.status.checking',
  review: 'board.status.review',
  merging: 'board.status.merging',
  done: 'board.status.done',
  blocked: 'board.status.blocked',
} satisfies Record<BoardStatus, I18nKey>;

/** Columns where manual stepping makes sense (never across agent gates). */
const MANUAL_MOVEABLE: readonly BoardStatus[] = Object.freeze(['backlog', 'review'] as const);

export const nextStatus = (status: BoardStatus): BoardStatus | null => {
  if (!MANUAL_MOVEABLE.includes(status)) return null;
  const index = BOARD_STATUSES.indexOf(status);
  const next = index >= 0 ? BOARD_STATUSES[index + 1] : undefined;
  // Humans step backlog→planning and review→done; agent gates in between are
  // owned by the pipeline (approve/dispatch/check/merge actions instead).
  if (status === 'review') return 'done';
  return next ?? null;
};

export const previousStatus = (status: BoardStatus): BoardStatus | null => {
  if (!MANUAL_MOVEABLE.includes(status)) return null;
  if (status === 'review') return null;
  const index = BOARD_STATUSES.indexOf(status);
  return index > 0 ? BOARD_STATUSES[index - 1] : null;
};

/** Newest-touched first inside each column. */
export const groupTasksByStatus = (tasks: readonly BoardTask[]) => {
  const groups = new Map<BoardStatus, BoardTask[]>(
    BOARD_STATUSES.map((status): [BoardStatus, BoardTask[]] => [status, []]),
  );
  for (const task of tasks) groups.get(task.status)?.push(task);
  for (const status of BOARD_STATUSES) groups.get(status)?.sort((a, b) => b.updatedAt - a.updatedAt);
  return groups;
};

/** `projectId === null` means "all projects" (including unassigned tasks). */
export const filterTasksByProject = (
  tasks: readonly BoardTask[],
  projectId: string | null,
): BoardTask[] => (projectId === null ? [...tasks] : tasks.filter((task) => task.projectId === projectId));

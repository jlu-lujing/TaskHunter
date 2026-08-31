import type { I18nKey } from '@/lib/i18n';

export type BoardStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

export type BoardTask = {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  status: BoardStatus;
  labels: string[];
  sessionIds: string[];
  createdAt: number;
  updatedAt: number;
};

export const BOARD_STATUSES: readonly BoardStatus[] = Object.freeze([
  'backlog',
  'ready',
  'in_progress',
  'review',
  'done',
] as const);

export const BOARD_STATUS_BY_VALUE: Record<string, BoardStatus> = Object.fromEntries(
  BOARD_STATUSES.map((status) => [status, status]),
);

export const BOARD_STATUS_LABEL_KEYS = {
  backlog: 'board.status.backlog',
  ready: 'board.status.ready',
  in_progress: 'board.status.inProgress',
  review: 'board.status.review',
  done: 'board.status.done',
} satisfies Record<BoardStatus, I18nKey>;

export const nextStatus = (status: BoardStatus): BoardStatus | null => {
  const index = BOARD_STATUSES.indexOf(status);
  return index >= 0 && index < BOARD_STATUSES.length - 1 ? BOARD_STATUSES[index + 1] : null;
};

export const previousStatus = (status: BoardStatus): BoardStatus | null => {
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

import { TaskHunterControlError } from '../taskhunter-control/error.js';

const asReason = (value) => {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason) {
    throw new TaskHunterControlError('reason is required — say what you found or what is stopping you', 400);
  }
  return reason.slice(0, 300);
};

/**
 * Worker-receipt execution path.
 *
 * The agent-tool callback carries the calling session's directory, and a board
 * worker only ever runs in its card's worktree, so the task is resolved from
 * the directory: the worker never handles task ids, and any other session —
 * including one bound to a card that has already settled — is refused.
 */
export const executeBoardAgentAction = async ({ getBoardService }, action, input = {}, contextDirectory) => {
  const service = getBoardService?.();
  if (!service) {
    throw new TaskHunterControlError('The board is not available yet — try again in a moment', 503);
  }
  const directory = typeof contextDirectory === 'string' ? contextDirectory.trim() : '';
  if (!directory) {
    throw new TaskHunterControlError('board actions run only inside a board worker session', 403);
  }
  const { tasks } = await service.list();
  const task = tasks.find((entry) => entry.sessionDirectoryRef === directory
    && ['running', 'checking'].includes(entry.status));
  if (!task) {
    throw new TaskHunterControlError(
      'This session is not bound to a working board card — board receipt actions are only available in sessions started from the board',
      403,
    );
  }

  if (action === 'board.finish') return service.workerFinish(task.id);
  if (action === 'board.noop') return service.workerNoop(task.id, asReason(input.reason));
  if (action === 'board.blocked') return service.blockTask(task.id, `worker reports it is blocked: ${asReason(input.reason)}`);
  throw new TaskHunterControlError(`Unknown board action: ${action}`, 400);
};

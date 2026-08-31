import { toast } from '@/components/ui';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { BoardTask } from '@/components/views/BoardView/boardModel';

type TranslateFn = (key: I18nKey, params?: I18nParams) => string;

export function buildBoardTaskContextText(task: BoardTask): string {
  const payload = {
    id: task.id,
    title: task.title,
    description: task.description,
    labels: task.labels,
    status: task.status,
  };
  return `TaskHunter board task context (JSON)\n${JSON.stringify(payload, null, 2)}`;
}

/**
 * Claim a board task through the server dispatcher: capacity gate, forced
 * worktree, lease bookkeeping, and prompt dispatch all happen server-side.
 */
export async function startBoardTaskSession(args: {
  task: BoardTask;
  t: TranslateFn;
}): Promise<boolean> {
  const { task, t } = args;
  try {
    const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(task.id)}/claim`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      // SAFETY: board routes guarantee the { error: string } shape on failures.
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || t('board.claim.toast.startFailed'));
    }
    // SAFETY: the claim route always returns { sessionId, sessionDirectory }.
    const result = (await response.json()) as { sessionId: string; sessionDirectory: string | null };

    useUIStore.getState().closeMainSurfaces();
    useUIStore.getState().setSessionSwitcherOpen(false);
    useSessionUIStore.getState().setCurrentSession(result.sessionId, result.sessionDirectory ?? undefined);

    toast.success(t('board.claim.toast.sessionStarted'));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t('board.claim.toast.startFailed'), { description: message });
    return false;
  }
}

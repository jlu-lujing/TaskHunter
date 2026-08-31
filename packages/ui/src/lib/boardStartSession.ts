import { toast } from '@/components/ui';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import { resolveSessionLaunchSelection } from '@/lib/defaultSessionSelection';
import { useBoardStore } from '@/stores/useBoardStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import * as sessionActions from '@/sync/session-actions';
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
 * Claim a board task: start a session in the task's project, send the task
 * as the first message, and link the session back (status -> in_progress).
 */
export async function startBoardTaskSession(args: {
  task: BoardTask;
  t: TranslateFn;
}): Promise<boolean> {
  const { task, t } = args;
  const project = useProjectsStore.getState().projects.find((entry) => entry.id === task.projectId);
  if (!project) {
    toast.error(t('board.claim.error.noProject'));
    return false;
  }

  try {
    const session = await sessionActions.createSession(task.title, project.path, null);
    const sessionId = session?.id;
    if (!sessionId) {
      throw new Error('Failed to create session');
    }

    try {
      useSessionUIStore.getState().initializeNewTaskHunterSession(sessionId, useConfigStore.getState().agents);
    } catch {
      // best-effort, mirrors the Linear claim flow
    }

    const boardStore = useBoardStore.getState();
    void boardStore.updateTask(task.id, { addSessionId: sessionId, status: 'in_progress' });

    useUIStore.getState().closeMainSurfaces();
    useUIStore.getState().setSessionSwitcherOpen(false);

    const { providerID, modelID, agentName, variant } = resolveSessionLaunchSelection();
    if (!providerID || !modelID) {
      toast.error(t('board.claim.error.noModelSelected'));
      return true;
    }

    void useSessionUIStore.getState().sendMessage(
      task.title,
      providerID,
      modelID,
      agentName,
      undefined,
      undefined,
      [{ text: buildBoardTaskContextText(task), synthetic: true }],
      variant,
      undefined,
      { sessionId, directory: project.path },
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t('board.claim.toast.sendTaskFailed'), { description: message });
    });

    toast.success(t('board.claim.toast.sessionStarted'));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(t('board.claim.toast.startFailed'), { description: message });
    return false;
  }
}

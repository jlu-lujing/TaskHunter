import { create } from 'zustand';
import { runtimeFetch } from '@/lib/runtime-fetch';
import type { BoardConfig } from '@/components/views/BoardView/boardModel';
import type { BoardStatus, BoardTask } from '@/components/views/BoardView/boardModel';

type BoardLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type BoardCreateInput = {
  title: string;
  description?: string;
  status?: BoardStatus;
  projectId?: string | null;
  labels?: string[];
};

type BoardUpdateInput = Partial<BoardCreateInput> & {
  sessionIds?: string[];
  addSessionId?: string;
};

type BoardStore = {
  tasks: BoardTask[];
  config: BoardConfig | null;
  loadState: BoardLoadState;
  loadError: string | null;
  /** True while a create/update/delete round-trip is in flight. */
  mutating: boolean;
  mutationError: string | null;
  load: (force?: boolean) => Promise<void>;
  createTask: (input: BoardCreateInput) => Promise<boolean>;
  updateTask: (taskId: string, patch: BoardUpdateInput) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  evaluateTask: (taskId: string) => Promise<boolean>;
  initRepo: (taskId: string) => Promise<'created' | 'already' | 'failed'>;
  taskAction: (taskId: string, action: 'approve' | 'retryEvaluation' | 'merge' | 'accept' | 'return', note?: string | null) => Promise<boolean>;
  updateConfig: (patch: Partial<BoardConfig>) => Promise<boolean>;
};

// Board API failure contract: server routes always serialize { error: string }.
const readError = async (response: Response, fallback: string): Promise<string> => {
  // SAFETY: board routes (server/lib/board) guarantee the { error: string } shape on non-2xx responses.
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ? String(data.error) : fallback;
};

export const useBoardStore = create<BoardStore>()((set, get) => {
  const applyTask = (task: BoardTask) => {
    set((state) => {
      const index = state.tasks.findIndex((entry) => entry.id === task.id);
      if (index < 0) return { tasks: [...state.tasks, task] };
      const next = [...state.tasks];
      next[index] = task;
      return { tasks: next };
    });
  };

  /** Optimistic writes failed or the server disagreed — resync from source. */
  const resync = async () => {
    try {
      const response = await runtimeFetch('/api/board', { headers: { Accept: 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data?.tasks)) set({ tasks: data.tasks, config: data.config ?? get().config });
      }
    } catch {
      // Keep the last known board; the next load attempt recovers.
    }
  };

  return {
    tasks: [],
    config: null,
    loadState: 'idle',
    loadError: null,
    mutating: false,
    mutationError: null,

    load: async (force = false) => {
      const { loadState } = get();
      if (!force && (loadState === 'loading' || loadState === 'ready')) return;
      set({ loadState: 'loading', loadError: null });
      try {
        const response = await runtimeFetch('/api/board', { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(await readError(response, 'Failed to load board'));
        }
        const data = await response.json();
        if (!Array.isArray(data?.tasks)) throw new Error('Malformed board response');
        set({ tasks: data.tasks, config: data.config ?? null, loadState: 'ready' });
      } catch (error) {
        set({
          loadState: 'error',
          loadError: error instanceof Error ? error.message : 'Failed to load board',
        });
      }
    },

    createTask: async (input) => {
      set({ mutating: true, mutationError: null });
      try {
        const response = await runtimeFetch('/api/board/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input),
        });
        if (!response.ok) throw new Error(await readError(response, 'Failed to create task'));
        const data = await response.json();
        applyTask(data.task);
        return true;
      } catch (error) {
        set({ mutationError: error instanceof Error ? error.message : 'Failed to create task' });
        return false;
      } finally {
        set({ mutating: false });
      }
    },

    updateTask: async (taskId, patch) => {
      // Optimistic: cards move instantly (drag-free status buttons).
      const snapshot = get().tasks;
      const current = snapshot.find((task) => task.id === taskId);
      if (current) {
        const optimistic: BoardTask = { ...current };
        if (patch.title !== undefined) optimistic.title = patch.title;
        if (patch.description !== undefined) optimistic.description = patch.description;
        if (patch.status !== undefined) optimistic.status = patch.status;
        if (patch.projectId !== undefined) optimistic.projectId = patch.projectId;
        if (patch.labels !== undefined) optimistic.labels = patch.labels;
        if (patch.sessionIds !== undefined) optimistic.sessionIds = patch.sessionIds;
        if (patch.addSessionId !== undefined && !current.sessionIds.includes(patch.addSessionId)) {
          optimistic.sessionIds = [...current.sessionIds, patch.addSessionId];
        }
        applyTask(optimistic);
      }
      set({ mutating: true, mutationError: null });
      try {
        const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error(await readError(response, 'Failed to update task'));
        const data = await response.json();
        applyTask(data.task);
        return true;
      } catch (error) {
        // Isolated rollback: only revert the targeted card, keep concurrent changes on other cards.
        set((state) => ({
          tasks: state.tasks.map((entry) => (entry.id === taskId ? (snapshot.find((item) => item.id === taskId) ?? entry) : entry)),
        }));
        set({ mutationError: error instanceof Error ? error.message : 'Failed to update task' });
        return false;
      } finally {
        set({ mutating: false });
      }
    },

    taskAction: async (taskId, action, note = null) => {
      set({ mutating: true, mutationError: null });
      try {
        const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(taskId)}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(note ? { action, note } : { action }),
        });
        if (!response.ok) throw new Error(await readError(response, 'Failed to apply task action'));
        const data = await response.json();
        applyTask(data.task);
        return true;
      } catch (error) {
        set({ mutationError: error instanceof Error ? error.message : 'Failed to apply task action' });
        return false;
      } finally {
        set({ mutating: false });
      }
    },

    updateConfig: async (patch) => {
      set({ mutationError: null });
      try {
        const response = await runtimeFetch('/api/board/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!response.ok) throw new Error(await readError(response, 'Failed to update board settings'));
        const data = await response.json();
        if (data.config) set({ config: data.config });
        return true;
      } catch (error) {
        set({ mutationError: error instanceof Error ? error.message : 'Failed to update board settings' });
        return false;
      }
    },

    evaluateTask: async (taskId) => {
      try {
        const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(taskId)}/evaluate`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        // Failures land on the card as evaluation.status 'failed'; resync shows them.
        await resync();
        return response.ok;
      } catch {
        await resync();
        return false;
      }
    },

    initRepo: async (taskId) => {
      try {
        const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(taskId)}/init-repo`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          set({ mutationError: await readError(response, 'Failed to initialize git repository') });
          await resync();
          return 'failed';
        }
        const data = await response.json().catch(() => null);
        await resync();
        return data?.initialized ? 'created' : 'already';
      } catch (error) {
        set({ mutationError: error instanceof Error ? error.message : 'Failed to initialize git repository' });
        await resync();
        return 'failed';
      }
    },

    deleteTask: async (taskId) => {
      set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId) }));
      set({ mutating: true, mutationError: null });
      try {
        const response = await runtimeFetch(`/api/board/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(await readError(response, 'Failed to delete task'));
        return true;
      } catch (error) {
        set({ mutationError: error instanceof Error ? error.message : 'Failed to delete task' });
        await resync();
        return false;
      } finally {
        set({ mutating: false });
      }
    },
  };
});

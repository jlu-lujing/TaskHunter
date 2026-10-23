import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';
import type { I18nKey } from '@/lib/i18n';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useSessionUIStore } from '@/sync/session-ui-store';
import {
  buildActiveSessionTreeFromCache,
  collectSessionMoveDescendants,
  collectSessionSubtreeIds,
  runSessionSubtreeAction,
  undoArchive,
  type SessionSubtreeStore,
} from './sessionSubtreeActions';

const session = (id: string): Session => ({
  id,
  projectID: 'project',
  title: id,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  directory: '/workspace',
  time: { created: 1, updated: 1 },
});

const t = (key: I18nKey) => key;

const linked = (id: string, parentID: string | null, archived?: number): Session => {
  // SAFETY: the subtree walks read only id, parentID, and time.archived.
  return { ...session(id), parentID, time: { created: 1, updated: 1, ...(archived ? { archived } : {}) } } as Session;
};

const resetGlobalSessions = () => {
  useGlobalSessionsStore.setState({
    activeSessions: [],
    archivedSessions: [],
    sessionsByDirectory: new Map(),
    entityById: new Map(),
    structure: {
      activeSessionIds: [],
      activeRootIds: [],
      activeChildrenByParentId: new Map(),
      activeIdsByDirectory: new Map(),
    },
    hasLoaded: false,
    status: 'idle',
  });
};

type Call = { method: keyof SessionSubtreeStore; ids: string[] };

const createStore = (failing: string[] = []) => {
  const calls: Call[] = [];
  const store: SessionSubtreeStore = {
    archiveSession: async (id) => {
      calls.push({ method: 'archiveSession', ids: [id] });
      return !failing.includes(id);
    },
    archiveSessions: async (ids) => {
      calls.push({ method: 'archiveSessions', ids });
      return {
        archivedIds: ids.filter((id) => !failing.includes(id)),
        failedIds: ids.filter((id) => failing.includes(id)),
      };
    },
    deleteSession: async (id) => {
      calls.push({ method: 'deleteSession', ids: [id] });
      return !failing.includes(id);
    },
    deleteSessions: async (ids) => {
      calls.push({ method: 'deleteSessions', ids });
      return {
        deletedIds: ids.filter((id) => !failing.includes(id)),
        failedIds: ids.filter((id) => failing.includes(id)),
      };
    },
  };
  return { calls, store };
};

describe('runSessionSubtreeAction', () => {
  test('archives a childless session through the single-session action', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('archive', session('root'), [], store, t);

    expect(calls).toEqual([{ method: 'archiveSession', ids: ['root'] }]);
    expect(outcome).toEqual({ succeededIds: ['root'], failedIds: [] });
  });

  test('reports a childless session the server refused to archive', async () => {
    const { store } = createStore(['root']);

    const outcome = await runSessionSubtreeAction('archive', session('root'), [], store, t);

    expect(outcome).toEqual({ succeededIds: [], failedIds: ['root'] });
  });

  test('archives the root together with every descendant in one batch', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('archive', session('root'), ['child', 'grandchild'], store, t);

    expect(calls).toEqual([{ method: 'archiveSessions', ids: ['root', 'child', 'grandchild'] }]);
    expect(outcome).toEqual({ succeededIds: ['root', 'child', 'grandchild'], failedIds: [] });
  });

  test('keeps the archived part of a subtree when one descendant fails', async () => {
    const { store } = createStore(['grandchild']);

    const outcome = await runSessionSubtreeAction('archive', session('root'), ['child', 'grandchild'], store, t);

    expect(outcome).toEqual({ succeededIds: ['root', 'child'], failedIds: ['grandchild'] });
  });

  test('deletes a childless session through the single-session action', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('delete', session('root'), [], store, t);

    expect(calls).toEqual([{ method: 'deleteSession', ids: ['root'] }]);
    expect(outcome).toEqual({ succeededIds: ['root'], failedIds: [] });
  });

  test('deletes the root together with every descendant in one batch', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('delete', session('root'), ['child', 'grandchild'], store, t);

    expect(calls).toEqual([{ method: 'deleteSessions', ids: ['root', 'child', 'grandchild'] }]);
    expect(outcome).toEqual({ succeededIds: ['root', 'child', 'grandchild'], failedIds: [] });
  });

  test('reports the descendant a subtree delete could not remove', async () => {
    const { store } = createStore(['grandchild']);

    const outcome = await runSessionSubtreeAction('delete', session('root'), ['child', 'grandchild'], store, t);

    expect(outcome).toEqual({ succeededIds: ['root', 'child'], failedIds: ['grandchild'] });
  });
});

describe('collectSessionSubtreeIds', () => {
  beforeEach(resetGlobalSessions);

  test('reaches an active session below an archived intermediate and skips the intermediate for archive', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('archived-child', 'root', 5),
      linked('leaf', 'archived-child'),
    ]);

    expect(collectSessionSubtreeIds('root', [], false)).toEqual(['leaf']);
  });

  test('includes archived descendants for delete', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('archived-child', 'root', 5),
      linked('leaf', 'archived-child'),
    ]);

    expect(collectSessionSubtreeIds('root', [], true)).toEqual(['archived-child', 'leaf']);
  });

  test('keeps descendants the surface already knows that the global cache has not seen', () => {
    useGlobalSessionsStore.getState().upsertSessions([linked('root', null), linked('cached-child', 'root')]);

    expect(collectSessionSubtreeIds('root', ['live-child', 'cached-child'], false)).toEqual(['live-child', 'cached-child']);
  });
});

describe('buildActiveSessionTreeFromCache', () => {
  beforeEach(resetGlobalSessions);

  test('builds the nested active tree a flat row does not render', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('grandchild', 'child'),
      linked('archived-child', 'root', 5),
      linked('below-archived', 'archived-child'),
    ]);

    const tree = buildActiveSessionTreeFromCache(linked('root', null));
    expect(tree.session.id).toBe('root');
    expect(tree.children.map((child) => child.session.id)).toEqual(['child']);
    expect(tree.children[0].children.map((child) => child.session.id)).toEqual(['grandchild']);
    expect(tree.children[0].children[0].children).toEqual([]);
  });
});

describe('collectSessionMoveDescendants', () => {
  const ids = (sessions: Session[]) => sessions.map((entry) => entry.id);

  beforeEach(resetGlobalSessions);

  test('a flat row with no rendered children still takes the whole active tree', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('grandchild', 'child'),
    ]);

    expect(ids(collectSessionMoveDescendants(linked('root', null), []))).toEqual(['child', 'grandchild']);
  });

  test('stops at an archived session, as the project tree does', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('archived-child', 'root', 5),
      linked('below-archived', 'archived-child'),
    ]);

    expect(ids(collectSessionMoveDescendants(linked('root', null), []))).toEqual(['child']);
  });

  test('keeps the rendered descendants and their order, adding what only the cache knows', () => {
    const rendered = linked('live-child', 'root');
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('live-child', 'root'),
      linked('cached-grandchild', 'live-child'),
    ]);

    const descendants = collectSessionMoveDescendants(linked('root', null), [rendered]);
    expect(ids(descendants)).toEqual(['live-child', 'cached-grandchild']);
    expect(descendants[0]).toBe(rendered);
  });
});

describe('undoArchive', () => {
  const original = useSessionUIStore.getState();
  const restored: string[][] = [];
  const opened: Array<{ id: string | null; directory: string | null | undefined }> = [];

  beforeEach(() => {
    restored.length = 0;
    opened.length = 0;
    useGlobalSessionsStore.getState().upsertSessions([session('root')]);
    useSessionUIStore.setState({
      currentSessionId: null,
      unarchiveSessions: async (ids) => {
        restored.push(ids);
        return { restoredIds: ids, failedIds: [] };
      },
      setCurrentSession: (id, directory) => {
        opened.push({ id, directory });
      },
    });
  });

  afterEach(() => {
    useSessionUIStore.setState({
      currentSessionId: original.currentSessionId,
      unarchiveSessions: original.unarchiveSessions,
      setCurrentSession: original.setCurrentSession,
    });
  });

  const undo = (reopenId: string | null) => undoArchive(['root', 'child'], reopenId, getRuntimeKey(), t);

  test('restores exactly the archived sessions and reopens the session the archive closed', async () => {
    await undo('root');

    expect(restored).toEqual([['root', 'child']]);
    expect(opened).toEqual([{ id: 'root', directory: '/workspace' }]);
  });

  test('does not take the user away from a session opened after the archive', async () => {
    useSessionUIStore.setState({ currentSessionId: 'other' });

    await undo('root');

    expect(restored).toEqual([['root', 'child']]);
    expect(opened).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { opencodeClient } from '@/lib/opencode/client';
import type { Session } from '@/lib/opencode/model';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import {
  applyGlobalSessionStatusEvent,
  replaceGlobalSessionStatusById,
  useGlobalSessionStatusStore,
} from './global-session-status';
import {
  HOST_STATUS_SEED_MAX_AGE_MS,
  buildHostStatusSeedEvents,
  seedGlobalSessionStatusFromHost,
} from './host-session-status-seed';
import { resetSessionOrdering } from './session-ordering';
import { resetSessionActivityTiming } from './session-activity-timing';
import { applyGlobalBlockingRequestEvents, applyWaitingPageEvent, resetGlobalBlockingRequests, useGlobalBlockingRequestsStore } from './global-blocking-requests';

const NOW = 1_700_000_000_000;
const deferredSnapshot = () => {
  type Snapshot = Awaited<ReturnType<typeof opencodeClient.getHostSessionStatusSnapshot>>;
  let resolve!: (value: Snapshot) => void;
  const promise = new Promise<Snapshot>(complete => { resolve = complete; });
  return { promise, resolve };
};

const session = (id: string, directory: string): Session => ({
  id, directory, projectID: 'project', title: id,
  time: { created: 1, updated: 1 }, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});

describe('buildHostStatusSeedEvents', () => {
  test('adds busy and retry entries as busy, grouped by resolved directory', () => {
    const events = buildHostStatusSeedEvents({
      serverTime: NOW,
      sessions: {
        a: { status: 'busy', lastUpdateAt: NOW - 1_000 },
        b: { status: 'retry', lastUpdateAt: NOW - 1_000 },
        c: { status: 'idle', lastUpdateAt: NOW },
      },
    }, {
      isKnown: () => false,
      resolveDirectory: (id) => (id === 'a' ? '/repo' : id === 'b' ? '/other' : null),
    });

    expect([...events.keys()]).toEqual(['/repo', '/other']);
    expect(events.get('/repo')).toEqual([{
      type: 'session.status',
      properties: { sessionID: 'a', status: { type: 'busy' } },
    }]);
    expect(events.get('/other')?.[0]?.properties).toEqual({ sessionID: 'b', status: { type: 'busy' } });
  });

  test('skips sessions the client already observed, stale entries, and unresolved directories', () => {
    const events = buildHostStatusSeedEvents({
      serverTime: NOW,
      sessions: {
        known: { status: 'busy', lastUpdateAt: NOW },
        stale: { status: 'busy', lastUpdateAt: NOW - HOST_STATUS_SEED_MAX_AGE_MS - 1 },
        fresh: { status: 'busy', lastUpdateAt: NOW - HOST_STATUS_SEED_MAX_AGE_MS },
        unplaced: { status: 'busy', lastUpdateAt: NOW },
      },
    }, {
      isKnown: (id) => id === 'known',
      resolveDirectory: (id) => (id === 'unplaced' ? null : '/repo'),
    });

    expect([...events.keys()]).toEqual(['/repo']);
    expect(events.get('/repo')).toEqual([{
      type: 'session.status',
      properties: { sessionID: 'fresh', status: { type: 'busy' } },
    }]);
  });
});

describe('seedGlobalSessionStatusFromHost', () => {
  let originalGetSnapshot: typeof opencodeClient.getHostSessionStatusSnapshot;
  let snapshot: Awaited<ReturnType<typeof opencodeClient.getHostSessionStatusSnapshot>>;
  let requests = 0;

  beforeEach(() => {
    resetGlobalBlockingRequests();
    replaceGlobalSessionStatusById(new Map());
    resetSessionOrdering();
    resetSessionActivityTiming();
    requests = 0;
    originalGetSnapshot = opencodeClient.getHostSessionStatusSnapshot;
    opencodeClient.getHostSessionStatusSnapshot = async () => {
      requests += 1;
      return snapshot;
    };
    useGlobalSessionsStore.getState().applySnapshot([
      session('busy-elsewhere', '/unopened'),
      session('settled-here', '/repo'),
    ], [], 'ready');
  });

  afterEach(() => {
    resetGlobalBlockingRequests();
    opencodeClient.getHostSessionStatusSnapshot = originalGetSnapshot;
    replaceGlobalSessionStatusById(new Map());
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  });

  test('seeds an unopened directory session and never overrides a live observation', async () => {
    // A live idle arrived for this session before the host answered: the host
    // still lists it busy (its map lags), and the seed must not resurrect it.
    applyGlobalSessionStatusEvent('/repo', { type: 'session.idle', properties: { sessionID: 'settled-here' } });
    snapshot = {
      serverTime: NOW,
      sessions: {
        'busy-elsewhere': { status: 'busy', lastUpdateAt: NOW },
        'settled-here': { status: 'busy', lastUpdateAt: NOW },
      },
    };

    await seedGlobalSessionStatusFromHost();

    const state = useGlobalSessionStatusStore.getState();
    expect(state.statusById.get('busy-elsewhere')).toEqual({ status: { type: 'busy' }, directory: '/unopened' });
    expect(state.statusById.has('settled-here')).toBe(false);
    expect([...state.activeSessionIds]).toEqual(['busy-elsewhere']);
  });

  test('a failed fetch and an absent entry leave existing activity untouched', async () => {
    applyGlobalSessionStatusEvent('/repo', { type: 'session.status', properties: { sessionID: 'settled-here', status: { type: 'busy' } } });
    snapshot = null;
    await seedGlobalSessionStatusFromHost();
    expect(useGlobalSessionStatusStore.getState().statusById.has('settled-here')).toBe(true);

    snapshot = { serverTime: NOW, sessions: {} };
    await seedGlobalSessionStatusFromHost();
    expect(useGlobalSessionStatusStore.getState().statusById.has('settled-here')).toBe(true);
  });

  test('coalesces overlapping calls into one request', async () => {
    snapshot = { serverTime: NOW, sessions: {} };
    await Promise.all([seedGlobalSessionStatusFromHost(), seedGlobalSessionStatusFromHost()]);
    expect(requests).toBe(1);
    await seedGlobalSessionStatusFromHost();
    expect(requests).toBe(2);
  });

  const waitingPage = (id: string, sessionID = 'settled-here') => ({ id, sessionID, title: 'Services page binding' });
  const askPage = (id: string, sessionID = 'settled-here', directory = '/repo') => applyWaitingPageEvent({
    type: 'openchamber.page-waiting', properties: { sessionID, directory, page: waitingPage(id, sessionID) },
  }, () => null);
  const settlePage = (id: string, sessionID = 'settled-here') => applyWaitingPageEvent({
    type: 'openchamber.page-settled', properties: { sessionID, pageID: id },
  }, () => null);
  const pages = (sessionID = 'settled-here') => useGlobalBlockingRequestsStore.getState().bySession.get(sessionID)?.pages ?? [];
  const pending = (ids: string[]) => ({ permissions: [], forms: [], pages: ids.map(id => waitingPage(id)) });

  test('a delayed snapshot cannot resurrect a page settled while the request was in flight', async () => {
    const deferred = deferredSnapshot();
    opencodeClient.getHostSessionStatusSnapshot = () => deferred.promise;
    askPage('answered');
    const load = seedGlobalSessionStatusFromHost();
    settlePage('answered');
    deferred.resolve({ serverTime: NOW, sessions: {}, pending: { 'settled-here': pending(['answered', 'still-waiting']) } });
    await load;

    expect(pages().map(page => page.id)).toEqual(['still-waiting']);
  });

  test('records a settled page even when its waiting event was missed', async () => {
    const deferred = deferredSnapshot();
    opencodeClient.getHostSessionStatusSnapshot = () => deferred.promise;
    const load = seedGlobalSessionStatusFromHost();
    settlePage('answered');
    deferred.resolve({ serverTime: NOW, sessions: {}, pending: { 'settled-here': pending(['answered']) } });
    await load;
    expect(pages()).toEqual([]);
  });

  test('a complete empty host snapshot clears stale pages without clearing forms, permissions or space pages', async () => {
    askPage('answered');
    askPage('space-page', 'space-session', '/spaces/0123456789ab/project');
    applyGlobalBlockingRequestEvents('/repo', [
      { type: 'permission.asked', properties: { id: 'permission', sessionID: 'settled-here', action: 'bash', resources: [] } },
      { type: 'form.created', properties: { form: { id: 'form', sessionID: 'settled-here', title: 'Answer', fields: [{ key: 'answer', type: 'boolean' }] } } },
    ]);
    snapshot = { serverTime: NOW, sessions: {}, pending: {} };
    await seedGlobalSessionStatusFromHost();

    expect(pages()).toEqual([]);
    expect(pages('space-session').map(page => page.id)).toEqual(['space-page']);
    const entry = useGlobalBlockingRequestsStore.getState().bySession.get('settled-here');
    expect(entry?.permissions.map(request => request.id)).toEqual(['permission']);
    expect(entry?.forms.map(request => request.id)).toEqual(['form']);
  });

  test('a new page arriving during an empty snapshot read stays visible', async () => {
    const deferred = deferredSnapshot();
    opencodeClient.getHostSessionStatusSnapshot = () => deferred.promise;
    askPage('stale');
    const load = seedGlobalSessionStatusFromHost();
    askPage('new');
    deferred.resolve({ serverTime: NOW, sessions: {}, pending: {} });
    await load;
    expect(pages().map(page => page.id)).toEqual(['new']);
  });

  test('a session deletion during the request prevents a stale page seed', async () => {
    const deferred = deferredSnapshot();
    opencodeClient.getHostSessionStatusSnapshot = () => deferred.promise;
    const load = seedGlobalSessionStatusFromHost();
    applyGlobalBlockingRequestEvents('/repo', [{ type: 'session.deleted', properties: { sessionID: 'settled-here' } }]);
    deferred.resolve({ serverTime: NOW, sessions: {}, pending: { 'settled-here': pending(['answered']) } });
    await load;
    expect(pages()).toEqual([]);
  });

  test('failed or unsupported snapshots preserve waiting pages', async () => {
    askPage('waiting');
    const before = useGlobalBlockingRequestsStore.getState().bySession;
    for (const response of [null, { serverTime: NOW, sessions: {} }]) {
      snapshot = response;
      await seedGlobalSessionStatusFromHost();
      expect(useGlobalBlockingRequestsStore.getState().bySession).toBe(before);
    }
  });

  test('an unchanged snapshot preserves references and a reset rejects an old in-flight seed', async () => {
    askPage('waiting');
    snapshot = { serverTime: NOW, sessions: {}, pending: { 'settled-here': pending(['waiting']) } };
    const before = useGlobalBlockingRequestsStore.getState().bySession;
    await seedGlobalSessionStatusFromHost();
    expect(useGlobalBlockingRequestsStore.getState().bySession).toBe(before);

    const deferred = deferredSnapshot();
    opencodeClient.getHostSessionStatusSnapshot = () => deferred.promise;
    const load = seedGlobalSessionStatusFromHost();
    resetGlobalBlockingRequests();
    deferred.resolve(snapshot);
    await load;
    expect(pages()).toEqual([]);
  });
});

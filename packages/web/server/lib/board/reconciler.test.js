import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBoardService } from './service.js';
import { createBoardReconciler } from './reconciler.js';

let dataDir;
let clock;
let uuidCounter;
const NOW = 1_700_000_000_000;

const project = { id: 'p1', path: '/repo/alpha' };

const buildService = () => createBoardService({
  dataDir,
  readSettingsFromDiskMigrated: async () => ({ projects: [project] }),
  sanitizeProjects: (projects) => projects,
  randomUUID: () => `uuid-${uuidCounter++}`,
  now: () => clock,
});

const ghPr = (overrides = {}) => ({
  number: 42,
  html_url: 'https://github.com/o/r/pull/42',
  state: 'open',
  merged: false,
  draft: false,
  mergeable: true,
  mergeable_state: 'clean',
  head: { sha: 'abc123' },
  ...overrides,
});

const repo = { owner: 'o', repo: 'r' };

/** Running card with a linked worktree session. */
const runningTask = async (service, { branch = 'taskhunter/board-x', sessionId = 'ses_1' } = {}) => {
  const { task: created } = await service.create({ title: 'shipped task', projectId: 'p1', status: 'queued' });
  service.claim(created.id, { branch });
  service.linkSession(created.id, sessionId, '/repo/.wt/x');
  return service.loadDoc().tasks.find((entry) => entry.id === created.id);
};

const reviewCard = async (service, sessionId = 'ses_1') => {
  const task = await runningTask(service, { sessionId });
  service.enterChecking(task.id);
  service.moveToReview(task.id);
  return service.loadDoc().tasks.find((entry) => entry.id === task.id);
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-recon-'));
  clock = NOW;
  uuidCounter = 0;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('board reconciler', () => {
  it('heartbeats the lease while the session is busy', async () => {
    const service = buildService();
    const task = await runningTask(service);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'busy' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      now: () => clock,
    });

    clock += 20 * 60_000;
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('running');
    expect(after.lease.expiresAt).toBeGreaterThan(clock);
  });

  it('hands idle-past-grace sessions to the checker', async () => {
    const service = buildService();
    const task = await runningTask(service);
    const checker = { checkTask: vi.fn(async (t) => t), attemptRebase: vi.fn(async () => {}) };
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      checker,
      idleGraceMs: 2 * 60_000,
      now: () => clock,
    });

    clock += 60_000; // within grace: still running
    await reconciler.reconcilePass();
    expect(service.loadDoc().tasks[0].status).toBe('running');
    expect(checker.checkTask).not.toHaveBeenCalled();

    clock += 3 * 60_000; // past grace: enter checking, checker judges it
    await reconciler.reconcilePass();
    expect(checker.checkTask).toHaveBeenCalledTimes(1);
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).not.toBe('running'); // checker (mock) left it in checking
  });

  it('returns a card to Running when its session wakes up during checking', async () => {
    const service = buildService();
    const task = await runningTask(service);
    service.enterChecking(task.id);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'busy' } }),
      now: () => clock,
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('running');
    expect(after.lease.sessionId).toBe('ses_1');
  });

  it('records normalized PR facts across the pipeline', async () => {
    const service = buildService();
    const task = await runningTask(service);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'busy' } }),
      resolvePr: async () => ({ repo, pr: ghPr() }),
      now: () => clock,
    });
    await reconciler.reconcilePass();
    expect(service.loadDoc().tasks[0].pr).toMatchObject({
      number: 42, owner: 'o', repo: 'r', checks: 'clean', mergeable: true, headSha: 'abc123',
    });
  });

  it('merges the queue strictly serially, oldest first', async () => {
    const service = buildService();
    const a = await reviewCard(service, 'ses_a');
    const b = await reviewCard(service, 'ses_b');
    service.setPr(a.id, { number: 1, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'a1' });
    service.setPr(b.id, { number: 2, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'b2' });
    service.taskAction(a.id, 'merge');
    service.taskAction(b.id, 'merge');

    const mergePr = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      mergePr,
      now: () => clock,
    });
    await reconciler.reconcilePass();
    expect(mergePr).toHaveBeenCalledTimes(1); // one merge in flight
    expect(mergePr.mock.calls[0][0]).toMatchObject({ number: 1 });

    await reconciler.reconcilePass();
    expect(mergePr).toHaveBeenCalledTimes(2);
    const after = service.loadDoc().tasks;
    expect(after.find((entry) => entry.id === a.id).status).toBe('done');
  });

  it('rebases behind/dirty merge-queue cards and blocks past mergeRetries', async () => {
    const service = buildService();
    const task = await reviewCard(service);
    service.setPr(task.id, { number: 7, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: false, checks: 'dirty', headSha: 'z' });
    service.taskAction(task.id, 'merge');

    const updateBranch = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      updateBranch,
      now: () => clock,
    });

    await reconciler.reconcilePass();
    expect(updateBranch).toHaveBeenCalledTimes(1);
    let after = service.loadDoc().tasks[0];
    expect(after.queue).toMatchObject({ state: 'rebasing', rebaseAttempts: 1 });

    service.setPr(task.id, { ...after.pr, mergeable: false, checks: 'dirty' });
    await reconciler.reconcilePass();
    after = service.loadDoc().tasks[0];
    expect(after.queue).toMatchObject({ state: 'rebasing', rebaseAttempts: 2 });

    service.setPr(task.id, { ...after.pr, mergeable: false, checks: 'dirty' });
    await reconciler.reconcilePass();
    after = service.loadDoc().tasks[0];
    expect(after.status).toBe('blocked');
    expect(after.blockedReason).toContain('merge conflict');
  });

  it('treats merge 405 as a conflict needing rebase', async () => {
    const service = buildService();
    const task = await reviewCard(service);
    service.setPr(task.id, { number: 8, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' });
    service.taskAction(task.id, 'merge');

    const updateBranch = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      mergePr: async () => { throw Object.assign(new Error('Method Not Allowed'), { status: 405 }); },
      updateBranch,
      now: () => clock,
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(updateBranch).toHaveBeenCalledTimes(1);
    expect(after.queue.state).toBe('rebasing');
    expect(after.status).toBe('merging');
  });

  it('keeps transient merge failures queued', async () => {
    const service = buildService();
    const task = await reviewCard(service);
    service.setPr(task.id, { number: 9, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' });
    service.taskAction(task.id, 'merge');

    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      mergePr: async () => { throw new Error('socket hang up'); },
      now: () => clock,
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('merging');
    expect(after.queue.state).toBe('queued');
  });

  it('dispatches queued cards through the injected dispatchPass', async () => {
    const service = buildService();
    await service.create({ title: 'queued one', projectId: 'p1', status: 'queued' });
    const dispatchPass = vi.fn(async () => ({ dispatched: [] }));
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      dispatchPass,
      now: () => clock,
    });
    await reconciler.reconcilePass();
    expect(dispatchPass).toHaveBeenCalledTimes(1);
  });
});

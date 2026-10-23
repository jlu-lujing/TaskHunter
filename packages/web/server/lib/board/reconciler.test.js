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

  it('routes a card whose worker session vanished (archived) to Review', async () => {
    const service = buildService();
    const task = await runningTask(service);
    const checker = { checkTask: vi.fn(async (t) => t), attemptRebase: vi.fn(async () => {}) };
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}), // archived sessions are not listed
      checker,
      now: () => clock,
    });

    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).toBe('review');
    expect(after.blockedReason).toContain('archived');
    expect(checker.checkTask).not.toHaveBeenCalled();
  });

  it('leaves a running card alone when session statuses cannot be fetched', async () => {
    const service = buildService();
    await runningTask(service);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => { throw new Error('directory unreachable'); },
      now: () => clock,
    });

    await reconciler.reconcilePass();
    expect(service.loadDoc().tasks[0].status).toBe('running');
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


describe('board delete guards', () => {
  it('refuses to delete running and merging cards', async () => {
    const service = buildService();
    const running = await runningTask(service, { sessionId: 'ses_r1' });
    await expect(service.remove(running.id)).rejects.toThrow(/being worked on/);

    const review = await reviewCard(service, 'ses_r2');
    service.setPr(review.id, { number: 4, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' });
    service.taskAction(review.id, 'merge');
    await expect(service.remove(review.id)).rejects.toThrow(/merge queue/);

    // settled cards delete fine
    service.markMerged(review.id);
    const { task } = await service.remove(review.id);
    expect(task.id).toBe(review.id);
  });
});

describe('board startup resume', () => {
  const resumeHarness = (overrides = {}) => {
    const service = buildService();
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      fetchSession: async () => ({ time: { updated: NOW } }),
      now: () => clock,
      ...overrides,
    });
    return { service, reconciler };
  };

  it('wakes running cards whose session is no longer live and refreshes the lease', async () => {
    const { service } = resumeHarness();
    const task = await runningTask(service);
    clock += 25 * 60_000; // lease already dead — the startup pass must revive it
    const resumeWorker = vi.fn(async () => true);
    const withResume = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      resumeWorker,
      now: () => clock,
    });

    const { resumed } = await withResume.resumeInterruptedPass();
    expect(resumeWorker).toHaveBeenCalledWith(expect.objectContaining({ id: task.id, sessionRef: 'ses_1' }));
    expect(resumed).toEqual([task.id]);
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('running'); // same card, same session — no fresh dispatch
    expect(after.lease.expiresAt).toBeGreaterThan(clock);
  });

  it('leaves cards whose worker is still live untouched', async () => {
    const { service } = resumeHarness();
    await runningTask(service);
    const resumeWorker = vi.fn(async () => true);
    const withResume = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'busy' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      resumeWorker,
      now: () => clock,
    });

    const { resumed } = await withResume.resumeInterruptedPass();
    expect(resumeWorker).not.toHaveBeenCalled();
    expect(resumed).toEqual([]);
  });

  it('is a no-op without a resume worker', async () => {
    const { service, reconciler } = resumeHarness();
    await runningTask(service);
    const { resumed } = await reconciler.resumeInterruptedPass();
    expect(resumed).toEqual([]);
  });

  it('survives a resume failure and leaves the card to the reclaim path', async () => {
    const { service } = resumeHarness();
    const task = await runningTask(service);
    const withResume = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      fetchSession: async () => ({ time: { updated: NOW } }),
      resumeWorker: async () => { throw new Error('opencode down'); },
      now: () => clock,
    });

    const { resumed } = await withResume.resumeInterruptedPass();
    expect(resumed).toEqual([]);
    expect(service.loadDoc().tasks[0].status).toBe('running');
    expect(service.loadDoc().tasks[0].id).toBe(task.id);
  });
});

describe('board user-interrupt recognition', () => {
  it('sends an interrupted worker to Review without a checker judge', async () => {
    const service = buildService();
    const task = await runningTask(service);
    const checker = { checkTask: vi.fn(async (t) => t), attemptRebase: vi.fn(async () => {}) };
    const fetchSessionInterrupted = vi.fn(async () => true);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      fetchSessionInterrupted,
      checker,
      now: () => clock,
    });

    clock += 60_000; // well inside the idle grace — an abort needs no waiting
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).toBe('review');
    expect(after.blockedReason).toContain('interrupted');
    expect(checker.checkTask).not.toHaveBeenCalled();
    expect(fetchSessionInterrupted).toHaveBeenCalledWith('ses_1', '/repo/.wt/x');
  });

  it('keeps the idle→checking flow when the probe says the worker ended normally', async () => {
    const service = buildService();
    await runningTask(service);
    const checker = { checkTask: vi.fn(async (t) => t), attemptRebase: vi.fn(async () => {}) };
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      fetchSessionInterrupted: async () => false,
      checker,
      idleGraceMs: 2 * 60_000,
      now: () => clock,
    });

    clock += 3 * 60_000; // past grace: normal judging
    await reconciler.reconcilePass();
    expect(checker.checkTask).toHaveBeenCalledTimes(1);
    expect(service.loadDoc().tasks[0].status).not.toBe('review');
  });

  it('treats a failing probe as "not interrupted" instead of stalling the pass', async () => {
    const service = buildService();
    await runningTask(service);
    const checker = { checkTask: vi.fn(async (t) => t), attemptRebase: vi.fn(async () => {}) };
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      fetchSessionInterrupted: async () => { throw new Error('opencode down'); },
      checker,
      idleGraceMs: 2 * 60_000,
      now: () => clock,
    });

    clock += 3 * 60_000;
    await reconciler.reconcilePass();
    expect(checker.checkTask).toHaveBeenCalledTimes(1);
  });
});

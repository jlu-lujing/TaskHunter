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

const readyTaskWithBranch = async (service, branch = 'taskhunter/board-x', sessionId = 'ses_1') => {
  const { task: created } = await service.create({ title: 'shipped task', projectId: 'p1', status: 'ready' });
  service.claim(created.id, { branch });
  service.linkSession(created.id, sessionId);
  return service.loadDoc().tasks.find((entry) => entry.id === created.id);
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
    const task = await readyTaskWithBranch(service);
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
    expect(after.status).toBe('in_progress');
    expect(after.lease.expiresAt).toBeGreaterThan(clock);
  });

  it('promotes to review when the session has been idle past the grace', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'idle' } }),
      fetchSession: async () => ({ time: { updated: NOW } }),
      idleGraceMs: 5 * 60_000,
      now: () => clock,
    });

    // idle but still within grace: stays in progress
    clock += 2 * 60_000;
    await reconciler.reconcilePass();
    expect(service.loadDoc().tasks[0].status).toBe('in_progress');

    clock += 4 * 60_000;
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('review');
    expect(after.lease).toBeNull();
  });

  it('records normalized PR facts on the card', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({ ses_1: { type: 'busy' } }),
      resolvePr: async () => ({ repo, pr: ghPr() }),
    });
    await reconciler.reconcilePass();
    expect(service.loadDoc().tasks[0].pr).toMatchObject({
      number: 42, owner: 'o', repo: 'r', checks: 'clean', mergeable: true, headSha: 'abc123',
    });
  });

  it('auto-queues green review cards when the PR is clean and merges them', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    service.update(task.id, { status: 'review' });
    // attach a green plan
    const doc = service.loadDoc();
    doc.tasks[0].evaluation = { status: 'done', plan: { goalDefinition: 'g', deliverable: 'pr', review: 'green', rationale: 'r' } };
    service.saveDoc(doc);

    const mergePr = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => ({ repo, pr: ghPr() }),
      mergePr,
    });
    await reconciler.reconcilePass();

    expect(mergePr).toHaveBeenCalledWith({ owner: 'o', repo: 'r', number: 42, sha: 'abc123' });
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('done');
    expect(after.queue).toBeNull();
    expect(after.pr).toMatchObject({ state: 'merged', merged: true });
  });

  it('human merge action enqueues and the queue merges exactly one card', async () => {
    const service = buildService();
    const a = await readyTaskWithBranch(service, 'taskhunter/board-a');
    const b = await readyTaskWithBranch(service, 'taskhunter/board-b', 'ses_2');
    service.update(a.id, { status: 'review' });
    service.update(b.id, { status: 'review' });
    service.setPr(a.id, { number: 1, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'a1' });
    service.setPr(b.id, { number: 2, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'b2' });

    service.reviewAction(a.id, 'merge');
    service.reviewAction(b.id, 'merge');
    // human-reviewed cards (review: human) must not auto-merge without being queued — they were queued above.
    const mergePr = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null, // keep stored facts
      mergePr,
    });
    await reconciler.reconcilePass();
    expect(mergePr).toHaveBeenCalledTimes(1); // strictly serial
    expect(mergePr.mock.calls[0][0]).toMatchObject({ number: 1 });
  });

  it('rebases behind/dirty PRs and blocks past mergeRetries', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    service.update(task.id, { status: 'review' });
    service.setPr(task.id, { number: 7, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: false, checks: 'dirty', headSha: 'z' });
    service.reviewAction(task.id, 'merge');

    const updateBranch = vi.fn(async () => {});
    const deps = {
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      updateBranch,
    };
    const reconciler = createBoardReconciler(deps);

    await reconciler.reconcilePass();
    expect(updateBranch).toHaveBeenCalledTimes(1);
    let after = service.loadDoc().tasks[0];
    expect(after.queue).toMatchObject({ state: 'rebasing', rebaseAttempts: 1 });

    // still dirty: second rebase
    service.setPr(task.id, { ...after.pr, mergeable: false, checks: 'dirty' });
    await reconciler.reconcilePass();
    after = service.loadDoc().tasks[0];
    expect(after.queue).toMatchObject({ state: 'rebasing', rebaseAttempts: 2 });

    // third dirty pass exceeds mergeRetries=2 -> blocked
    service.setPr(task.id, { ...after.pr, mergeable: false, checks: 'dirty' });
    await reconciler.reconcilePass();
    after = service.loadDoc().tasks[0];
    expect(after.status).toBe('blocked');
    expect(after.blockedReason).toContain('merge conflict');
  });

  it('treats merge 405 as a conflict needing rebase', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    service.update(task.id, { status: 'review' });
    service.setPr(task.id, { number: 8, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' });
    service.reviewAction(task.id, 'merge');

    const updateBranch = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      mergePr: async () => { throw Object.assign(new Error('Method Not Allowed'), { status: 405 }); },
      updateBranch,
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(updateBranch).toHaveBeenCalledTimes(1);
    expect(after.queue.state).toBe('rebasing');
    expect(after.status).toBe('review');
  });

  it('keeps transient merge failures queued', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    service.update(task.id, { status: 'review' });
    service.setPr(task.id, { number: 9, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' });
    service.reviewAction(task.id, 'merge');

    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => null,
      mergePr: async () => { throw new Error('socket hang up'); },
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.status).toBe('review');
    expect(after.queue.state).toBe('queued');
  });

  it('does not auto-queue human review plans', async () => {
    const service = buildService();
    const task = await readyTaskWithBranch(service);
    service.update(task.id, { status: 'review' });
    const doc = service.loadDoc();
    doc.tasks[0].evaluation = { status: 'done', plan: { goalDefinition: 'g', deliverable: 'pr', review: 'human', rationale: 'r' } };
    service.saveDoc(doc);
    const mergePr = vi.fn(async () => {});
    const reconciler = createBoardReconciler({
      service,
      resolveProject: async () => project,
      fetchSessionStatuses: async () => ({}),
      resolvePr: async () => ({ repo, pr: ghPr() }),
      mergePr,
    });
    await reconciler.reconcilePass();
    const after = service.loadDoc().tasks[0];
    expect(after.queue).toBeNull();
    expect(mergePr).not.toHaveBeenCalled();
  });
});

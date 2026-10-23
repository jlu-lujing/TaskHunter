import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBoardService } from './service.js';
import { executeBoardAgentAction } from './agent-actions.js';

let dataDir;
let uuidCounter;

const project = { id: 'p1', path: '/repo/alpha' };

const buildService = () => createBoardService({
  dataDir,
  readSettingsFromDiskMigrated: async () => ({ projects: [project] }),
  sanitizeProjects: (projects) => projects,
  randomUUID: () => `uuid-${uuidCounter++}`,
});

/** Running card bound to the worktree directory the worker calls from. */
const runningCard = async (service) => {
  const { task } = await service.create({ title: 'card', projectId: 'p1', status: 'queued' });
  service.claim(task.id, { branch: 'taskhunter/board-x' });
  service.linkSession(task.id, 'ses_1', '/repo/.wt/x');
  return service.loadDoc().tasks.find((entry) => entry.id === task.id);
};

const call = (service, action, input = {}, directory = '/repo/.wt/x') =>
  executeBoardAgentAction({ getBoardService: () => service }, action, input, directory);

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-agent-'));
  uuidCounter = 0;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('board agent actions', () => {
  it('finish moves the bound card to checking with a worker receipt stage', async () => {
    const service = buildService();
    const task = await runningCard(service);

    await call(service, 'board.finish');
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).toBe('checking');
    expect(after.check.stage).toBe('worker-finish');
    expect(after.lease).toBeNull();

    // Idempotent: a repeated receipt from the same session is fine.
    await call(service, 'board.finish');
    expect(service.loadDoc().tasks.find((entry) => entry.id === task.id).status).toBe('checking');
  });

  it('noop lands the card in review with the worker reason', async () => {
    const service = buildService();
    const task = await runningCard(service);

    await call(service, 'board.noop', { reason: 'the flag already exists in config.ts' });
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).toBe('review');
    expect(after.blockedReason).toContain('the flag already exists in config.ts');
  });

  it('blocked parks the card with the worker reason', async () => {
    const service = buildService();
    const task = await runningCard(service);

    await call(service, 'board.blocked', { reason: 'waiting on staging credentials' });
    const after = service.loadDoc().tasks.find((entry) => entry.id === task.id);
    expect(after.status).toBe('blocked');
    expect(after.blockedReason).toContain('waiting on staging credentials');
  });

  it('requires a reason for noop and blocked', async () => {
    const service = buildService();
    await runningCard(service);
    await expect(call(service, 'board.noop')).rejects.toThrow(/reason is required/);
    await expect(call(service, 'board.blocked', { reason: '   ' })).rejects.toThrow(/reason is required/);
  });

  it('refuses sessions that are not a working card session', async () => {
    const service = buildService();
    await runningCard(service);

    await expect(call(service, 'board.finish', {}, '/repo/alpha')).rejects.toThrow(/not bound to a working board card/);
    await expect(call(service, 'board.finish', {}, '')).rejects.toThrow(/only inside a board worker session/);
  });

  it('refuses sessions whose card has already settled', async () => {
    const service = buildService();
    const task = await runningCard(service);
    service.enterChecking(task.id);
    service.moveToReview(task.id);

    await expect(call(service, 'board.finish')).rejects.toThrow(/not bound to a working board card/);
  });

  it('reports the board being unavailable until it is attached', async () => {
    await expect(
      executeBoardAgentAction({ getBoardService: () => null }, 'board.finish', {}, '/repo/.wt/x'),
    ).rejects.toThrow(/not available/);
  });
});

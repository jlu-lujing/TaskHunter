import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerBoardRoutes } from './routes.js';
import { createBoardService } from './service.js';
import { createBoardDispatcher } from './dispatcher.js';

const PROJECTS = [
  { id: 'p1', name: 'Alpha', path: '/repo/alpha' },
  { id: 'p2', name: 'Beta', path: '/repo/beta' },
];

const buildApp = (dataDir) => {
  const app = express();
  registerBoardRoutes(app, {
    dataDir,
    readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
    sanitizeProjects: (projects) => projects,
    randomUUID: () => `${uuidCounter++}`,
  });
  return app;
};

let uuidCounter = 1;
let dataDir;
let app;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-board-'));
  uuidCounter = 1;
  app = buildApp(dataDir);
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('board routes', () => {
  it('lists an empty board before any task exists', async () => {
    const res = await request(app).get('/api/board').expect(200);
    expect(res.body.tasks).toEqual([]);
    expect(res.body.config).toMatchObject({ maxConcurrent: 2, automationDefault: 'plan', defaultModel: null });
  });

  it('creates a task with defaults and persists it across restarts', async () => {
    const created = await request(app)
      .post('/api/board/tasks')
      .send({ title: ' Ship the board ', projectId: 'p1' })
      .expect(201);
    expect(created.body.task).toMatchObject({
      id: 't_1',
      title: 'Ship the board',
      description: '',
      status: 'backlog',
      labels: [],
      sessionIds: [],
      projectId: 'p1',
    });

    const listed = await request(app).get('/api/board').expect(200);
    expect(listed.body.tasks).toHaveLength(1);

    // A fresh app over the same data directory reads the same file.
    const reopened = await request(buildApp(dataDir)).get('/api/board').expect(200);
    expect(reopened.body.tasks[0].id).toBe('t_1');
  });

  it('rejects missing or oversized titles and invalid statuses', async () => {
    await request(app).post('/api/board/tasks').send({ title: '   ' }).expect(400);
    await request(app).post('/api/board/tasks').send({ title: 'x'.repeat(301) }).expect(400);
    await request(app).post('/api/board/tasks').send({ title: 'ok', status: 'shipping' }).expect(400);
  });

  it('rejects an unknown projectId and accepts explicit null', async () => {
    await request(app).post('/api/board/tasks').send({ title: 'a', projectId: 'nope' }).expect(400);
    const unassigned = await request(app)
      .post('/api/board/tasks')
      .send({ title: 'a', projectId: null })
      .expect(201);
    expect(unassigned.body.task.projectId).toBeNull();
  });

  it('updates fields and links sessions with dedupe', async () => {
    const created = await request(app)
      .post('/api/board/tasks')
      .send({ title: 'task', projectId: 'p1', status: 'ready', labels: ['web', 'web'] })
      .expect(201);
    expect(created.body.task.labels).toEqual(['web']);

    const moved = await request(app)
      .patch(`/api/board/tasks/${created.body.task.id}`)
      .send({ status: 'in_progress', addSessionId: 'ses_a' })
      .expect(200);
    expect(moved.body.task).toMatchObject({ status: 'in_progress', sessionIds: ['ses_a'] });
    expect(moved.body.task.updatedAt).toBeGreaterThanOrEqual(moved.body.task.createdAt);

    const deduped = await request(app)
      .patch(`/api/board/tasks/${created.body.task.id}`)
      .send({ addSessionId: 'ses_a' })
      .expect(200);
    expect(deduped.body.task.sessionIds).toEqual(['ses_a']);

    const retitle = await request(app)
      .patch(`/api/board/tasks/${created.body.task.id}`)
      .send({ title: 'renamed', projectId: 'p2', labels: [] })
      .expect(200);
    expect(retitle.body.task).toMatchObject({ title: 'renamed', projectId: 'p2', labels: [], status: 'in_progress' });
  });

  it('404s on unknown task updates and deletes', async () => {
    await request(app).patch('/api/board/tasks/t_missing').send({ title: 'x' }).expect(404);
    await request(app).delete('/api/board/tasks/t_missing').expect(404);
  });

  it('deletes a task', async () => {
    const created = await request(app).post('/api/board/tasks').send({ title: 'gone' }).expect(201);
    await request(app).delete(`/api/board/tasks/${created.body.task.id}`).expect(200);
    const listed = await request(app).get('/api/board').expect(200);
    expect(listed.body.tasks).toEqual([]);
  });

  it('reports a corrupt board file as a 500 rather than an empty board', async () => {
    fs.writeFileSync(path.join(dataDir, 'board.json'), '{"nope":true}');
    await request(app).get('/api/board').expect(500);
  });
});

describe('board config and dispatcher', () => {
  const buildDispatcherApp = (sessionServiceCreate) => {
    const innerApp = express();
    const boardService = createBoardService({
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      randomUUID: () => `${uuidCounter++}`,
    });
    registerBoardRoutes(innerApp, {
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      boardService,
      dispatcher: createBoardDispatcher({
        service: boardService,
        sessionService: { create: sessionServiceCreate },
        readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
        sanitizeProjects: (projects) => projects,
      }),
    });
    return { app: innerApp, boardService };
  };

  const readyTask = async (target, title = 'task') => {
    const res = await request(target)
      .post('/api/board/tasks')
      .send({ title, projectId: 'p1', status: 'ready' })
      .expect(201);
    return res.body.task;
  };

  it('rejects invalid config and persists valid partial updates', async () => {
    await request(app).put('/api/board/config').send({ maxConcurrent: 99 }).expect(400);
    await request(app).put('/api/board/config').send({ defaultModel: 'no-slash' }).expect(400);
    const res = await request(app).put('/api/board/config').send({ maxConcurrent: 3, defaultModel: 'zen/gpt-5-nano' }).expect(200);
    expect(res.body.config).toMatchObject({ maxConcurrent: 3, defaultModel: 'zen/gpt-5-nano', automationDefault: 'plan' });
  });

  it('claims through the dispatcher with a forced worktree and links the session', async () => {
    const createCalls = [];
    const { app: dApp, boardService } = buildDispatcherApp(async (payload) => {
      createCalls.push(payload);
      return { sessionId: 'ses_board1', directory: '/repo/.wt/board-x', worktree: { path: '/repo/.wt/board-x' } };
    });
    const task = await readyTask(dApp, 'Ship it');

    const res = await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200);
    expect(res.body).toMatchObject({ sessionId: 'ses_board1', sessionDirectory: '/repo/.wt/board-x' });

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].directory).toBe('/repo/alpha');
    expect(createCalls[0].prompt).toContain('Ship it');
    expect(createCalls[0].worktree.name).toMatch(/^board-/);
    expect(createCalls[0].worktree.branchName).toMatch(/^taskhunter\/board-/);

    const listed = await request(dApp).get('/api/board').expect(200);
    const claimed = listed.body.tasks.find((entry) => entry.id === task.id);
    expect(claimed.status).toBe('in_progress');
    expect(claimed.sessionIds).toEqual(['ses_board1']);
    expect(claimed.lease.sessionId).toBe('ses_board1');
    expect(boardService.activeCount()).toBe(1);
  });

  it('blocks a second claim past maxConcurrent', async () => {
    const { app: dApp } = buildDispatcherApp(async () => ({ sessionId: 'ses_ok', directory: '/x' }));
    await request(dApp).put('/api/board/config').send({ maxConcurrent: 1 }).expect(200);
    const first = await readyTask(dApp, 'first');
    const second = await readyTask(dApp, 'second');
    await request(dApp).post(`/api/board/tasks/${first.id}/claim`).expect(200);
    await request(dApp).post(`/api/board/tasks/${second.id}/claim`).expect(409);
  });

  it('rolls the reservation back when session creation fails', async () => {
    const { app: dApp, boardService } = buildDispatcherApp(async () => {
      throw new Error('opencode down');
    });
    const task = await readyTask(dApp, 'doomed');
    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(500);
    const listed = (await request(dApp).get('/api/board').expect(200)).body;
    const rolled = listed.tasks.find((entry) => entry.id === task.id);
    expect(rolled.status).toBe('ready');
    expect(rolled.attempts).toBe(1);
    expect(rolled.lease).toBeNull();
    expect(boardService.activeCount()).toBe(0);
  });

  it('reclaims dead leases: back to ready once, blocked past maxAttempts', async () => {
    const { app: dApp, boardService } = buildDispatcherApp(async () => ({ sessionId: 'ses_x', directory: '/x' }));
    const task = await readyTask(dApp, 'ghosted');
    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200);

    const future = Date.now() + 24 * 60 * 60 * 1000;
    const pass1 = boardService.releaseStaleClaims({ now: future });
    expect(pass1.released.map((entry) => entry.id)).toEqual([task.id]);
    expect(pass1.released[0].status).toBe('ready');

    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200);
    const pass2 = boardService.releaseStaleClaims({ now: future + 1 });
    expect(pass2.released[0].status).toBe('ready');

    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200);
    const pass3 = boardService.releaseStaleClaims({ now: future + 2 });
    expect(pass3.released[0].status).toBe('blocked');
  });
});

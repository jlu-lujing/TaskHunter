import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerBoardRoutes } from './routes.js';

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
    expect(res.body).toEqual({ tasks: [] });
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

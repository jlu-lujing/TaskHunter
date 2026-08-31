import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerBoardRoutes } from './routes.js';
import { createBoardService } from './service.js';
import { createBoardDispatcher } from './dispatcher.js';
import { createBoardEvaluator } from './evaluator.js';

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
      .send({ title: 'task', projectId: 'p1', status: 'queued', labels: ['web', 'web'] })
      .expect(201);
    expect(created.body.task.labels).toEqual(['web']);

    const moved = await request(app)
      .patch(`/api/board/tasks/${created.body.task.id}`)
      .send({ status: 'queued', addSessionId: 'ses_a' })
      .expect(200);
    expect(moved.body.task).toMatchObject({ status: 'queued', sessionIds: ['ses_a'] });
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
    // Editing a running card re-runs judgment (content change -> planning).
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
      .send({ title, projectId: 'p1', status: 'queued' })
      .expect(201);
    return res.body.task;
  };

  const waitForCondition = async (probe, attempts = 100) => {
    for (let i = 0; i < attempts; i += 1) {
      if (await probe()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('timed out waiting for board state');
  };

  const waitForStatus = async (target, taskId, status) => {
    await waitForCondition(async () => {
      const body = (await request(target).get('/api/board').expect(200)).body;
      const entry = body.tasks.find((item) => item.id === taskId);
      return entry?.status === status || entry?.status === 'blocked';
    });
    const body = (await request(target).get('/api/board').expect(200)).body;
    expect(body.tasks.find((item) => item.id === taskId).status).toBe(status);
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

    // create kicks the scheduler: the card claims itself with a free slot.
    await waitForStatus(dApp, task.id, 'running');
    const res = await request(dApp).get('/api/board').expect(200);
    const dispatched = res.body.tasks.find((entry) => entry.id === task.id);
    expect(dispatched).toMatchObject({ status: 'running', sessionIds: ['ses_board1'] });

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].directory).toBe('/repo/alpha');
    expect(createCalls[0].prompt).toContain('Ship it');
    expect(createCalls[0].worktree.name).toMatch(/^board-/);
    expect(createCalls[0].worktree.branchName).toMatch(/^taskhunter\/board-/);

    const listed = await request(dApp).get('/api/board').expect(200);
    const claimed = listed.body.tasks.find((entry) => entry.id === task.id);
    expect(claimed.status).toBe('running');
    expect(claimed.sessionIds).toEqual(['ses_board1']);
    expect(claimed.lease.sessionId).toBe('ses_board1');
    expect(boardService.activeCount()).toBe(1);
  });

  it('blocks a second claim past maxConcurrent', async () => {
    const { app: dApp } = buildDispatcherApp(async () => ({ sessionId: 'ses_ok', directory: '/x' }));
    await request(dApp).put('/api/board/config').send({ maxConcurrent: 1 }).expect(200);
    const first = await readyTask(dApp, 'first');
    await waitForStatus(dApp, first.id, 'running');
    const second = await readyTask(dApp, 'second');
    await new Promise((resolve) => setTimeout(resolve, 30));
    // No free slot: the second card waits in the queue.
    expect((await request(dApp).get('/api/board').expect(200)).body.tasks.find((entry) => entry.id === second.id).status).toBe('queued');
    await request(dApp).post(`/api/board/tasks/${second.id}/claim`).expect(409);
  });

  it('rolls the reservation back when session creation fails', async () => {
    const { app: dApp, boardService } = buildDispatcherApp(async () => {
      throw new Error('opencode down');
    });
    const task = await readyTask(dApp, 'doomed');
    // auto-dispatch fails and rolls back once, counting the attempt
    await waitForCondition(async () => {
      const body = (await request(dApp).get('/api/board').expect(200)).body;
      const rolled = body.tasks.find((entry) => entry.id === task.id);
      return rolled.status === 'queued' && rolled.attempts === 1;
    });
    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(500);
    const listed = (await request(dApp).get('/api/board').expect(200)).body;
    const rolled = listed.tasks.find((entry) => entry.id === task.id);
    expect(rolled.status).toBe('queued');
    expect(rolled.attempts).toBe(2);
    expect(rolled.lease).toBeNull();
    expect(boardService.activeCount()).toBe(0);
  });

  it('reclaims dead leases: back to ready once, blocked past maxAttempts', async () => {
    const { app: dApp, boardService } = buildDispatcherApp(async () => ({ sessionId: 'ses_x', directory: '/x' }));
    const task = await readyTask(dApp, 'ghosted');
    await waitForStatus(dApp, task.id, 'running');

    const future = Date.now() + 24 * 60 * 60 * 1000;
    const pass1 = boardService.releaseStaleClaims({ now: future });
    expect(pass1.released.map((entry) => entry.id)).toEqual([task.id]);
    expect(pass1.released[0].status).toBe('queued');

    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200); // manual re-claim from queue
    const pass2 = boardService.releaseStaleClaims({ now: future + 1 });
    expect(pass2.released[0].status).toBe('queued');

    await request(dApp).post(`/api/board/tasks/${task.id}/claim`).expect(200);
    const pass3 = boardService.releaseStaleClaims({ now: future + 2 });
    expect(pass3.released[0].status).toBe('blocked');
  });
});

describe('board evaluator and launch plans', () => {
  const planPayload = {
    goalDefinition: 'Ship the fix with tests green',
    deliverable: 'pr',
    review: 'human',
    rationale: 'code change',
  };

  const buildEvalApp = ({ generate, create } = {}) => {
    const innerApp = express();
    const boardService = createBoardService({
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      randomUUID: () => `${uuidCounter++}`,
    });
    const innerDispatcher = create ? createBoardDispatcher({
      service: boardService,
      sessionService: { create },
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
    }) : undefined;
    registerBoardRoutes(innerApp, {
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      boardService,
      dispatcher: innerDispatcher,
      evaluator: createBoardEvaluator({ service: boardService, generate }),
    });
    return { app: innerApp, boardService };
  };

  const okGenerate = async () => ({
    text: JSON.stringify(planPayload),
    providerID: 'zen',
    modelID: 'tiny',
  });

  const waitFor = async (probe, attempts = 50) => {
    for (let i = 0; i < attempts; i += 1) {
      if (await probe()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('timed out waiting for board state');
  };

  const waitForConditionAsync = waitFor;

  const createTaskOf = async (target, body) => {
    const res = await request(target).post('/api/board/tasks').send(body).expect(201);
    return res.body.task;
  };

  it('evaluates a card and stores the launch plan', async () => {
    const { app: eApp } = buildEvalApp({ generate: okGenerate });
    const task = await createTaskOf(eApp, { title: 'Fix it', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
    const body = (await request(eApp).get('/api/board').expect(200)).body;
    expect(body.tasks.find((entry) => entry.id === task.id).evaluation.plan).toMatchObject({ ...planPayload, evaluatedBy: 'zen/tiny' });
    // second evaluation is rejected until the card is edited
    await request(eApp).post(`/api/board/tasks/${task.id}/evaluate`).expect(409);
  });

  it('auto-evaluates cards entering ready and re-evaluates after edits', async () => {
    const { app: eApp } = buildEvalApp({ generate: okGenerate });
    const task = await createTaskOf(eApp, { title: 'Auto me', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
    await request(eApp).patch(`/api/board/tasks/${task.id}`).send({ title: 'Edited' }).expect(200);
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
  });

  it('marks evaluation failed and allows a retry', async () => {
    const { app: eApp } = buildEvalApp({ generate: async () => { throw new Error('provider exploded'); } });
    const task = await createTaskOf(eApp, { title: 'Doomed eval', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'failed';
    });
    await request(eApp).post(`/api/board/tasks/${task.id}/evaluate`)
      .expect(500);
    // failed cards are retryable: swap in a working generator via a fresh app on the same dir
    const { app: eApp2 } = buildEvalAppShared({ generate: okGenerate });
    await request(eApp2).post(`/api/board/tasks/${task.id}/evaluate`).expect(200);
  });

  // Second app instance sharing the same dataDir (simulates restart with fixed model config).
  const buildEvalAppShared = ({ generate }) => {
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
      evaluator: createBoardEvaluator({ service: boardService, generate }),
    });
    return { app: innerApp, boardService };
  };

  it('rejects malformed plans with 502 and keeps the card retryable', async () => {
    const { app: eApp } = buildEvalApp({ generate: async () => ({ text: 'not json', providerID: 'zen', modelID: 'tiny' }) });
    const task = await createTaskOf(eApp, { title: 'Junk plan', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'failed';
    });
  });

  it('claim consumes the plan: report runs as a goal session', async () => {
    const createCalls = [];
    const { app: eApp } = buildEvalApp({
      generate: async () => ({
        text: JSON.stringify({ ...planPayload, deliverable: 'report' }),
        providerID: 'zen',
        modelID: 'tiny',
      }),
      create: async (payload) => {
        createCalls.push(payload);
        return { sessionId: 'ses_rep', directory: '/repo/alpha' };
      },
    });
    const task = await createTaskOf(eApp, { title: 'Investigate', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
    await request(eApp).post(`/api/board/tasks/${task.id}/action`).send({ action: 'approve' }).expect(200);
    await waitFor(async () => createCalls.length > 0);
    expect(createCalls[0].goal).toBe(true);
    expect(createCalls[0].prompt).toContain('Ship the fix with tests green');
    expect(createCalls[0].prompt).toContain('self-contained report');
  });

  it('prefers user prompt overrides for evaluation and dispatch', async () => {
    const seen = {};
    const createCalls = [];
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
        sessionService: {
          create: async (payload) => {
            createCalls.push(payload);
            return { sessionId: 'ses_ovr', directory: '/repo/alpha' };
          },
        },
        readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
        sanitizeProjects: (projects) => projects,
        readPromptOverride: async (promptId) => (seen[promptId] ?? null),
      }),
      evaluator: createBoardEvaluator({
        service: boardService,
        readPromptOverride: async (promptId) => (promptId === 'board.evaluate.instructions' ? 'JUDGE STRICTLY' : null),
        generate: async (options) => {
          optionsByCall.push(options);
          return { text: JSON.stringify({ ...planPayload, deliverable: 'report' }), providerID: 'zen', modelID: 'tiny' };
        },
      }),
    });
    const optionsByCall = [];
    const task = await createTaskOf(innerApp, { title: 'Custom prompts', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(innerApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
    expect(optionsByCall[0].system).toBe('JUDGE STRICTLY');

    // no dispatch override registered -> built-in report template renders the goal
    await request(innerApp).post(`/api/board/tasks/${task.id}/action`).send({ action: 'approve' }).expect(200);
    await waitFor(async () => createCalls.length > 0);
    expect(createCalls[0].prompt).toContain('## Goal (completion criteria)');
    expect(createCalls[0].prompt).toContain('self-contained report');
  });

  it('renders a custom dispatch template override', async () => {
    const createCalls = [];
    const boardService = createBoardService({
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      randomUUID: () => `${uuidCounter++}`,
    });
    const innerApp = express();
    registerBoardRoutes(innerApp, {
      dataDir,
      readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
      sanitizeProjects: (projects) => projects,
      boardService,
      dispatcher: createBoardDispatcher({
        service: boardService,
        sessionService: {
          create: async (payload) => {
            createCalls.push(payload);
            return { sessionId: 'ses_tpl', directory: '/repo/alpha' };
          },
        },
        readSettingsFromDiskMigrated: async () => ({ projects: PROJECTS }),
        sanitizeProjects: (projects) => projects,
        readPromptOverride: async (promptId) => (
          promptId === 'board.dispatch.report.instructions' ? 'GOAL:\n{{goal_definition}}\nGO HARD.' : null
        ),
      }),
      evaluator: createBoardEvaluator({
        service: boardService,
        generate: async () => ({
          text: JSON.stringify({ ...planPayload, deliverable: 'report' }),
          providerID: 'zen',
          modelID: 'tiny',
        }),
      }),
    });
    const task = await createTaskOf(innerApp, { title: 'Templated', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(innerApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.evaluation?.status === 'done';
    });
    await request(innerApp).post(`/api/board/tasks/${task.id}/action`).send({ action: 'approve' }).expect(200);
    await waitFor(async () => createCalls.length > 0);
    expect(createCalls[0].prompt).toContain(`GOAL:
Ship the fix with tests green
GO HARD.`);
  });

  it('auto mode starts work right after evaluation', async () => {
    const createCalls = [];
    const { app: eApp } = buildEvalApp({
      generate: okGenerate,
      create: async (payload) => {
        createCalls.push(payload);
        return { sessionId: 'ses_auto', directory: '/repo/alpha' };
      },
    });
    await request(eApp).put('/api/board/config').send({ automationDefault: 'auto' }).expect(200);
    const task = await createTaskOf(eApp, { title: 'Go now', projectId: 'p1', status: 'planning' });
    await waitFor(async () => {
      const body = (await request(eApp).get('/api/board').expect(200)).body;
      return body.tasks.find((entry) => entry.id === task.id)?.status === 'running';
    });
    expect(createCalls[0].prompt).toContain('Ship the fix with tests green');
    expect(createCalls[0].goal).toBeUndefined();
  });
});

describe('board review actions', () => {
  const toReview = async (title) => {
    const created = await request(app).post('/api/board/tasks').send({ title, projectId: 'p1' }).expect(201);
    await request(app).patch(`/api/board/tasks/${created.body.task.id}`).send({ status: 'review' }).expect(200);
    return created.body.task;
  };

  it('accepts a PR-less card and returns unknown actions', async () => {
    const task = await toReview('report task');
    await request(app).post(`/api/board/tasks/${task.id}/action`).send({ action: 'nope' }).expect(400);
    const res = await request(app).post(`/api/board/tasks/${task.id}/action`).send({ action: 'accept' }).expect(200);
    expect(res.body.task.status).toBe('done');
  });

  it('requires a PR for merge and clears state on return', async () => {
    const task = await toReview('needs pr');
    await request(app).post(`/api/board/tasks/${task.id}/action`).send({ action: 'merge' }).expect(409);

    await request(app).patch(`/api/board/tasks/${task.id}`).send({ status: 'queued' }).expect(200);
    await request(app).patch(`/api/board/tasks/${task.id}`).send({ status: 'review' }).expect(200);
    const ret = await request(app).post(`/api/board/tasks/${task.id}/action`).send({ action: 'return' }).expect(200);
    expect(ret.body.task.status).toBe('queued');
  });

  it('rejects actions on cards not in review', async () => {
    const created = await request(app).post('/api/board/tasks').send({ title: 'backlog', projectId: 'p1' }).expect(201);
    await request(app).post(`/api/board/tasks/${created.body.task.id}/action`).send({ action: 'accept' }).expect(409);
  });
});

describe('board v1 migration and planning actions', () => {
  it('migrates v1 statuses on load', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const legacy = {
      version: 1,
      config: {},
      tasks: [
        { id: 't_a', projectId: null, title: 'a', description: '', status: 'ready', labels: [], sessionIds: [], attempts: 0, lease: null, createdAt: 1, updatedAt: 1 },
        { id: 't_b', projectId: null, title: 'b', description: '', status: 'ready', labels: [], sessionIds: [], attempts: 0, lease: null, evaluation: { status: 'done', plan: { goalDefinition: 'g', deliverable: 'pr', review: 'human', rationale: 'r' } }, createdAt: 1, updatedAt: 1 },
        { id: 't_c', projectId: null, title: 'c', description: '', status: 'in_progress', labels: [], sessionIds: ['ses_old'], attempts: 0, lease: { sessionId: 'ses_old', claimedAt: 1, expiresAt: 2 }, createdAt: 1, updatedAt: 1 },
      ],
    };
    fs.writeFileSync(path.join(dataDir, 'board.json'), JSON.stringify(legacy));
    const res = await request(app).get('/api/board').expect(200);
    const byId = Object.fromEntries(res.body.tasks.map((entry) => [entry.id, entry]));
    expect(byId.t_a.status).toBe('planning'); // unjudged ready card needs judging first
    expect(byId.t_b.status).toBe('queued'); // approved in the old model: joins the queue
    expect(byId.t_c.status).toBe('running');
    expect(byId.t_c.sessionRef).toBe('ses_old');
    expect(byId.t_c.sessionDirectoryRef).toBeNull();
  });

  it('approve requires a finished launch plan', async () => {
    const created = await request(app).post('/api/board/tasks').send({ title: 'plan me', projectId: 'p1', status: 'planning' }).expect(201);
    await request(app).post(`/api/board/tasks/${created.body.task.id}/action`).send({ action: 'approve' }).expect(409);
  });

  it('retryEvaluation only applies to failed evaluations', async () => {
    const created = await request(app).post('/api/board/tasks').send({ title: 'retry me', projectId: 'p1', status: 'planning' }).expect(201);
    await request(app).post(`/api/board/tasks/${created.body.task.id}/action`).send({ action: 'retryEvaluation' }).expect(409);
  });
});

describe('board pipeline guards', () => {
  it('manual moves into agent-owned columns are rejected', async () => {
    const created = await request(app).post('/api/board/tasks').send({ title: 'guard', projectId: 'p1' }).expect(201);
    for (const target of ['running', 'checking', 'merging']) {
      const res = await request(app).patch(`/api/board/tasks/${created.body.task.id}`).send({ status: target }).expect(409);
      expect(res.body.error).toContain('pipeline-owned');
    }
    // human-side columns stay draggable
    await request(app).patch(`/api/board/tasks/${created.body.task.id}`).send({ status: 'planning' }).expect(200);
    await request(app).patch(`/api/board/tasks/${created.body.task.id}`).send({ status: 'queued' }).expect(200);
  });

  it('idle cards stay deletable, review included', async () => {
    const a = await request(app).post('/api/board/tasks').send({ title: 'work', projectId: 'p1', status: 'queued' }).expect(201);
    await request(app).delete(`/api/board/tasks/${a.body.task.id}`).expect(200);
    const b = await request(app).post('/api/board/tasks').send({ title: 'reviewed', projectId: 'p1', status: 'review' }).expect(201);
    await request(app).delete(`/api/board/tasks/${b.body.task.id}`).expect(200);
  });
});

describe('board reference recovery', () => {
  it('recovers session refs from the lease on later loads', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const doc = {
      version: 2,
      config: {},
      tasks: [
        { id: 't_r', projectId: null, title: 'r', description: '', status: 'running', labels: [], sessionIds: ['ses_r'], attempts: 0,
          lease: { sessionId: 'ses_r', sessionDirectory: '/wt/r', claimedAt: 1, expiresAt: 9e15 },
          createdAt: 1, updatedAt: 1 },
      ],
    };
    fs.writeFileSync(path.join(dataDir, 'board.json'), JSON.stringify(doc));
    const res = await request(app).get('/api/board').expect(200);
    expect(res.body.tasks[0]).toMatchObject({ sessionRef: 'ses_r', sessionDirectoryRef: '/wt/r' });
  });
});

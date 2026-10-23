import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBoardService } from './service.js';
import { createBoardChecker } from './checker.js';

let dataDir;
let uuidCounter;

const project = { id: 'p1', path: '/repo/alpha' };
const pass = { text: JSON.stringify({ verdict: 'pass', feedback: '' }) };
const needsWork = (feedback) => ({ text: JSON.stringify({ verdict: 'needs_work', feedback }) });

const buildService = () => createBoardService({
  dataDir,
  readSettingsFromDiskMigrated: async () => ({ projects: [project] }),
  sanitizeProjects: (projects) => projects,
  randomUUID: () => `uuid-${uuidCounter++}`,
});

const checkingTask = async (service, { plan = { goalDefinition: 'g', deliverable: 'pr', review: 'human', rationale: 'r' } } = {}) => {
  const { task: created } = await service.create({ title: 'card', projectId: 'p1', status: 'queued' });
  service.claim(created.id, { branch: 'taskhunter/board-x' });
  service.linkSession(created.id, 'ses_1', '/repo/.wt/x');
  const doc = service.loadDoc();
  const task = doc.tasks.find((entry) => entry.id === created.id);
  task.evaluation = { status: 'done', plan };
  service.saveDoc(doc);
  service.enterChecking(created.id);
  return service.loadDoc().tasks.find((entry) => entry.id === created.id);
};

const PR_FACTS = { number: 5, owner: 'o', repo: 'r', state: 'open', merged: false, draft: false, mergeable: true, checks: 'clean', headSha: 'z' };

const buildChecker = (overrides = {}) => createBoardChecker({
  service: null, // set below
  generate: async () => pass,
  fetchPrDiff: async () => '### a.ts\n+hello',
  fetchFinalAnswer: async () => 'the final report',
  sendSessionMessage: async () => {},
  updateBranch: async () => {},
  ...overrides,
});

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-checker-'));
  uuidCounter = 0;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('board checker', () => {
  const setup = (overrides = {}) => {
    const service = buildService();
    return { service, checker: buildChecker({ service, ...overrides }) };
  };

  it('passes a clean PR to review for human plans', async () => {
    const { service, checker } = setup();
    const task = await checkingTask(service);
    service.setPr(task.id, PR_FACTS);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('review');
  });

  it('routes a green plan straight to the merge queue', async () => {
    const { service, checker } = setup();
    const task = await checkingTask(service, { plan: { goalDefinition: 'g', deliverable: 'pr', review: 'green', rationale: 'r' } });
    service.setPr(task.id, PR_FACTS);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('merging');
    expect(result.queue.state).toBe('queued');
  });

  it('waits for CI without consuming a check attempt', async () => {
    const service = buildService();
    const generate = vi.fn(async () => pass);
    const checker = buildChecker({ service, generate });
    const task = await checkingTask(service);
    service.setPr(task.id, { ...PR_FACTS, mergeable: null, checks: 'unknown' });
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('checking');
    expect(generate).not.toHaveBeenCalled();
  });

  it('sends needs_work feedback to the worker and returns the card to running', async () => {
    const service = buildService();
    const sent = [];
    const checker = buildChecker({ service, generate: async () => needsWork('add tests'), sendSessionMessage: async ({ text }) => { sent.push(text); } });
    const task = await checkingTask(service);
    service.setPr(task.id, PR_FACTS);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('running');
    expect(result.checkAttempts).toBe(1);
    expect(sent[0]).toContain('add tests');
  });

  it('blocks past the check retry budget', async () => {
    const service = buildService();
    const checker = buildChecker({ service, generate: async () => needsWork('still broken') });
    const task = await checkingTask(service);
    service.setPr(task.id, PR_FACTS);
    service.update(task.id, {});
    const doc = service.loadDoc();
    doc.tasks[0].checkAttempts = 2; // budget config default checkRetries=2
    service.saveDoc(doc);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('blocked');
    expect(result.blockedReason).toContain('delivery checks failed');
  });

  it('judges report cards from the final answer', async () => {
    const service = buildService();
    const seen = [];
    const checker = buildChecker({
      service,
      generate: async (options) => { seen.push(options.prompt); return pass; },
      fetchPrDiff: async () => null,
    });
    const task = await checkingTask(service, { plan: { goalDefinition: 'explain X', deliverable: 'report', review: 'human', rationale: 'r' } });
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('review'); // report: always human review
    expect(seen[0]).toContain('the final report');
  });

  it('waits when the report answer is not there yet', async () => {
    const service = buildService();
    const checker = buildChecker({ service, fetchFinalAnswer: async () => null });
    const task = await checkingTask(service, { plan: { goalDefinition: 'g', deliverable: 'report', review: 'human', rationale: 'r' } });
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('checking');
    expect(service.loadDoc().tasks[0].check.stage).toBe('waiting-answer');
  });
});

describe('board checker PR-plan gating', () => {
  it('nudges a stalled PR-plan card back to running instead of waiting silently', async () => {
    const service = buildService();
    const seen = [];
    const sent = [];
    const checker = buildChecker({
      service,
      generate: async (options) => { seen.push(options.prompt); return needsWork('no PR opened yet'); },
      fetchPrDiff: async () => null,
      fetchFinalAnswer: async () => 'Should I also update the README?',
      sendSessionMessage: async ({ text }) => { sent.push(text); },
    });
    const task = await checkingTask(service);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('running');
    expect(result.checkAttempts).toBe(1);
    expect(seen[0]).toContain('Should I also update the README?');
    expect(sent[0]).toContain('no PR opened yet');
  });

  it('nudges with a canned instruction when the worker left no message, without an LLM call', async () => {
    const service = buildService();
    const generate = vi.fn(async () => pass);
    const sent = [];
    const checker = buildChecker({ service, generate, fetchPrDiff: async () => null, fetchFinalAnswer: async () => null, sendSessionMessage: async ({ text }) => { sent.push(text); } });
    const task = await checkingTask(service);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('running');
    expect(generate).not.toHaveBeenCalled();
    expect(sent[0]).toContain('pull request');
  });

  it('treats a pass verdict on a PR-less card as needs_work', async () => {
    const service = buildService();
    const sent = [];
    const checker = buildChecker({ service, fetchPrDiff: async () => null, fetchFinalAnswer: async () => 'looks like a question to the user', sendSessionMessage: async ({ text }) => { sent.push(text); } });
    const task = await checkingTask(service);
    const result = await checker.checkTask(service.loadDoc().tasks[0], project, (await service.list()).config);
    expect(result.status).toBe('running');
    expect(result.checkAttempts).toBe(1);
    expect(sent[0]).toContain('pull request');
  });
});

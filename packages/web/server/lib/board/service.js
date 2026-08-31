import fs from 'node:fs';
import path from 'node:path';
import { TaskHunterControlError } from '../taskhunter-control/error.js';

export const BOARD_STATUSES = Object.freeze(['backlog', 'ready', 'in_progress', 'review', 'done', 'blocked']);
export const BOARD_AUTOMATION_DEFAULTS = Object.freeze(['plan', 'auto']);

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 20_000;
const LABEL_MAX = 50;
const LABELS_MAX = 20;

export const DEFAULT_BOARD_CONFIG = Object.freeze({
  /** `provider/model` used for dispatch evaluation and worker sessions (per-task overrides later). */
  defaultModel: null,
  maxConcurrent: 2,
  automationDefault: 'plan',
  /** Merge-queue rebase retries before a card goes blocked (consumed by Phase 2). */
  mergeRetries: 2,
  /** Claim retries (lease reclaim) before a card goes blocked. */
  maxAttempts: 2,
});

const asString = (value) => (typeof value === 'string' ? value : null);
const asTrimmed = (value) => {
  const raw = asString(value);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const validateConfig = (patch, current) => {
  const next = { ...current };
  if (patch.defaultModel !== undefined) {
    if (patch.defaultModel === null) next.defaultModel = null;
    else {
      const model = asTrimmed(patch.defaultModel);
      if (!model || !model.includes('/')) {
        throw new TaskHunterControlError('defaultModel must be "provider/model" or null', 400);
      }
      next.defaultModel = model;
    }
  }
  if (patch.maxConcurrent !== undefined) {
    const value = patch.maxConcurrent;
    if (!Number.isInteger(value) || value < 1 || value > 8) {
      throw new TaskHunterControlError('maxConcurrent must be an integer from 1 to 8', 400);
    }
    next.maxConcurrent = value;
  }
  if (patch.automationDefault !== undefined) {
    if (!BOARD_AUTOMATION_DEFAULTS.includes(patch.automationDefault)) {
      throw new TaskHunterControlError(`automationDefault must be one of: ${BOARD_AUTOMATION_DEFAULTS.join(', ')}`, 400);
    }
    next.automationDefault = patch.automationDefault;
  }
  for (const field of ['mergeRetries', 'maxAttempts']) {
    if (patch[field] !== undefined) {
      const value = patch[field];
      if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new TaskHunterControlError(`${field} must be an integer from 0 to 5`, 400);
      }
      next[field] = value;
    }
  }
  return next;
};

/**
 * File-backed Kanban board in the TaskHunter data directory.
 * config: dispatch settings. tasks carry the dispatcher lease:
 * `lease: {sessionId, claimedAt, expiresAt}` written on claim; a missing or
 * expired lease on an in_progress card means the claiming process died and
 * the reclaim loop recycles the card.
 */
export const createBoardService = ({
  dataDir,
  readSettingsFromDiskMigrated,
  sanitizeProjects,
  randomUUID = () => globalThis.crypto.randomUUID(),
  now = () => Date.now(),
} = {}) => {
  if (!dataDir) throw new Error('board service requires dataDir');
  const filePath = path.join(dataDir, 'board.json');
  const DEFAULT_LEASE_TTL_MS = 30 * 60_000;

  const loadDoc = () => {
    if (!fs.existsSync(filePath)) return { version: 1, config: { ...DEFAULT_BOARD_CONFIG }, tasks: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new TaskHunterControlError('board.json is corrupt (missing tasks array)', 500);
    }
    return {
      version: 1,
      config: { ...DEFAULT_BOARD_CONFIG, ...(parsed.config ?? {}) },
      tasks: parsed.tasks,
    };
  };

  const saveDoc = (doc) => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
  };

  const findTask = (doc, taskId) => {
    const task = doc.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new TaskHunterControlError(`Task not found: ${taskId}`, 404);
    return task;
  };

  const normalizeTitle = (value) => {
    const title = asTrimmed(value);
    if (!title) throw new TaskHunterControlError('title is required', 400);
    if (title.length > TITLE_MAX) throw new TaskHunterControlError(`title exceeds ${TITLE_MAX} characters`, 400);
    return title;
  };

  const normalizeStatus = (value, fallback) => {
    if (value === undefined) return fallback;
    if (!BOARD_STATUSES.includes(value)) {
      throw new TaskHunterControlError(`status must be one of: ${BOARD_STATUSES.join(', ')}`, 400);
    }
    return value;
  };

  const normalizeDescription = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return '';
    const description = asString(value);
    if (description === null) throw new TaskHunterControlError('description must be a string', 400);
    if (description.length > DESCRIPTION_MAX) {
      throw new TaskHunterControlError(`description exceeds ${DESCRIPTION_MAX} characters`, 400);
    }
    return description;
  };

  const normalizeLabels = (value) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > LABELS_MAX) {
      throw new TaskHunterControlError(`labels must be an array of up to ${LABELS_MAX} strings`, 400);
    }
    const labels = [];
    for (const entry of value) {
      const label = asTrimmed(entry);
      if (!label) throw new TaskHunterControlError('labels must be non-empty strings', 400);
      if (label.length > LABEL_MAX) {
        throw new TaskHunterControlError(`label exceeds ${LABEL_MAX} characters`, 400);
      }
      if (!labels.includes(label)) labels.push(label);
    }
    return labels;
  };

  const normalizeProjectId = async (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const projectId = asTrimmed(value);
    if (!projectId) throw new TaskHunterControlError('projectId must be a string or null', 400);
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    if (!projects.some((entry) => entry.id === projectId)) {
      throw new TaskHunterControlError(`Project not found: ${projectId}`, 400);
    }
    return projectId;
  };

  const normalizeSessionIds = (value) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new TaskHunterControlError('sessionIds must be an array of strings', 400);
    const ids = [];
    for (const entry of value) {
      const id = asTrimmed(entry);
      if (!id) throw new TaskHunterControlError('sessionIds must be non-empty strings', 400);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  return {
    DEFAULT_LEASE_TTL_MS,

    loadDoc,
    saveDoc,

    async list() {
      const doc = loadDoc();
      return { tasks: doc.tasks, config: doc.config };
    },

    async updateConfig(patch) {
      if (!patch || typeof patch !== 'object') throw new TaskHunterControlError('request body must be an object', 400);
      const doc = loadDoc();
      doc.config = validateConfig(patch, doc.config);
      saveDoc(doc);
      return { config: doc.config };
    },

    async create(payload = {}) {
      const timestamp = now();
      const task = {
        id: `t_${randomUUID()}`,
        projectId: (await normalizeProjectId(payload.projectId)) ?? null,
        title: normalizeTitle(payload.title),
        description: normalizeDescription(payload.description) ?? '',
        status: normalizeStatus(payload.status, 'backlog'),
        labels: normalizeLabels(payload.labels) ?? [],
        sessionIds: normalizeSessionIds(payload.sessionIds) ?? [],
        attempts: 0,
        lease: null,
        branch: null,
        pr: null,
        queue: null,
        blockedReason: null,
        evaluation: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const doc = loadDoc();
      doc.tasks.push(task);
      saveDoc(doc);
      return { task };
    },

    async update(taskId, patch = {}) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      const contentChanged = patch.title !== undefined || patch.description !== undefined;
      if (patch.title !== undefined) task.title = normalizeTitle(patch.title);
      if (patch.status !== undefined) task.status = normalizeStatus(patch.status, task.status);
      if (patch.description !== undefined) task.description = normalizeDescription(patch.description) ?? '';
      if (contentChanged) task.evaluation = null;
      if (patch.labels !== undefined) task.labels = normalizeLabels(patch.labels) ?? task.labels;
      if (patch.projectId !== undefined) task.projectId = (await normalizeProjectId(patch.projectId)) ?? null;
      if (patch.sessionIds !== undefined) task.sessionIds = normalizeSessionIds(patch.sessionIds) ?? task.sessionIds;
      if (patch.addSessionId !== undefined) {
        const sessionId = asTrimmed(patch.addSessionId);
        if (!sessionId) throw new TaskHunterControlError('addSessionId must be a non-empty string', 400);
        if (!task.sessionIds.includes(sessionId)) task.sessionIds = [...task.sessionIds, sessionId];
      }
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    async remove(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      doc.tasks.splice(doc.tasks.indexOf(task), 1);
      saveDoc(doc);
      return { task };
    },

    /**
     * Reserve a ready card for dispatch BEFORE the session is created, so
     * concurrent claimants cannot spawn two sessions for one task.
     */
    claim(taskId, { leaseTtlMs = DEFAULT_LEASE_TTL_MS, branch = null } = {}) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'ready') {
        throw new TaskHunterControlError(`Task is not ready (status: ${task.status})`, 409);
      }
      const timestamp = now();
      task.status = 'in_progress';
      task.branch = branch;
      task.pr = null;
      task.queue = null;
      task.blockedReason = null;
      task.lease = { sessionId: null, claimedAt: timestamp, expiresAt: timestamp + leaseTtlMs };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Roll back a reservation whose session creation failed. */
    abortClaim(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      const timestamp = now();
      task.attempts = (task.attempts ?? 0) + 1;
      task.lease = null;
      task.status = 'ready';
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Record the created session on a reserved claim. */
    linkSession(taskId, sessionId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      const timestamp = now();
      if (!task.sessionIds.includes(sessionId)) task.sessionIds = [...task.sessionIds, sessionId];
      if (task.lease) task.lease = { ...task.lease, sessionId };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /**
     * Evaluation lifecycle. Only ready, unevaluated (or failed) cards start a
     * fresh evaluation; concurrent triggers get 409.
     */
    startEvaluation(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'ready') {
        throw new TaskHunterControlError(`Task is not ready (status: ${task.status})`, 409);
      }
      if (task.evaluation && task.evaluation.status !== 'failed') {
        throw new TaskHunterControlError(`Task evaluation already ${task.evaluation.status}`, 409);
      }
      const timestamp = now();
      task.evaluation = { status: 'running', plan: null, error: null, model: null, startedAt: timestamp, finishedAt: null };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    completeEvaluation(taskId, plan) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (!task.evaluation || task.evaluation.status !== 'running') {
        throw new TaskHunterControlError('Task has no running evaluation', 409);
      }
      const timestamp = now();
      task.evaluation = { ...task.evaluation, status: 'done', plan, error: null, finishedAt: timestamp };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    failEvaluation(taskId, message) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (!task.evaluation || task.evaluation.status !== 'running') {
        throw new TaskHunterControlError('Task has no running evaluation', 409);
      }
      const timestamp = now();
      task.evaluation = { ...task.evaluation, status: 'failed', plan: null, error: String(message).slice(0, 500), finishedAt: timestamp };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Heartbeat: a live session keeps its claim alive. */
    refreshLease(taskId, leaseTtlMs = DEFAULT_LEASE_TTL_MS) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (!task.lease) return { task };
      const timestamp = now();
      task.lease = { ...task.lease, expiresAt: timestamp + leaseTtlMs };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Session finished: move the card to review for human/green pickup. */
    promoteToReview(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'in_progress') return { task };
      task.status = 'review';
      task.lease = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    /** Server-owned write-backs (reconciler / merge queue only). */
    setPr(taskId, pr) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      task.pr = pr;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    setQueue(taskId, queue) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      task.queue = queue;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    blockTask(taskId, reason) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      task.status = 'blocked';
      task.blockedReason = String(reason).slice(0, 300);
      task.queue = null;
      task.lease = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    /**
     * Human/green review actions on a Review card.
     * merge   — queue a PR-backed card for the serial merge queue
     * accept  — land a PR-less card (report deliverable) directly
     * return  — send the card back to Ready for rework
     */
    reviewAction(taskId, action) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'review') {
        throw new TaskHunterControlError(`Task is not in review (status: ${task.status})`, 409);
      }
      if (action === 'merge') {
        if (!task.pr?.number) throw new TaskHunterControlError('Task has no pull request to merge', 409);
        if (task.queue) throw new TaskHunterControlError(`Task already in merge queue (${task.queue.state})`, 409);
        task.queue = { state: 'queued', enqueuedAt: now(), rebaseAttempts: 0 };
      } else if (action === 'accept') {
        if (task.pr?.number && !task.pr.merged) {
          throw new TaskHunterControlError('Task has an open pull request — merge it instead', 409);
        }
        task.status = 'done';
        task.queue = null;
      } else if (action === 'return') {
        task.status = 'ready';
        task.queue = null;
        task.lease = null;
      } else {
        throw new TaskHunterControlError(`Unknown review action: ${action}`, 400);
      }
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    markMerged(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      task.status = 'done';
      task.queue = null;
      task.lease = null;
      if (task.pr) task.pr = { ...task.pr, state: 'merged', merged: true };
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    activeCount() {
      const doc = loadDoc();
      const timestamp = now();
      return doc.tasks.filter((task) => task.status === 'in_progress' && task.lease && task.lease.expiresAt > timestamp).length;
    },

    /**
     * Recycle claims whose lease died. Returns the cards moved; the caller
     * (dispatcher) decides notification. Cards past maxAttempts go blocked.
     */
    releaseStaleClaims({ now: probeAt = now() } = {}) {
      const doc = loadDoc();
      const released = [];
      let changed = false;
      for (const task of doc.tasks) {
        if (task.status !== 'in_progress') continue;
        const alive = task.lease && task.lease.expiresAt > probeAt;
        if (alive) continue;
        const attempts = (task.attempts ?? 0) + 1;
        task.attempts = attempts;
        task.lease = null;
        const exhausted = attempts > (doc.config.maxAttempts ?? 2);
        task.status = exhausted ? 'blocked' : 'ready';
        if (exhausted) task.blockedReason = 'dispatch failed too many times';
        task.updatedAt = probeAt;
        released.push(task);
        changed = true;
      }
      if (changed) saveDoc(doc);
      return { released };
    },
  };
};

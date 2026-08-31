import fs from 'node:fs';
import path from 'node:path';
import { TaskHunterControlError } from '../taskhunter-control/error.js';

/**
 * Agent pipeline, one column per owner:
 * backlog(human) → planning(evaluator) → queued(scheduler) → running(worker
 * session) → checking(delivery checker) → review(human) → merging(merge bot)
 * → done; blocked = anything waiting on human attention.
 */
const BOARD_STATUSES = Object.freeze(['backlog', 'planning', 'queued', 'running', 'checking', 'review', 'merging', 'done', 'blocked']);
const BOARD_AUTOMATION_DEFAULTS = Object.freeze(['plan', 'auto']);

const DOC_VERSION = 2;
const TITLE_MAX = 300;
const DESCRIPTION_MAX = 20_000;
const LABEL_MAX = 50;
const LABELS_MAX = 20;

const DEFAULT_BOARD_CONFIG = Object.freeze({
  /** `provider/model` used for board evaluation, dispatched sessions, and delivery checks (per-task overrides later). */
  defaultModel: null,
  maxConcurrent: 2,
  automationDefault: 'plan',
  /** Merge-queue rebase retries before a card needs attention. */
  mergeRetries: 2,
  /** Dispatch retries (lease reclaim) before a card needs attention. */
  maxAttempts: 2,
  /** Delivery-check self-heal rounds (checker sends work back to the session). */
  checkRetries: 2,
});

/** Columns a human must not enter by hand: they are entered only through
 * approve/dispatch/check transitions, which also set up lease/session facts. */
const AGENT_OWNED_TARGETS = Object.freeze(['running', 'checking', 'merging']);

/** Legacy v1 columns → v2 pipeline (applied lazily on load). */
const LEGACY_STATUS_MAP = {
  backlog: 'backlog',
  ready: 'planning',
  in_progress: 'running',
  review: 'review',
  done: 'done',
  blocked: 'blocked',
};

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
  for (const field of ['mergeRetries', 'maxAttempts', 'checkRetries']) {
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

const migrateTaskV1 = (task) => {
  const migrated = { checkAttempts: 0, queuedAt: null, ...task, ...backfillRefs(task) };
  const legacy = LEGACY_STATUS_MAP[task.status] ?? task.status;
  migrated.status = legacy;
  // A v1 `ready` card that already had a plan was dispatch-approved in the old
  // model (▶ = approve & start); it joins the queue directly.
  if (task.status === 'ready' && task.evaluation?.plan) migrated.status = 'queued';
  return migrated;
};

/** Recover worker-session references that older builds stored only in the lease. */
function backfillRefs(task) {
  return {
    sessionRef: task.sessionRef ?? task.lease?.sessionId ?? null,
    sessionDirectoryRef: task.sessionDirectoryRef ?? task.lease?.sessionDirectory ?? null,
  };
}

/**
 * File-backed board in the TaskHunter data directory. `board.json` v2:
 * `{ version: 2, config, tasks }`. Running cards carry a lease
 * `{sessionId, sessionDirectory, claimedAt, expiresAt}` kept alive by the
 * reconciler heartbeat; `sessionRef` survives lease changes so checks and
 * self-heal can always find the worker session.
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
    if (!fs.existsSync(filePath)) return { version: DOC_VERSION, config: { ...DEFAULT_BOARD_CONFIG }, tasks: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new TaskHunterControlError('board.json is corrupt (missing tasks array)', 500);
    }
    const tasks = (parsed.version === DOC_VERSION ? parsed.tasks : parsed.tasks.map(migrateTaskV1))
      .map((task) => ({ ...task, ...backfillRefs(task) }));
    return {
      version: DOC_VERSION,
      config: { ...DEFAULT_BOARD_CONFIG, ...(parsed.config ?? {}) },
      tasks,
    };
  };

  const saveDoc = (doc) => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify({ ...doc, version: DOC_VERSION }, null, 2)}\n`, 'utf8');
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

  const enterQueued = (task, timestamp) => {
    task.status = 'queued';
    task.queuedAt = task.queuedAt ?? timestamp;
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
      const status = normalizeStatus(payload.status, 'backlog');
      const task = {
        id: `t_${randomUUID()}`,
        projectId: (await normalizeProjectId(payload.projectId)) ?? null,
        title: normalizeTitle(payload.title),
        description: normalizeDescription(payload.description) ?? '',
        status,
        labels: normalizeLabels(payload.labels) ?? [],
        sessionIds: normalizeSessionIds(payload.sessionIds) ?? [],
        attempts: 0,
        checkAttempts: 0,
        lease: null,
        sessionRef: null,
        branch: null,
        pr: null,
        queue: null,
        blockedReason: null,
        queuedAt: status === 'queued' ? timestamp : null,
        evaluation: null,
        check: null,
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
      if (patch.status !== undefined) {
        const previous = task.status;
        task.status = normalizeStatus(patch.status, previous);
        if (task.status !== previous && AGENT_OWNED_TARGETS.includes(task.status)) {
          throw new TaskHunterControlError(
            `${task.status} is pipeline-owned — approve, queue, or check a card instead of moving it by hand`,
            409,
          );
        }
        if (task.status !== previous) {
          task.blockedReason = task.status === 'blocked' ? 'moved to needs attention manually' : task.blockedReason;
          if (task.status === 'blocked' && previous !== 'blocked') task.blockedReason = 'moved here by hand';
          if (previous === 'blocked' && task.status !== 'blocked') task.blockedReason = null;
          if (task.status === 'queued') task.queuedAt = task.queuedAt ?? now();
        }
      }
      if (patch.description !== undefined) task.description = normalizeDescription(patch.description) ?? '';
      if (contentChanged) {
        // A changed card must be re-judged before it can run again.
        task.evaluation = null;
        if (['queued', 'running', 'checking', 'review', 'merging'].includes(task.status)) task.status = 'planning';
      }
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
      if (task.status === 'running') {
        throw new TaskHunterControlError('Card is being worked on — return it from review first', 409);
      }
      if (task.status === 'merging') {
        throw new TaskHunterControlError('Card is in the merge queue — delete after the merge settles', 409);
      }
      doc.tasks.splice(doc.tasks.indexOf(task), 1);
      saveDoc(doc);
      return { task };
    },

    /**
     * Reserve a queued card for dispatch BEFORE the session is created, so
     * concurrent claimants cannot spawn two sessions for one task.
     */
    claim(taskId, { leaseTtlMs = DEFAULT_LEASE_TTL_MS, branch = null } = {}) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'queued') {
        throw new TaskHunterControlError(`Task is not queued (status: ${task.status})`, 409);
      }
      const timestamp = now();
      task.status = 'running';
      task.branch = branch;
      task.pr = null;
      task.queue = null;
      task.blockedReason = null;
      task.checkAttempts = 0;
      task.check = null;
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
      enterQueued(task, timestamp);
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Record the created session on a reserved claim. */
    linkSession(taskId, sessionId, sessionDirectory = null) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      const timestamp = now();
      if (!task.sessionIds.includes(sessionId)) task.sessionIds = [...task.sessionIds, sessionId];
      task.sessionRef = sessionId;
      if (sessionDirectory) task.sessionDirectoryRef = sessionDirectory;
      if (task.lease) task.lease = { ...task.lease, sessionId, sessionDirectory };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /**
     * Evaluation lifecycle (Planning column). Only planning cards without a
     * live evaluation start a fresh one; concurrent triggers get 409.
     */
    startEvaluation(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'planning') {
        throw new TaskHunterControlError(`Task is not in planning (status: ${task.status})`, 409);
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

    /**
     * With `automationDefault: auto` a finished plan also approves the card
     * into the queue; plan mode waits for the human approve button.
     */
    completeEvaluation(taskId, plan) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (!task.evaluation || task.evaluation.status !== 'running') {
        throw new TaskHunterControlError('Task has no running evaluation', 409);
      }
      const timestamp = now();
      task.evaluation = { ...task.evaluation, status: 'done', plan, error: null, finishedAt: timestamp };
      if (task.status === 'planning' && doc.config.automationDefault === 'auto') {
        enterQueued(task, timestamp);
      }
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

    /** Running session went idle: hand the card to the delivery checker. */
    enterChecking(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'running') return { task };
      task.sessionRef = task.lease?.sessionId ?? task.sessionRef;
      task.status = 'checking';
      task.lease = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    /** Checker saw the session pick work back up. */
    backToRunning(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'checking' || !task.sessionRef) return { task };
      const timestamp = now();
      task.status = 'running';
      task.check = null;
      task.lease = { sessionId: task.sessionRef, sessionDirectory: task.sessionDirectoryRef ?? null, claimedAt: timestamp, expiresAt: timestamp + DEFAULT_LEASE_TTL_MS };
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Checker passed the delivery: human gate, or straight to merging for green plans. */
    moveToReview(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'checking') return { task };
      task.status = 'review';
      task.check = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    moveToMerging(taskId) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (!['checking', 'review'].includes(task.status)) return { task };
      task.status = 'merging';
      task.queue = task.queue ?? { state: 'queued', enqueuedAt: now(), rebaseAttempts: 0 };
      task.check = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    /** Checker rejected the delivery; hand feedback back to the worker session. */
    sendBackForRework(taskId, { checkAttempts } = {}) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      if (task.status !== 'checking') return { task };
      const timestamp = now();
      task.status = 'running';
      task.checkAttempts = checkAttempts ?? (task.checkAttempts ?? 0) + 1;
      task.check = null;
      task.lease = task.sessionRef
        ? { sessionId: task.sessionRef, sessionDirectory: task.sessionDirectoryRef ?? null, claimedAt: timestamp, expiresAt: timestamp + DEFAULT_LEASE_TTL_MS }
        : task.lease;
      task.updatedAt = timestamp;
      saveDoc(doc);
      return { task };
    },

    /** Server-owned write-backs (reconciler / checker / merge queue only). */
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

    setCheck(taskId, check) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      task.check = check;
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
      task.check = null;
      task.updatedAt = now();
      saveDoc(doc);
      return { task };
    },

    /**
     * Human actions on the pipeline:
     * approve (Planning) — plan accepted, join the queue
     * retryEvaluation (Planning) — re-judge a failed evaluation
     * merge (Review) — queue a PR-backed card for the serial merge queue
     * accept (Review) — land a PR-less card (report deliverable) directly
     * return (Review) — send the card back for rework
     */
    taskAction(taskId, action) {
      const doc = loadDoc();
      const task = findTask(doc, taskId);
      const timestamp = now();
      if (action === 'approve') {
        if (task.status !== 'planning') throw new TaskHunterControlError(`Task is not planning (status: ${task.status})`, 409);
        if (task.evaluation?.status !== 'done' || !task.evaluation.plan) throw new TaskHunterControlError('Task has no approved-ready launch plan yet', 409);
        enterQueued(task, timestamp);
      } else if (action === 'retryEvaluation') {
        if (task.status !== 'planning') throw new TaskHunterControlError(`Task is not planning (status: ${task.status})`, 409);
        if (task.evaluation?.status !== 'failed') throw new TaskHunterControlError('Only failed evaluations can be retried', 409);
        task.evaluation = null;
      } else if (task.status !== 'review') {
        throw new TaskHunterControlError(`Task is not in review (status: ${task.status})`, 409);
      } else if (action === 'merge') {
        if (!task.pr?.number) throw new TaskHunterControlError('Task has no pull request to merge', 409);
        if (task.queue) throw new TaskHunterControlError(`Task already in merge queue (${task.queue.state})`, 409);
        task.status = 'merging';
        task.queue = { state: 'queued', enqueuedAt: timestamp, rebaseAttempts: 0 };
      } else if (action === 'accept') {
        if (task.pr?.number && !task.pr.merged) {
          throw new TaskHunterControlError('Task has an open pull request — merge it instead', 409);
        }
        task.status = 'done';
        task.queue = null;
      } else if (action === 'return') {
        if (task.sessionRef) {
          task.status = 'running';
          task.lease = { sessionId: task.sessionRef, sessionDirectory: task.sessionDirectoryRef ?? null, claimedAt: timestamp, expiresAt: timestamp + DEFAULT_LEASE_TTL_MS };
        } else {
          enterQueued(task, timestamp);
        }
        task.queue = null;
      } else {
        throw new TaskHunterControlError(`Unknown task action: ${action}`, 400);
      }
      task.updatedAt = timestamp;
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
      return doc.tasks.filter((task) => task.status === 'running' && task.lease && task.lease.expiresAt > timestamp).length;
    },

    /** Queued cards in dispatch order. */
    nextQueued(limit) {
      const doc = loadDoc();
      return doc.tasks
        .filter((task) => task.status === 'queued')
        .sort((a, b) => (a.queuedAt ?? a.createdAt) - (b.queuedAt ?? b.createdAt))
        .slice(0, limit);
    },

    /**
     * Recycle claims whose lease died. Cards return to the queue (their plan
     * survives); past maxAttempts they need attention.
     */
    releaseStaleClaims({ now: probeAt = now() } = {}) {
      const doc = loadDoc();
      const released = [];
      let changed = false;
      for (const task of doc.tasks) {
        if (task.status !== 'running') continue;
        const alive = task.lease && task.lease.expiresAt > probeAt;
        if (alive) continue;
        const attempts = (task.attempts ?? 0) + 1;
        task.attempts = attempts;
        task.sessionRef = task.lease?.sessionId ?? task.sessionRef;
        task.lease = null;
        const exhausted = attempts > (doc.config.maxAttempts ?? 2);
        if (exhausted) {
          task.status = 'blocked';
          task.blockedReason = 'dispatch failed too many times';
        } else {
          enterQueued(task, probeAt);
        }
        task.updatedAt = probeAt;
        released.push(task);
        changed = true;
      }
      if (changed) saveDoc(doc);
      return { released };
    },
  };
};

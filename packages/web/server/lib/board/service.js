import fs from 'node:fs';
import path from 'node:path';
import { TaskHunterControlError } from '../taskhunter-control/error.js';

const BOARD_STATUSES = Object.freeze(['backlog', 'ready', 'in_progress', 'review', 'done']);

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 20_000;
const LABEL_MAX = 50;
const LABELS_MAX = 20;

const asString = (value) => (typeof value === 'string' ? value : null);
const asTrimmed = (value) => {
  const raw = asString(value);
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * File-backed Kanban board stored in the TaskHunter data directory
 * (board.json). Global single board: tasks carry a projectId so several
 * projects share one set of columns.
 */
export const createBoardService = ({
  dataDir,
  readSettingsFromDiskMigrated,
  sanitizeProjects,
  randomUUID = () => globalThis.crypto.randomUUID(),
} = {}) => {
  if (!dataDir) throw new Error('board service requires dataDir');
  const filePath = path.join(dataDir, 'board.json');

  const loadTasks = () => {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.tasks)) {
      throw new TaskHunterControlError('board.json is corrupt (missing tasks array)', 500);
    }
    return parsed.tasks;
  };

  const saveTasks = (tasks) => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
  };

  const assertProjectExists = async (projectId) => {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    if (!projects.some((entry) => entry.id === projectId)) {
      throw new TaskHunterControlError(`Project not found: ${projectId}`, 400);
    }
  };

  const normalizeTitle = (value) => {
    const title = asTrimmed(value);
    if (!title) throw new TaskHunterControlError('title is required', 400);
    if (title.length > TITLE_MAX) throw new TaskHunterControlError(`title exceeds ${TITLE_MAX} characters`, 400);
    return title;
  };

  const normalizeStatus = (value, fallback) => {
    if (value === undefined) return fallback;
    const status = asTrimmed(value);
    if (!status || !BOARD_STATUSES.includes(status)) {
      throw new TaskHunterControlError(`status must be one of: ${BOARD_STATUSES.join(', ')}`, 400);
    }
    return status;
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
    await assertProjectExists(projectId);
    return projectId;
  };

  const normalizeSessionIds = (value) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new TaskHunterControlError('sessionIds must be an array of strings', 400);
    }
    const ids = [];
    for (const entry of value) {
      const id = asTrimmed(entry);
      if (!id) throw new TaskHunterControlError('sessionIds must be non-empty strings', 400);
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const findTaskIndex = (tasks, taskId) => {
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index < 0) throw new TaskHunterControlError(`Task not found: ${taskId}`, 404);
    return index;
  };

  return {
    async list() {
      return { tasks: loadTasks() };
    },

    async create(payload = {}) {
      const now = Date.now();
      const task = {
        id: `t_${randomUUID()}`,
        projectId: (await normalizeProjectId(payload.projectId)) ?? null,
        title: normalizeTitle(payload.title),
        description: normalizeDescription(payload.description) ?? '',
        status: normalizeStatus(payload.status, 'backlog'),
        labels: normalizeLabels(payload.labels) ?? [],
        sessionIds: normalizeSessionIds(payload.sessionIds) ?? [],
        createdAt: now,
        updatedAt: now,
      };
      const tasks = loadTasks();
      tasks.push(task);
      saveTasks(tasks);
      return { task };
    },

    async update(taskId, patch = {}) {
      const tasks = loadTasks();
      const index = findTaskIndex(tasks, taskId);
      const current = tasks[index];
      const next = { ...current };

      if (patch.title !== undefined) next.title = normalizeTitle(patch.title);
      if (patch.status !== undefined) next.status = normalizeStatus(patch.status, current.status);
      if (patch.description !== undefined) next.description = normalizeDescription(patch.description) ?? '';
      if (patch.labels !== undefined) next.labels = normalizeLabels(patch.labels) ?? current.labels;
      if (patch.projectId !== undefined) next.projectId = (await normalizeProjectId(patch.projectId)) ?? null;
      if (patch.sessionIds !== undefined) next.sessionIds = normalizeSessionIds(patch.sessionIds) ?? current.sessionIds;
      // Claim helper: link one session without a read-modify-write race in the UI.
      if (patch.addSessionId !== undefined) {
        const sessionId = asTrimmed(patch.addSessionId);
        if (!sessionId) throw new TaskHunterControlError('addSessionId must be a non-empty string', 400);
        if (!next.sessionIds.includes(sessionId)) next.sessionIds = [...next.sessionIds, sessionId];
      }

      next.updatedAt = Date.now();
      tasks[index] = next;
      saveTasks(tasks);
      return { task: next };
    },

    async remove(taskId) {
      const tasks = loadTasks();
      const index = findTaskIndex(tasks, taskId);
      const [removed] = tasks.splice(index, 1);
      saveTasks(tasks);
      return { task: removed };
    },
  };
};

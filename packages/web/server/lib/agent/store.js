// JSON-file session store for builtin engine sessions.
//
// Layout: <dataDir>/sessions/<sessionId>.json, written atomically (tmp file +
// rename). An in-memory index (id -> {directory, updated}) is rebuilt by
// scanning the directory on first use and kept write-through after that, so
// hot-path lookups never touch disk.
//
// The store is dumb storage: no events, no side effects. Corrupt files throw
// (failure, never empty success); unknown IDs return null so the engine
// router can fall through to the OpenCode proxy.

import { createMessageId, createSessionId } from './types.js';

const STORE_VERSION = 1;
const SESSIONS_SUBDIR = 'sessions';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const isValidTokens = (value) => isRecord(value)
  && Number.isFinite(value.input)
  && Number.isFinite(value.output);

const isValidSessionInfo = (session, id) => isRecord(session)
  && session.id === id
  && typeof session.directory === 'string'
  && typeof session.title === 'string'
  && isRecord(session.model)
  && typeof session.model.providerID === 'string'
  && typeof session.model.modelID === 'string'
  && isRecord(session.time)
  && Number.isFinite(session.time.created)
  && Number.isFinite(session.time.updated);

const isValidMessage = (message, sessionId) => isRecord(message)
  && isRecord(message.info)
  && typeof message.info.id === 'string'
  && message.info.sessionID === sessionId
  && (message.info.role === 'user' || message.info.role === 'assistant')
  && Array.isArray(message.parts);

const validateRecord = (record, id) => {
  if (!isRecord(record) || record.version !== STORE_VERSION) {
    throw new Error(`builtin session record has unsupported version (id ${id})`);
  }
  if (!isValidSessionInfo(record.session, id)) {
    throw new Error(`builtin session record has invalid session info (id ${id})`);
  }
  if (!Array.isArray(record.messages) || !record.messages.every((message) => isValidMessage(message, id))) {
    throw new Error(`builtin session record has invalid messages (id ${id})`);
  }
  return record;
};

export const createAgentStore = ({ fsPromises, path, dataDir }) => {
  if (!fsPromises || !path || typeof dataDir !== 'string' || dataDir.length === 0) {
    throw new Error('createAgentStore requires fsPromises, path, and dataDir');
  }

  const sessionsDir = path.join(dataDir, SESSIONS_SUBDIR);
  const index = new Map();
  let loaded = false;

  const sessionPath = (id) => path.join(sessionsDir, `${id}.json`);

  const readRecord = async (id) => {
    let raw;
    try {
      raw = await fsPromises.readFile(sessionPath(id), 'utf8');
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return null;
      }
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`builtin session record is not valid JSON (id ${id})`);
    }
    return validateRecord(parsed, id);
  };

  const writeRecord = async (record) => {
    await fsPromises.mkdir(sessionsDir, { recursive: true });
    const tmpPath = `${sessionPath(record.session.id)}.tmp-${process.pid}-${Date.now()}`;
    await fsPromises.writeFile(tmpPath, JSON.stringify(record), 'utf8');
    await fsPromises.rename(tmpPath, sessionPath(record.session.id));
    index.set(record.session.id, {
      directory: record.session.directory,
      updated: record.session.time.updated,
    });
  };

  const ensureLoaded = async () => {
    if (loaded) {
      return;
    }
    loaded = true;
    let entries;
    try {
      entries = await fsPromises.readdir(sessionsDir);
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const id = entry.slice(0, -'.json'.length);
      try {
        const record = await readRecord(id);
        if (record) {
          index.set(id, { directory: record.session.directory, updated: record.session.time.updated });
        }
      } catch {
        // A corrupt file must not block the whole index; reads of that ID
        // still throw when actually accessed.
      }
    }
  };

  const blankTokens = () => ({ input: 0, output: 0, reasoning: 0 });

  const create = async ({ directory, title, agent, model }) => {
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new Error('create builtin session requires a directory');
    }
    if (!isRecord(model) || typeof model.providerID !== 'string' || typeof model.modelID !== 'string') {
      throw new Error('create builtin session requires model.providerID and model.modelID');
    }
    await ensureLoaded();
    const now = Date.now();
    const record = {
      version: STORE_VERSION,
      session: {
        id: createSessionId(),
        directory,
        title: typeof title === 'string' && title.length > 0 ? title : 'New session',
        agent: typeof agent === 'string' && agent.length > 0 ? agent : 'build',
        model: { providerID: model.providerID, modelID: model.modelID },
        time: { created: now, updated: now },
        tokens: blankTokens(),
        cost: 0,
        revert: null,
        revertedTail: null,
      },
      messages: [],
    };
    await writeRecord(record);
    return record;
  };

  const has = async (id) => {
    if (typeof id !== 'string' || id.length === 0) {
      return false;
    }
    await ensureLoaded();
    return index.has(id);
  };

  const count = async () => {
    await ensureLoaded();
    return index.size;
  };

  const get = async (id) => {
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }
    await ensureLoaded();
    if (!index.has(id)) {
      return null;
    }
    return readRecord(id);
  };

  const list = async ({ directory } = {}) => {
    await ensureLoaded();
    const sessions = [];
    for (const id of index.keys()) {
      const record = await readRecord(id);
      if (!record) {
        continue;
      }
      if (typeof directory === 'string' && directory.length > 0 && record.session.directory !== directory) {
        continue;
      }
      sessions.push(record.session);
    }
    sessions.sort((a, b) => b.time.updated - a.time.updated);
    return sessions;
  };

  const updateSession = async (id, patch) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    if (!isRecord(patch)) {
      throw new Error('updateSession patch must be an object');
    }
    const now = Date.now();
    const next = {
      ...record,
      session: {
        ...record.session,
        ...patch,
        id: record.session.id,
        time: { ...record.session.time, ...(isRecord(patch.time) ? patch.time : {}), updated: now },
      },
    };
    if (!isValidTokens(next.session.tokens)) {
      next.session.tokens = blankTokens();
    }
    await writeRecord(validateRecord(next, id));
    return next.session;
  };

  const appendMessage = async (id, info, parts) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    if (!isRecord(info) || (info.role !== 'user' && info.role !== 'assistant')) {
      throw new Error('appendMessage requires a user or assistant message info');
    }
    const message = {
      info: {
        ...info,
        id: typeof info.id === 'string' && info.id.length > 0 ? info.id : createMessageId(),
        sessionID: id,
        time: { created: Date.now(), ...(isRecord(info.time) ? info.time : {}) },
      },
      parts: Array.isArray(parts) ? parts : [],
    };
    const next = {
      ...record,
      session: { ...record.session, time: { ...record.session.time, updated: Date.now() } },
      messages: [...record.messages, message],
    };
    await writeRecord(validateRecord(next, id));
    return message;
  };

  const updateMessage = async (id, message) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    const position = record.messages.findIndex((entry) => entry?.info?.id === message?.info?.id);
    if (position === -1) {
      throw new Error(`message ${message?.info?.id} not found in builtin session ${id}`);
    }
    const messages = record.messages.slice();
    messages[position] = message;
    const next = {
      ...record,
      session: { ...record.session, time: { ...record.session.time, updated: Date.now() } },
      messages,
    };
    await writeRecord(validateRecord(next, id));
    return message;
  };

  // Simplified revert: truncate the tail after the target user message and
  // stash it on the session record for unrevert. The UI already treats
  // send-after-revert as a new branch, which matches truncation.
  const revert = async (id, messageID) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    const position = record.messages.findIndex((entry) => entry?.info?.id === messageID);
    if (position === -1) {
      throw new Error(`message ${messageID} not found in builtin session ${id}`);
    }
    const tail = record.messages.slice(position + 1);
    const next = {
      ...record,
      session: {
        ...record.session,
        time: { ...record.session.time, updated: Date.now() },
        revert: { messageID },
        revertedTail: tail,
      },
      messages: record.messages.slice(0, position + 1),
    };
    await writeRecord(validateRecord(next, id));
    return next.session;
  };

  const unrevert = async (id) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    const tail = Array.isArray(record.session.revertedTail) ? record.session.revertedTail : [];
    const next = {
      ...record,
      session: {
        ...record.session,
        time: { ...record.session.time, updated: Date.now() },
        revert: null,
        revertedTail: null,
      },
      messages: [...record.messages, ...tail],
    };
    await writeRecord(validateRecord(next, id));
    return next.session;
  };

  // Fork copies history up to and including the target message (or everything
  // when no target is given) into a fresh session in the same directory.
  const fork = async (id, messageID) => {
    const record = await get(id);
    if (!record) {
      return null;
    }
    let messages = record.messages;
    if (typeof messageID === 'string' && messageID.length > 0) {
      const position = record.messages.findIndex((entry) => entry?.info?.id === messageID);
      if (position === -1) {
        throw new Error(`message ${messageID} not found in builtin session ${id}`);
      }
      messages = record.messages.slice(0, position + 1);
    }
    const created = await create({
      directory: record.session.directory,
      title: record.session.title,
      agent: record.session.agent,
      model: record.session.model,
    });
    const now = Date.now();
    const remapped = messages.map((message) => ({
      info: { ...message.info, id: createMessageId(), sessionID: created.session.id },
      parts: (message.parts || []).map((part) => (isRecord(part) ? { ...part, sessionID: created.session.id } : part)),
    }));
    const next = {
      ...created,
      session: { ...created.session, time: { ...created.session.time, updated: now } },
      messages: remapped,
    };
    await writeRecord(validateRecord(next, created.session.id));
    return next;
  };

  const remove = async (id) => {
    await ensureLoaded();
    if (!index.has(id)) {
      return false;
    }
    try {
      await fsPromises.unlink(sessionPath(id));
    } catch (error) {
      if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
        throw error;
      }
    }
    index.delete(id);
    return true;
  };

  return {
    create,
    has,
    count,
    get,
    list,
    updateSession,
    appendMessage,
    updateMessage,
    revert,
    unrevert,
    fork,
    remove,
  };
};

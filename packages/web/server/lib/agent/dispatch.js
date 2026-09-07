// In-process session operations for the builtin engine.
//
// The HTTP router (routes.js) and server-side callers (board, scheduled
// tasks, TaskHunter control, session service) share one implementation here:
// the router marshals HTTP to these operations, and internal callers that
// already hold session IDs call them directly instead of fetching upstream.
// Ownership is decided by the store, never by ID parsing. Errors carry
// statusCode/code so callers can map them without string matching.

import { ENGINE_BUILTIN } from './types.js';
import { toSessionInfo } from './session-info.js';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const error = (message, statusCode, code) => {
  const raised = new Error(message);
  raised.statusCode = statusCode;
  if (code) raised.code = code;
  return raised;
};

export const createAgentDispatch = ({ engine }) => {
  if (!engine || !engine.store || typeof engine.startTurn !== 'function') {
    throw new Error('createAgentDispatch requires the agent engine runtime');
  }
  const { store, events } = engine;

  const ownsSession = async (sessionID) => {
    if (typeof sessionID !== 'string' || sessionID.length === 0) return false;
    try {
      return await store.has(sessionID);
    } catch {
      return false;
    }
  };

  // New sessions follow the settings engine; internal callers consult this
  // before choosing between createSession here and the upstream path.
  const creationIsBuiltin = async () => {
    try {
      const settings = await engine.readEngineSettings();
      return settings.engine === ENGINE_BUILTIN;
    } catch {
      return false;
    }
  };

  const createSession = async ({ directory, title, agent, model }) => {
    if (typeof directory !== 'string' || directory.length === 0) {
      throw error('directory is required', 400);
    }
    // Mirror the router's create handler: a missing default model ref still
    // creates the session; the first turn surfaces the provider error, which
    // matches how an unknown model behaves downstream.
    const modelRef = isRecord(model)
      ? model
      : (await engine.resolveDefaultModelRef().catch(() => null)) ?? { providerID: 'opencode-go', modelID: 'unknown' };
    const created = await store.create({
      directory,
      title: typeof title === 'string' && title.length > 0 ? title : 'New session',
      agent: typeof agent === 'string' && agent.length > 0 ? agent : 'build',
      model: modelRef,
    });
    events.publish('session.created', { sessionID: created.session.id, info: toSessionInfo(created.session) }, directory);
    return toSessionInfo(created.session);
  };

  // Kicks a turn the way POST /session/:id/prompt_async does: text parts only,
  // busy sessions refuse, the user message lands synchronously before startTurn
  // so callers never poll upstream for a builtin turn they just dispatched.
  const prompt = async ({ sessionID, parts, model, agent, system }) => {
    const record = await store.get(sessionID);
    if (!record) {
      throw error(`builtin session not found: ${sessionID}`, 404, 'not_found');
    }
    const session = record.session;
    const partList = Array.isArray(parts) ? parts : null;
    if (!partList || partList.length === 0) {
      throw error('parts are required', 400);
    }
    for (const part of partList) {
      if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') {
        throw error('only text parts are supported on the builtin engine', 400, 'unsupported_part');
      }
    }
    let modelRef = session.model;
    if (isRecord(model)) {
      if (typeof model.providerID !== 'string' || typeof model.modelID !== 'string') {
        throw error('model.providerID and model.modelID are required', 400);
      }
      modelRef = { providerID: model.providerID, modelID: model.modelID };
    }
    if (engine.isBusy(sessionID)) {
      throw error('Session is busy', 409, 'session_busy');
    }
    const userBase = {
      role: 'user',
      agent: typeof agent === 'string' && agent.length > 0 ? agent : session.agent,
      model: modelRef,
    };
    if (isRecord(system) || typeof system === 'string') {
      userBase.system = system;
    }
    const userMessage = await store.appendMessage(sessionID, userBase,
      partList.map((part) => ({ type: 'text', text: part.text })));
    events.publish('message.updated', { sessionID, info: userMessage.info }, session.directory);
    const refreshed = await store.get(sessionID);
    events.publish('session.updated', { sessionID, info: toSessionInfo(refreshed ? refreshed.session : session) }, session.directory);
    try {
      engine.startTurn({ sessionID, modelRef, agent: userMessage.info.agent });
    } catch (turnError) {
      if (turnError?.code === 'session_busy') {
        throw error('Session is busy', 409, 'session_busy');
      }
      throw turnError;
    }
    return userMessage;
  };

  // null means "no builtin record for this ID" — the caller decides what an
  // absent session means; a lookup error surfaces as a throw.
  const getSession = async (sessionID, { directory } = {}) => {
    const record = await store.get(sessionID);
    if (!record) return null;
    if (typeof directory === 'string' && directory.length > 0 && record.session.directory !== directory) {
      return null;
    }
    return toSessionInfo(record.session);
  };

  const getMessages = async (sessionID, { directory, limit, before } = {}) => {
    const record = await store.get(sessionID);
    if (!record) return null;
    if (typeof directory === 'string' && directory.length > 0 && record.session.directory !== directory) {
      return null;
    }
    let messages = record.messages;
    if (typeof before === 'string' && before.length > 0) {
      const position = messages.findIndex((message) => message?.info?.id === before);
      messages = position === -1 ? [] : messages.slice(0, position);
    }
    const capped = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    return messages.slice(-capped);
  };

  // Busy state has one writer (startTurn rejects a second kick), so the
  // runtime map is authoritative for builtin sessions. Callers spread it over
  // the upstream status map to form the merged view (both engines, one UI).
  const busyMap = () => engine.getBusySessions();

  const getStatus = (sessionID) => (engine.isBusy(sessionID) ? { type: 'busy' } : { type: 'idle' });

  // null when the session itself is gone; a throw means the messageID was not
  // found (the router maps that to 404 with the message text).
  const forkSession = async (sessionID, { messageID } = {}) => {
    const exists = await store.has(sessionID);
    if (!exists) return null;
    const forked = await store.fork(sessionID, typeof messageID === 'string' && messageID.length > 0 ? messageID : undefined);
    events.publish('session.created', { sessionID: forked.session.id, info: toSessionInfo(forked.session) }, forked.session.directory);
    return toSessionInfo(forked.session);
  };

  const deleteSession = async (sessionID) => {
    const record = await store.get(sessionID);
    if (!record) return false;
    engine.abortTurn(sessionID);
    engine.permissions.cancelSession(sessionID);
    await store.remove(sessionID);
    events.publish('session.deleted', { sessionID, info: toSessionInfo(record.session) }, record.session.directory);
    return true;
  };

  const revert = async (sessionID, messageID) => {
    const updated = await store.revert(sessionID, messageID);
    if (!updated) return null;
    events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, updated.directory);
    return toSessionInfo(updated);
  };

  const unrevert = async (sessionID) => {
    const record = await store.get(sessionID);
    if (!record) return null;
    const updated = await store.unrevert(sessionID);
    events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, updated.directory);
    return toSessionInfo(updated);
  };

  const patchSession = async (sessionID, patch) => {
    const updated = await store.updateSession(sessionID, patch);
    if (!updated) return null;
    events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, updated.directory);
    return toSessionInfo(updated);
  };

  const listSessions = async ({ directory } = {}) => {
    const sessions = await store.list(directory ? { directory } : {});
    return sessions.map(toSessionInfo);
  };

  // Directory-scoped variant: upstream /session/status is per-directory, and
  // so is the merge — a busy session in another checkout must not idle the
  // caller's view nor borrow its slot.
  const busyMapFor = async (directory) => {
    const all = engine.getBusySessions();
    if (!directory) return all;
    const scoped = {};
    for (const sessionID of Object.keys(all)) {
      const record = await store.get(sessionID).catch(() => null);
      if (record?.session?.directory === directory) {
        scoped[sessionID] = all[sessionID];
      }
    }
    return scoped;
  };

  // Whether a provider can run on the builtin engine right now (Go needs a
  // key; custom providers need a valid config entry plus a stored key).
  // Session-routing gates consult this before committing new sessions or
  // model overrides to the builtin engine.
  const providerEligible = async (providerID) => {
    try {
      return await engine.providers.isProviderEligible(providerID);
    } catch {
      return false;
    }
  };

  return {
    ownsSession,
    creationIsBuiltin,
    providerEligible,
    createSession,
    prompt,
    getSession,
    getMessages,
    getStatus,
    forkSession,
    deleteSession,
    revert,
    unrevert,
    patchSession,
    listSessions,
    busyMap,
    busyMapFor,
    replyPermission: (requestID, reply) => engine.permissions.reply(requestID, { reply }),
    pendingPermissions: () => engine.permissions.list(),
    ownsPermission: (requestID) => engine.permissions.list().some((entry) => entry.id === requestID),
  };
};

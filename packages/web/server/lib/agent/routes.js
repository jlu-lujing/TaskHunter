// Engine router: serves builtin-session traffic, falls through otherwise.
//
// Mounted as app.use('/api', router) BEFORE the OpenCode readiness gate, so
// builtin requests never wait on OpenCode restarts. Every handler either
// fully serves a builtin-owned request or calls next() — the generic proxy
// chain behind it is untouched. Payloads mirror the OpenCode REST shapes the
// UI consumes; unsupported operations answer explicit 501 instead of leaking
// into the wrong engine.

import { ENGINE_BUILTIN } from './types.js';

const FETCH_TIMEOUT_MS = 10_000;

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// Session payloads never expose the stashed revert tail: it can hold full
// tool outputs and has no UI reader.
export const toSessionInfo = (session) => {
  if (!isRecord(session)) {
    return session;
  }
  const { revertedTail, ...info } = session;
  return info;
};

const sendJson = (res, status, body) => {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.status(status).json(body);
};

const MAX_JSON_BODY_BYTES = 1_000_000;

// Read a JSON body locally. Generic /api/* requests intentionally arrive
// unparsed (the proxy forwards raw bytes for fidelity), so engine-owned
// handlers parse only after deciding to serve — fallthrough traffic never
// touches the stream.
const readJsonBody = (req) => {
  if (req.body !== undefined) {
    return Promise.resolve(isRecord(req.body) ? req.body : null);
  }
  const contentType = typeof req.headers?.['content-type'] === 'string' ? req.headers['content-type'] : '';
  if (!contentType.includes('json')) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
        reject(Object.assign(new Error('JSON body too large'), { statusCode: 400 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(text);
        resolve(isRecord(parsed) ? parsed : null);
      } catch {
        reject(Object.assign(new Error('Request body is not valid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
};

export const createAgentRouter = ({ engine, readSettings, fetchImpl = fetch }) => {
  if (!engine || typeof readSettings !== 'function') {
    throw new Error('createAgentRouter requires an engine runtime and readSettings');
  }
  const { store, events, permissions, credentials, sse } = engine;

  const readEngineSettings = async () => {
    try {
      return await engine.readEngineSettings();
    } catch {
      return { engine: 'opencode', engineModel: null };
    }
  };

  // True when builtin traffic is possible: sessions exist locally or new
  // sessions default to builtin. Otherwise every handler falls through and
  // the proxy path behaves exactly as before.
  const builtinActive = async () => {
    const [hasSessions, settings] = await Promise.all([
      engine.hasAnySessions().catch(() => false),
      readEngineSettings(),
    ]);
    return hasSessions || settings.engine === ENGINE_BUILTIN;
  };

  const resolveDirectory = (req) => {
    const query = req.query && typeof req.query.directory === 'string' && req.query.directory.length > 0
      ? req.query.directory
      : null;
    if (query) {
      return query;
    }
    const header = req.headers?.['x-opencode-directory'];
    if (typeof header !== 'string' || header.length === 0) {
      return null;
    }
    if (req.headers?.['x-opencode-directory-encoding'] === 'uri') {
      try {
        return decodeURIComponent(header);
      } catch {
        return header;
      }
    }
    return header;
  };

  const matchSessionPath = (pathname) => {
    const match = /^\/session\/([^/]+)(\/.*)?$/.exec(pathname);
    if (!match) {
      return null;
    }
    return { sessionID: decodeURIComponent(match[1]), rest: match[2] || '' };
  };

  const fetchUpstreamJson = async (upstreamPath, { query = '', method = 'GET', body } = {}) => {
    const url = `${engine.buildOpenCodeUrl(upstreamPath, '')}${query}`;
    const headers = { Accept: 'application/json', ...(engine.getOpenCodeAuthHeaders?.() || {}) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetchImpl(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`upstream ${method} ${upstreamPath} failed with ${response.status}`), { status: response.status });
    }
    return response.json().catch(() => null);
  };

  const sessionUpdatedAt = (session) => {
    if (typeof session?.time_updated === 'number') {
      return session.time_updated;
    }
    if (typeof session?.time?.updated === 'number') {
      return session.time.updated;
    }
    return 0;
  };

  const mergeSessionLists = (opencodeList, builtinList) => {
    const merged = [...(Array.isArray(opencodeList) ? opencodeList : []), ...(Array.isArray(builtinList) ? builtinList : [])];
    merged.sort((a, b) => sessionUpdatedAt(b) - sessionUpdatedAt(a));
    return merged;
  };

  // GET /session and GET /experimental/session: all-or-nothing merge. If the
  // OpenCode side fails the whole request fails so the UI preserves prior
  // state instead of snapshotting a partial list as complete.
  const handleSessionList = async (req, res, next, upstreamPath) => {
    if (!(await builtinActive())) {
      return next();
    }
    const directory = resolveDirectory(req);
    const rawQuery = typeof req.originalUrl === 'string' && req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    let opencodeList;
    try {
      opencodeList = await fetchUpstreamJson(upstreamPath, { query: rawQuery });
    } catch (error) {
      return sendJson(res, 503, { error: 'OpenCode service unavailable' });
    }
    let builtinSessions;
    try {
      builtinSessions = await store.list(directory ? { directory } : {});
    } catch (error) {
      return sendJson(res, 500, { error: error?.message ?? 'Builtin session list failed' });
    }
    const filtered = upstreamPath === '/experimental/session' && /(^|[?&])archived=true/.test(rawQuery)
      ? []
      : builtinSessions.map(toSessionInfo);
    return sendJson(res, 200, mergeSessionLists(opencodeList, filtered));
  };

  const handleSessionStatus = async (req, res, next) => {
    if (!(await builtinActive())) {
      return next();
    }
    const rawQuery = typeof req.originalUrl === 'string' && req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    let opencodeStatus;
    try {
      opencodeStatus = await fetchUpstreamJson('/session/status', { query: rawQuery });
    } catch (error) {
      return sendJson(res, 503, { error: 'OpenCode service unavailable' });
    }
    // Status snapshots seed idle for omitted sessions; a partial merge would
    // wrongly idle the other engine's sessions, so both sides are required.
    return sendJson(res, 200, { ...(isRecord(opencodeStatus) ? opencodeStatus : {}), ...engine.getBusySessions() });
  };

  const handlePermissionList = async (req, res, next) => {
    const directory = resolveDirectory(req);
    const builtinPending = await Promise.resolve(permissions.list(directory ? { directory } : {})).catch(() => []);
    if (builtinPending.length === 0 && !(await builtinActive())) {
      return next();
    }
    const rawQuery = typeof req.originalUrl === 'string' && req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    let opencodePending = [];
    try {
      const payload = await fetchUpstreamJson('/permission', { query: rawQuery });
      opencodePending = Array.isArray(payload) ? payload : [];
    } catch (error) {
      return sendJson(res, 503, { error: 'OpenCode service unavailable' });
    }
    return sendJson(res, 200, [...opencodePending, ...builtinPending]);
  };

  const requireBuiltinSession = async (req, res, next, sessionID) => {
    const record = await store.get(sessionID).catch(() => null);
    if (!record) {
      return { handled: false };
    }
    const directory = resolveDirectory(req);
    if (directory && record.session.directory !== directory) {
      sendJson(res, 404, { error: 'Session not found in directory' });
      return { handled: true };
    }
    return { handled: true, record };
  };

  const router = async (req, res, next) => {
    const pathname = req.path || '/';
    const method = req.method || 'GET';

    try {
      // Go API key management (TaskHunter-owned paths, no upstream twin).
      if (pathname === '/agent/go-api-key') {
        if (method === 'GET') {
          return sendJson(res, 200, { configured: await credentials.hasGoApiKey().catch(() => false) });
        }
        if (method === 'PUT') {
          const key = (await readJsonBody(req))?.key;
          if (typeof key !== 'string' || key.trim().length === 0) {
            await credentials.clearGoApiKey().catch(() => {});
            return sendJson(res, 200, { configured: false });
          }
          await credentials.setGoApiKey(key);
          return sendJson(res, 200, { configured: true });
        }
        return next();
      }

      // Event streams: multiplex when builtin data can exist, else proxy.
      if (method === 'GET' && pathname === '/global/event') {
        if (!(await builtinActive())) {
          return next();
        }
        return sse.handleGlobalEvent(req, res);
      }
      if (method === 'GET' && pathname === '/event') {
        if (!(await builtinActive())) {
          return next();
        }
        return sse.handleDirectoryEvent(req, res);
      }

      // Session creation honors the engine default for new sessions.
      if (method === 'POST' && pathname === '/session') {
        const settings = await readEngineSettings();
        if (settings.engine !== ENGINE_BUILTIN) {
          return next();
        }
        const body = (await readJsonBody(req)) || {};
        const directory = (typeof body.directory === 'string' && body.directory.length > 0 ? body.directory : null)
          || resolveDirectory(req);
        if (!directory) {
          return sendJson(res, 400, { error: 'directory is required' });
        }
        if (typeof body.parentID === 'string' && body.parentID.length > 0) {
          return sendJson(res, 400, { error: 'subagent sessions are not supported on the builtin engine', code: 'engine_unsupported' });
        }
        const defaultRef = await engine.resolveDefaultModelRef().catch(() => null);
        const created = await store.create({
          directory,
          title: typeof body.title === 'string' && body.title.length > 0 ? body.title : 'New session',
          agent: 'build',
          model: defaultRef ?? { providerID: 'opencode-go', modelID: 'unknown' },
        });
        events.publish('session.created', { sessionID: created.session.id, info: toSessionInfo(created.session) }, directory);
        return sendJson(res, 200, toSessionInfo(created.session));
      }

      if (method === 'GET' && pathname === '/session') {
        return handleSessionList(req, res, next, '/session');
      }
      if (method === 'GET' && pathname === '/experimental/session') {
        return handleSessionList(req, res, next, '/experimental/session');
      }
      if (method === 'GET' && pathname === '/session/status') {
        return handleSessionStatus(req, res, next);
      }
      if (method === 'GET' && pathname === '/permission') {
        return handlePermissionList(req, res, next);
      }

      // Permission replies carry no session marker; pending-registry
      // membership decides the engine.
      const permissionReply = method === 'POST' && /^\/permission\/([^/]+)\/reply\/?$/.exec(pathname);
      if (permissionReply) {
        const requestID = decodeURIComponent(permissionReply[1]);
        const pending = permissions.list().some((entry) => entry.id === requestID);
        if (!pending) {
          return next();
        }
        const body = (await readJsonBody(req)) || {};
        if (body.reply !== 'once' && body.reply !== 'always' && body.reply !== 'reject') {
          return sendJson(res, 400, { error: 'reply must be once, always, or reject' });
        }
        permissions.reply(requestID, { reply: body.reply });
        return sendJson(res, 200, {});
      }

      // Session-scoped routes dispatch on store membership.
      const sessionRoute = matchSessionPath(pathname);
      if (sessionRoute) {
        const { sessionID, rest } = sessionRoute;
        if (sessionID === 'status') {
          return next();
        }
        const gate = await requireBuiltinSession(req, res, next, sessionID);
        if (!gate.handled) {
          return next();
        }
        if (!gate.record) {
          return undefined;
        }
        const record = gate.record;
        const session = record.session;

        if (method === 'GET' && (rest === '' || rest === '/')) {
          return sendJson(res, 200, toSessionInfo(session));
        }
        if (method === 'PATCH' && (rest === '' || rest === '/')) {
          const body = (await readJsonBody(req)) || {};
          const patch = {};
          if (typeof body.title === 'string') {
            patch.title = body.title;
          }
          if (isRecord(body.metadata)) {
            patch.metadata = body.metadata;
          }
          if (isRecord(body.time) && Number.isFinite(body.time.archived)) {
            patch.time = { archived: body.time.archived };
          }
          const updated = await store.updateSession(sessionID, patch);
          events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, session.directory);
          return sendJson(res, 200, toSessionInfo(updated));
        }
        if (method === 'DELETE' && (rest === '' || rest === '/')) {
          engine.abortTurn(sessionID);
          await store.remove(sessionID);
          events.publish('session.deleted', { sessionID, info: toSessionInfo(session) }, session.directory);
          return sendJson(res, 200, {});
        }
        if (method === 'GET' && rest === '/message') {
          const limitRaw = req.query?.limit;
          const limit = Number.isSafeInteger(Number(limitRaw)) && Number(limitRaw) > 0 ? Math.min(Number(limitRaw), 200) : 50;
          const before = typeof req.query?.before === 'string' && req.query.before.length > 0 ? req.query.before : null;
          let messages = record.messages;
          if (before) {
            const position = messages.findIndex((message) => message?.info?.id === before);
            messages = position === -1 ? [] : messages.slice(0, position);
          }
          return sendJson(res, 200, messages.slice(-limit));
        }
        if (method === 'POST' && rest === '/prompt_async') {
          const body = (await readJsonBody(req)) || {};
          const parts = Array.isArray(body.parts) ? body.parts : null;
          if (!parts || parts.length === 0) {
            return sendJson(res, 400, { error: 'parts are required' });
          }
          for (const part of parts) {
            if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') {
              return sendJson(res, 400, { error: 'only text parts are supported on the builtin engine', code: 'unsupported_part' });
            }
          }
          let modelRef = null;
          if (isRecord(body.model)) {
            if (typeof body.model.providerID !== 'string' || typeof body.model.modelID !== 'string') {
              return sendJson(res, 400, { error: 'model.providerID and model.modelID are required' });
            }
            modelRef = { providerID: body.model.providerID, modelID: body.model.modelID };
          } else {
            modelRef = session.model;
          }
          if (engine.isBusy(sessionID)) {
            return sendJson(res, 409, { error: 'Session is busy', code: 'session_busy' });
          }
          const userMessage = await store.appendMessage(sessionID, {
            role: 'user',
            agent: typeof body.agent === 'string' && body.agent.length > 0 ? body.agent : session.agent,
            model: modelRef,
            ...(isRecord(body.system) || typeof body.system === 'string' ? { system: body.system } : {}),
          }, parts.map((part) => ({ type: 'text', text: part.text })));
          events.publish('message.updated', { sessionID, info: userMessage.info }, session.directory);
          events.publish('session.updated', { sessionID, info: toSessionInfo((await store.get(sessionID)).session) }, session.directory);
          try {
            engine.startTurn({ sessionID, modelRef, agent: userMessage.info.agent });
          } catch (error) {
            if (error?.code === 'session_busy') {
              return sendJson(res, 409, { error: 'Session is busy', code: 'session_busy' });
            }
            throw error;
          }
          return sendJson(res, 200, userMessage);
        }
        if (method === 'POST' && rest === '/abort') {
          engine.abortTurn(sessionID);
          return sendJson(res, 200, {});
        }
        if (method === 'POST' && rest === '/revert') {
          const body = (await readJsonBody(req)) || {};
          if (typeof body.messageID !== 'string' || body.messageID.length === 0) {
            return sendJson(res, 400, { error: 'messageID is required' });
          }
          const updated = await store.revert(sessionID, body.messageID).catch((error) => {
            sendJson(res, 404, { error: error?.message ?? 'Message not found' });
            return null;
          });
          if (!updated) {
            return undefined;
          }
          events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, session.directory);
          return sendJson(res, 200, toSessionInfo(updated));
        }
        if (method === 'POST' && rest === '/unrevert') {
          const updated = await store.unrevert(sessionID);
          events.publish('session.updated', { sessionID, info: toSessionInfo(updated) }, session.directory);
          return sendJson(res, 200, toSessionInfo(updated));
        }
        if (method === 'POST' && rest === '/fork') {
          const body = (await readJsonBody(req)) || {};
          const forked = await store.fork(
            sessionID,
            typeof body.messageID === 'string' && body.messageID.length > 0 ? body.messageID : undefined,
          ).catch((error) => {
            sendJson(res, 404, { error: error?.message ?? 'Message not found' });
            return null;
          });
          if (!forked) {
            return undefined;
          }
          events.publish('session.created', { sessionID: forked.session.id, info: toSessionInfo(forked.session) }, forked.session.directory);
          return sendJson(res, 200, toSessionInfo(forked.session));
        }
        if (method === 'POST' && rest === '/summarize') {
          await engine.compactNow(sessionID, null);
          const refreshed = await store.get(sessionID);
          return sendJson(res, 200, toSessionInfo(refreshed ? refreshed.session : session));
        }
        if (method === 'POST' && (rest === '/command' || rest === '/shell')) {
          return sendJson(res, 501, { error: 'Slash commands and shell mode are not supported on the builtin engine yet', code: 'engine_unsupported' });
        }
        if (method === 'GET' && rest === '/todo') {
          return sendJson(res, 200, []);
        }
        return next();
      }

      if (method === 'POST' && pathname === '/experimental/control-plane/move-session') {
        const body = (await readJsonBody(req)) || {};
        const targetID = typeof body.sessionID === 'string' ? body.sessionID : null;
        const destination = isRecord(body.destination) && typeof body.destination.directory === 'string'
          ? body.destination.directory
          : null;
        if (!targetID || !destination) {
          return next();
        }
        const record = await store.get(targetID).catch(() => null);
        if (!record) {
          return next();
        }
        const updated = await store.updateSession(targetID, { directory: destination });
        events.publish('session.updated', { sessionID: targetID, info: toSessionInfo(updated) }, destination);
        return sendJson(res, 200, toSessionInfo(updated));
      }

      return next();
    } catch (error) {
      if (!res.headersSent && !res.writableEnded) {
        const status = error && error.statusCode === 400 ? 400 : 500;
        sendJson(res, status, { error: error?.message ?? 'Builtin engine request failed' });
      }
      return undefined;
    }
  };

  return router;
};

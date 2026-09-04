// Composition root for the builtin agent engine.
//
// Builds store, events, permissions, providers, tools, compaction, loop,
// credentials, and SSE from server-owned dependencies, tracks running turns
// for abort/status, and fans builtin events into the global message-stream
// hub so the WS-primary UI path and every server consumer (watcher,
// notifications, auto-accept, board) observe builtin sessions without
// engine-specific code.

import { createAgentEventBus } from './events.js';
import { createPermissionRegistry } from './permissions.js';
import { createAgentStore } from './store.js';
import { createCompactionRuntime } from './compaction.js';
import { createAgentLoop } from './loop.js';
import { createAgentTools } from './tools.js';
import { createCredentialStore } from './credentials.js';
import { createProviderRouter, parseModelRef } from './providers/index.js';
import { createAgentSseMultiplexer } from './sse.js';
import { DEFAULT_BUILTIN_MODEL_REF, DEFAULT_ENGINE, ENGINE_BUILTIN, ENGINE_VALUES } from './types.js';

export const AGENT_USER_AGENT = 'TaskHunter-agent';

export const createAgentEngineRuntime = ({
  fsPromises,
  path,
  os,
  dataDir,
  globalEventHub = null,
  readSettings,
  buildOpenCodeUrl = null,
  getOpenCodeAuthHeaders = null,
  userAgent = AGENT_USER_AGENT,
  fetchImpl = fetch,
  spawnImpl,
}) => {
  if (!fsPromises || !path || !os || typeof dataDir !== 'string' || dataDir.length === 0) {
    throw new Error('createAgentEngineRuntime requires fsPromises, path, os, and dataDir');
  }
  if (typeof readSettings !== 'function') {
    throw new Error('createAgentEngineRuntime requires readSettings');
  }

  const agentDir = path.join(dataDir, 'agent');
  const store = createAgentStore({ fsPromises, path, dataDir: agentDir });
  const events = createAgentEventBus();
  const permissions = createPermissionRegistry({ events });
  const credentials = createCredentialStore({ fsPromises, path, dataDir: agentDir });
  const providers = createProviderRouter({
    getGoApiKey: () => credentials.getGoApiKey(),
    userAgent,
    fetchImpl,
  });
  const compaction = createCompactionRuntime({ store, events, providers });
  const tools = createAgentTools({ fsPromises, path, os, spawnImpl });
  const loop = createAgentLoop({ store, events, permissions, providers, tools, compaction });
  const sse = createAgentSseMultiplexer({ buildOpenCodeUrl, getOpenCodeAuthHeaders, events, fetchImpl });

  // Running turns: sessionID -> AbortController. Single writer per session
  // (routes reject prompt_async on busy sessions), so no refcounting.
  const running = new Map();

  if (globalEventHub && typeof globalEventHub.publishLocalEvent === 'function') {
    events.subscribe((entry) => {
      try {
        globalEventHub.publishLocalEvent(entry);
      } catch (error) {
        console.warn('[agent-engine] hub publish failed:', error?.message ?? error);
      }
    });
  }

  const readEngineSettings = async () => {
    let settings = null;
    try {
      settings = await readSettings();
    } catch (error) {
      console.warn('[agent-engine] settings read failed, using engine defaults:', error?.message ?? error);
    }
    const engine = settings && ENGINE_VALUES.has(settings.engine) ? settings.engine : DEFAULT_ENGINE;
    const engineModel = typeof settings?.engineModel === 'string' && parseModelRef(settings.engineModel)
      ? settings.engineModel
      : DEFAULT_BUILTIN_MODEL_REF;
    return { engine, engineModel };
  };

  const resolveDefaultModelRef = async () => {
    const { engineModel } = await readEngineSettings();
    return parseModelRef(engineModel) ?? parseModelRef(DEFAULT_BUILTIN_MODEL_REF);
  };

  const isBuiltinSession = async (sessionID) => store.has(sessionID);

  const hasAnySessions = async () => (await store.count()) > 0;

  const isBusy = (sessionID) => running.has(sessionID);

  const getBusySessions = () => {
    const busy = {};
    for (const sessionID of running.keys()) {
      busy[sessionID] = { type: 'busy' };
    }
    return busy;
  };

  const resolveModelTarget = (modelRef) => providers.resolveProviderTarget(modelRef);

  const startTurn = ({ sessionID, modelRef, agent }) => {
    if (running.has(sessionID)) {
      throw Object.assign(new Error(`builtin session is busy: ${sessionID}`), { code: 'session_busy' });
    }
    const controller = new AbortController();
    running.set(sessionID, controller);
    const done = () => {
      if (running.get(sessionID) === controller) {
        running.delete(sessionID);
      }
    };
    void loop.runTurn({ sessionID, modelRef, agent, signal: controller.signal }).then(done, (error) => {
      done();
      console.error(`[agent-engine] turn failed for ${sessionID}:`, error?.message ?? error);
    });
    return controller;
  };

  const abortTurn = (sessionID) => {
    const controller = running.get(sessionID);
    if (!controller) {
      return false;
    }
    try {
      controller.abort();
    } catch {
    }
    return true;
  };

  const compactNow = async (sessionID, modelRef) => {
    const record = await store.get(sessionID);
    if (!record) {
      throw new Error(`builtin session not found: ${sessionID}`);
    }
    const ref = modelRef ?? record.session.model;
    return compaction.compact({ sessionID, modelRef: ref, agent: record.session.agent });
  };

  const shutdown = () => {
    for (const controller of running.values()) {
      try {
        controller.abort();
      } catch {
      }
    }
    running.clear();
  };

  return {
    store,
    events,
    permissions,
    credentials,
    providers,
    compaction,
    tools,
    loop,
    sse,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    readEngineSettings,
    resolveDefaultModelRef,
    resolveModelTarget,
    isBuiltinSession,
    hasAnySessions,
    isBusy,
    getBusySessions,
    startTurn,
    abortTurn,
    compactNow,
    shutdown,
    userAgent,
  };
};

// Blocking tool-permission registry for builtin sessions.
//
// The agent loop calls ask() when a tool needs approval; the call blocks
// until the UI (or the server auto-accept policy) replies through
// POST /permission/:id/reply. Replies of `always` are remembered per session
// so repeat calls with a matching pattern resolve without asking again.
//
// Pending requests are turn-scoped and in-memory: a server restart drops
// them, which is correct because running turns die with the process.

import { AgentEventType, createPermissionRequestId } from './types.js';

export const PermissionReply = {
  ONCE: 'once',
  ALWAYS: 'always',
  REJECT: 'reject',
};

const REPLY_VALUES = new Set([PermissionReply.ONCE, PermissionReply.ALWAYS, PermissionReply.REJECT]);

class PermissionRejectedError extends Error {
  constructor(message) {
    super(message || 'Permission rejected');
    this.name = 'PermissionRejectedError';
  }
}

class PermissionAbortedError extends Error {
  constructor(message) {
    super(message || 'Permission request aborted');
    this.name = 'AbortError';
  }
}

export const createPermissionRegistry = ({ events }) => {
  if (!events || typeof events.publish !== 'function') {
    throw new Error('createPermissionRegistry requires an event bus with publish()');
  }

  // requestID -> {resolve, reject, sessionID, directory, permission, patterns}
  const pending = new Map();
  // sessionID -> Set(pattern) remembered from `always` replies
  const sessionAllowlists = new Map();

  const rememberAlways = (sessionID, patterns) => {
    if (typeof sessionID !== 'string' || sessionID.length === 0) {
      return;
    }
    let allowlist = sessionAllowlists.get(sessionID);
    if (!allowlist) {
      allowlist = new Set();
      sessionAllowlists.set(sessionID, allowlist);
    }
    for (const pattern of Array.isArray(patterns) ? patterns : []) {
      if (typeof pattern === 'string' && pattern.length > 0) {
        allowlist.add(pattern);
      }
    }
  };

  const isAllowed = (sessionID, permission, patterns) => {
    const allowlist = sessionAllowlists.get(sessionID);
    if (!allowlist || allowlist.size === 0) {
      return false;
    }
    const candidates = [permission, ...(Array.isArray(patterns) ? patterns : [])];
    return candidates.some((candidate) => typeof candidate === 'string' && allowlist.has(candidate));
  };

  const settle = (requestID, outcome) => {
    const entry = pending.get(requestID);
    if (!entry) {
      return false;
    }
    pending.delete(requestID);
    if (outcome.reply === PermissionReply.REJECT) {
      entry.reject(new PermissionRejectedError(outcome.message));
    } else {
      if (outcome.reply === PermissionReply.ALWAYS) {
        rememberAlways(entry.sessionID, entry.patterns);
      }
      entry.resolve(outcome.reply);
    }
    events.publish(
      AgentEventType.PERMISSION_REPLIED,
      { sessionID: entry.sessionID, requestID, reply: outcome.reply },
      entry.directory,
    );
    return true;
  };

  const ask = ({ sessionID, directory, permission, patterns, metadata, signal } = {}) => {
    if (typeof sessionID !== 'string' || sessionID.length === 0) {
      return Promise.reject(new Error('permission ask requires a sessionID'));
    }
    if (typeof permission !== 'string' || permission.length === 0) {
      return Promise.reject(new Error('permission ask requires a permission name'));
    }
    if (isAllowed(sessionID, permission, patterns)) {
      return Promise.resolve(PermissionReply.ALWAYS);
    }
    const requestID = createPermissionRequestId();
    const patternList = Array.isArray(patterns) ? patterns.filter((entry) => typeof entry === 'string') : [];
    let onAbort = null;
    const promise = new Promise((resolve, reject) => {
      pending.set(requestID, { resolve, reject, sessionID, directory, permission, patterns: patternList });
      if (signal) {
        if (signal.aborted) {
          settle(requestID, { reply: PermissionReply.REJECT, message: 'Permission request aborted' });
          return;
        }
        onAbort = () => {
          const entry = pending.get(requestID);
          if (!entry) {
            return;
          }
          pending.delete(requestID);
          entry.reject(new PermissionAbortedError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    // The abort listener must not outlive the request: settling removes it.
    const cleanup = () => {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    };
    void promise.then(cleanup, cleanup);
    events.publish(
      AgentEventType.PERMISSION_ASKED,
      {
        id: requestID,
        sessionID,
        permission,
        patterns: patternList,
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
      },
      directory,
    );
    return promise;
  };

  const reply = (requestID, { reply: replyValue, message } = {}) => {
    if (!REPLY_VALUES.has(replyValue)) {
      throw new Error(`unknown permission reply: ${String(replyValue)}`);
    }
    return settle(requestID, { reply: replyValue, message });
  };

  const list = ({ directory } = {}) => {
    const requests = [];
    for (const [requestID, entry] of pending.entries()) {
      if (typeof directory === 'string' && directory.length > 0 && entry.directory !== directory) {
        continue;
      }
      requests.push({
        id: requestID,
        sessionID: entry.sessionID,
        permission: entry.permission,
        patterns: entry.patterns,
      });
    }
    return requests;
  };

  const cancelSession = (sessionID) => {
    let cancelled = 0;
    for (const [requestID, entry] of Array.from(pending.entries())) {
      if (entry.sessionID !== sessionID) {
        continue;
      }
      pending.delete(requestID);
      entry.reject(new PermissionAbortedError());
      cancelled += 1;
    }
    sessionAllowlists.delete(sessionID);
    return cancelled;
  };

  return {
    ask,
    reply,
    list,
    cancelSession,
    isAllowed,
    PermissionRejectedError,
    PermissionAbortedError,
  };
};

import { createEventId } from './types.js';

// Bounded replay so SSE fallback streams can resume after Last-Event-ID.
// The hub keeps its own replay for the WS path; this ring only serves the
// builtin SSE multiplexer (sse.js).
const DEFAULT_REPLAY_LIMIT = 500;

export const createAgentEventBus = ({ replayLimit = DEFAULT_REPLAY_LIMIT } = {}) => {
  const subscribers = new Set();
  const replay = [];
  const limit = Number.isSafeInteger(replayLimit) && replayLimit > 0 ? replayLimit : DEFAULT_REPLAY_LIMIT;

  const notify = (entry) => {
    for (const subscriber of Array.from(subscribers)) {
      try {
        const result = subscriber(entry);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => {
            console.warn('[agent-events] subscriber failed:', error?.message ?? error);
          });
        }
      } catch (error) {
        console.warn('[agent-events] subscriber failed:', error?.message ?? error);
      }
    }
  };

  // Publish an OpenCode-shaped event. `type` is one of AgentEventType and
  // `properties` carries the matching OpenCode payload fields. `directory`
  // scopes per-directory SSE streams; global broadcasts use 'global'.
  const publish = (type, properties, directory) => {
    if (typeof type !== 'string' || type.length === 0) {
      throw new Error('agent event type must be a non-empty string');
    }
    if (!properties || typeof properties !== 'object') {
      throw new Error('agent event properties must be an object');
    }
    const eventId = createEventId();
    const entry = {
      envelope: {
        directory: typeof directory === 'string' && directory.length > 0 ? directory : 'global',
        eventId,
      },
      payload: { type, properties },
    };
    replay.push(entry);
    if (replay.length > limit) {
      replay.splice(0, replay.length - limit);
    }
    notify(entry);
    return entry;
  };

  const subscribe = (subscriber) => {
    if (typeof subscriber !== 'function') {
      throw new Error('agent event subscriber must be a function');
    }
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  };

  // Entries published after `eventId`, optionally restricted to one
  // directory. Unknown IDs replay nothing: the subscriber missed the window
  // and must refetch state instead of receiving a partial stream.
  const replayAfter = (eventId, directory) => {
    if (typeof eventId !== 'string' || eventId.length === 0) {
      return [];
    }
    const index = replay.findIndex((entry) => entry.envelope.eventId === eventId);
    if (index === -1) {
      return [];
    }
    const after = replay.slice(index + 1);
    if (typeof directory === 'string' && directory.length > 0) {
      return after.filter((entry) => entry.envelope.directory === directory || entry.envelope.directory === 'global');
    }
    return after;
  };

  return {
    publish,
    subscribe,
    replayAfter,
  };
};

// Multiplexed SSE for builtin sessions: upstream OpenCode bytes plus local
// builtin events on one stream.
//
// The UI opens GET /api/global/event (global) and GET /api/event?directory=
// (per directory) with an SSE fallback transport. Upstream frames pass
// through verbatim; builtin entries serialize as id:/data: frames in the
// same OpenCode payload shape. Last-Event-ID replays missed builtin entries
// from the bus ring; upstream resume is the upstream server's job (the
// header is forwarded).
//
// Deviation, documented: when upstream is unreachable the stream stays alive
// with builtin events instead of failing. Upstream outages already break
// every other opencode path, but there is no reason to also silence local
// sessions.

const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

const writeFrame = (res, eventId, payload) => {
  if (res.writableEnded) {
    return false;
  }
  res.write(`id: ${eventId}\ndata: ${JSON.stringify(payload)}\n\n`);
  return true;
};

export const createAgentSseMultiplexer = ({ buildOpenCodeUrl, getOpenCodeAuthHeaders, events, fetchImpl = fetch }) => {
  if (typeof buildOpenCodeUrl !== 'function' || !events || typeof events.subscribe !== 'function') {
    throw new Error('createAgentSseMultiplexer requires buildOpenCodeUrl and an event bus');
  }

  const serve = async (req, res, { directory }) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const lastEventId = typeof req.headers?.['last-event-id'] === 'string' ? req.headers['last-event-id'] : null;
    let closed = false;
    const upstreamAbort = new AbortController();

    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      try {
        upstreamAbort.abort();
      } catch {
      }
    };

    // Missed builtin entries first, then live.
    if (lastEventId) {
      for (const entry of events.replayAfter(lastEventId, directory || undefined)) {
        if (!writeFrame(res, entry.envelope.eventId, entry.payload)) {
          break;
        }
      }
    }

    const unsubscribe = events.subscribe((entry) => {
      if (closed) {
        return;
      }
      if (directory && entry.envelope.directory !== 'global' && entry.envelope.directory !== directory) {
        return;
      }
      writeFrame(res, entry.envelope.eventId, entry.payload);
    });

    const heartbeat = setInterval(() => {
      if (closed || res.writableEnded) {
        close();
        return;
      }
      res.write(': ping\n\n');
    }, SSE_HEARTBEAT_INTERVAL_MS);
    if (heartbeat.unref) {
      heartbeat.unref();
    }

    req.on('close', close);

    // Upstream passthrough runs detached: it must never delay builtin
    // events, and its failure or clean end must not close the stream. Only
    // the client disconnecting ends the response.
    const pumpUpstream = async () => {
      try {
        const upstreamPath = directory
          ? `/event?directory=${encodeURIComponent(directory)}`
          : '/global/event';
        const headers = { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' };
        const authHeaders = typeof getOpenCodeAuthHeaders === 'function' ? getOpenCodeAuthHeaders() : {};
        for (const [key, value] of Object.entries(authHeaders || {})) {
          if (typeof value === 'string' && value.length > 0) {
            headers[key] = value;
          }
        }
        if (lastEventId) {
          headers['Last-Event-ID'] = lastEventId;
        }
        const upstream = await fetchImpl(buildOpenCodeUrl(upstreamPath, ''), {
          method: 'GET',
          headers,
          signal: upstreamAbort.signal,
        });
        if (!upstream.ok || !upstream.body) {
          throw new Error(`upstream SSE failed with ${upstream.status}`);
        }
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || closed) {
            break;
          }
          if (value && !res.writableEnded) {
            res.write(decoder.decode(value, { stream: true }));
          }
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && !closed) {
          console.warn('[agent-sse] upstream unavailable, serving builtin events only:', error?.message ?? error);
        }
      }
    };
    void pumpUpstream();
  };

  const handleGlobalEvent = (req, res) => serve(req, res, { directory: null });

  const handleDirectoryEvent = (req, res) => {
    let directory = null;
    if (req.query && typeof req.query.directory === 'string' && req.query.directory.length > 0) {
      directory = req.query.directory;
    } else {
      try {
        const url = new URL(req.originalUrl || req.url || '', 'http://localhost');
        directory = url.searchParams.get('directory');
      } catch {
        directory = null;
      }
    }
    return serve(req, res, { directory });
  };

  return {
    handleGlobalEvent,
    handleDirectoryEvent,
  };
};

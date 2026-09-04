import http from 'node:http';
import { describe, expect, it } from 'vitest';

import { createAgentEventBus } from './events.js';
import { createAgentSseMultiplexer } from './sse.js';
import { AgentEventType } from './types.js';

const startUpstreamServer = (body) => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(body);
    req.on('close', () => {
      try {
        res.end();
      } catch {
      }
    });
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const encode = (text) => new TextEncoder().encode(text);

const upstreamFetch = (chunks) => async () => ({
  ok: true,
  status: 200,
  body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encode(chunk));
      }
      controller.close();
    },
  }),
});

const createReqRes = ({ headers = {}, query = {}, url = '/api/global/event' } = {}) => {
  const written = [];
  const closeHandlers = [];
  const req = {
    headers,
    query,
    originalUrl: url,
    on: (event, handler) => {
      if (event === 'close') {
        closeHandlers.push(handler);
      }
    },
  };
  const res = {
    writableEnded: false,
    statusCode: null,
    responseHeaders: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.responseHeaders[key] = value;
    },
    flushHeaders() {},
    write(chunk) {
      written.push(String(chunk));
    },
    end() {
      this.writableEnded = true;
      for (const handler of closeHandlers) {
        handler();
      }
    },
  };
  return { req, res, written, finish: () => res.end() };
};

describe('agent SSE multiplexer', () => {
  it('forwards upstream bytes and interleaves builtin events', async () => {
    const server = await startUpstreamServer('data: {"type":"session.status","properties":{}}\n\n');
    try {
      const events = createAgentEventBus();
      const sse = createAgentSseMultiplexer({
        buildOpenCodeUrl: (pathname) => `http://127.0.0.1:${server.address().port}${pathname}`,
        getOpenCodeAuthHeaders: () => ({}),
        events,
      });
      const { req, res, written, finish } = createReqRes();
      await sse.handleGlobalEvent(req, res);
      // Publish while the stream is open, then close.
      events.publish(AgentEventType.SESSION_IDLE, { sessionID: 'bse_1' }, 'global');
      await new Promise((resolve) => setTimeout(resolve, 50));
      finish();

      expect(res.statusCode).toBe(200);
      expect(res.responseHeaders['Content-Type']).toBe('text/event-stream');
      const body = written.join('');
      expect(body).toContain('"type":"session.status"');
      expect(body).toContain('"type":"session.idle"');
    } finally {
      server.close();
    }
  });

  it('filters directory streams and serves builtin-only when upstream fails', async () => {
    const events = createAgentEventBus();
    const sse = createAgentSseMultiplexer({
      buildOpenCodeUrl: () => { throw new Error('down'); },
      getOpenCodeAuthHeaders: () => ({}),
      events,
      fetchImpl: async () => { throw new Error('down'); },
    });
    const { req, res, written, finish } = createReqRes({ query: { directory: '/one' }, url: '/api/event?directory=%2Fone' });
    const serving = sse.handleDirectoryEvent(req, res);
    events.publish(AgentEventType.SESSION_IDLE, { sessionID: 'a' }, '/one');
    events.publish(AgentEventType.SESSION_IDLE, { sessionID: 'b' }, '/two');
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish();
    await serving;

    const body = written.join('');
    expect(body).toContain('"sessionID":"a"');
    expect(body).not.toContain('"sessionID":"b"');
  });

  it('replays missed builtin entries after Last-Event-ID', async () => {
    const events = createAgentEventBus();
    const first = events.publish(AgentEventType.SESSION_IDLE, { sessionID: 'a' }, 'global');
    events.publish(AgentEventType.SESSION_IDLE, { sessionID: 'b' }, 'global');
    const sse = createAgentSseMultiplexer({
      buildOpenCodeUrl: () => { throw new Error('down'); },
      getOpenCodeAuthHeaders: () => ({}),
      events,
      fetchImpl: async () => { throw new Error('down'); },
    });
    const { req, res, written, finish } = createReqRes({ headers: { 'last-event-id': first.envelope.eventId } });
    const serving = sse.handleGlobalEvent(req, res);
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish();
    await serving;

    expect(written.join('')).toContain('"sessionID":"b"');
  });
});

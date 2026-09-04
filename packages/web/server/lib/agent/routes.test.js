import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentRouter } from './routes.js';
import { createAgentEngineRuntime } from './runtime.js';

const fsPromises = { mkdir, readdir, readFile, rename, unlink, writeFile, chmod };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const createReqRes = ({ path: pathname = '/', method = 'GET', query = {}, headers = {}, body, originalUrl } = {}) => {
  const req = { path: pathname, method, query, headers, body, originalUrl: originalUrl ?? pathname };
  const res = {
    statusCode: null,
    payload: undefined,
    headersSent: false,
    writableEnded: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, wasNext: () => nextCalled };
};

const makeHarness = ({ settings = {}, upstreamImpl } = {}) => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-routes-'));
  const engine = createAgentEngineRuntime({
    fsPromises,
    path,
    os,
    dataDir,
    globalEventHub: null,
    readSettings: async () => settings,
    buildOpenCodeUrl: (pathname) => `http://127.0.0.1:1${pathname}`,
    getOpenCodeAuthHeaders: () => ({}),
  });
  const started = [];
  engine.startTurn = ({ sessionID, modelRef, agent }) => {
    started.push({ sessionID, modelRef, agent });
    return { abort: () => {} };
  };
  const router = createAgentRouter({
    engine,
    readSettings: async () => settings,
    fetchImpl: upstreamImpl || (async () => { throw new Error('no upstream'); }),
  });
  return { engine, router, started };
};

const upstreamList = (sessions) => async () => ({
  ok: true,
  status: 200,
  json: async () => sessions,
});

const model = { providerID: 'opencode-go', modelID: 'm' };

describe('agent router', () => {
  it('falls through session creation when the engine default is opencode', async () => {
    const { router } = makeHarness({ settings: {} });
    const { req, res, next, wasNext } = createReqRes({
      path: '/session', method: 'POST', body: { directory: '/proj' },
    });
    await router(req, res, next);
    expect(wasNext()).toBe(true);
  });

  it('creates builtin sessions when configured, else 400 without directory', async () => {
    const { router, engine } = makeHarness({ settings: { engine: 'builtin', engineModel: 'opencode-go/m' } });
    const { req, res, next, wasNext } = createReqRes({
      path: '/session', method: 'POST', body: { directory: '/proj', title: 'T' },
    });
    await router(req, res, next);
    expect(wasNext()).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.payload.id.startsWith('bse_')).toBe(true);
    expect(res.payload.revertedTail).toBeUndefined();
    expect(await engine.store.has(res.payload.id)).toBe(true);

    const missing = createReqRes({ path: '/session', method: 'POST', body: {} });
    await router(missing.req, missing.res, missing.next);
    expect(missing.res.statusCode).toBe(400);
  });

  it('merges session lists newest-first and fails closed on upstream errors', async () => {
    const opencodeSessions = [{ id: 'ses_old', time: { updated: 100 } }];
    const { router, engine } = makeHarness({
      settings: { engine: 'builtin' },
      upstreamImpl: upstreamList(opencodeSessions),
    });
    const created = await engine.store.create({ directory: '/proj', model });
    await engine.store.updateSession(created.session.id, {});
    // Bump builtin recency above the opencode fixture.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await engine.store.appendMessage(created.session.id, { role: 'user', model }, []);

    const { req, res, next } = createReqRes({ path: '/session', method: 'GET', query: {}, originalUrl: '/session' });
    await router(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res.payload.map((session) => session.id)).toEqual([created.session.id, 'ses_old']);

    const failing = makeHarness({ settings: { engine: 'builtin' }, upstreamImpl: async () => ({ ok: false, status: 500 }) });
    const bad = createReqRes({ path: '/session', method: 'GET', query: {}, originalUrl: '/session' });
    await failing.router(bad.req, bad.res, bad.next);
    expect(bad.res.statusCode).toBe(503);
  });

  it('serves, patches, and deletes builtin sessions but falls through unknown ids', async () => {
    const { router, engine } = makeHarness({ settings: { engine: 'builtin' } });
    const created = await engine.store.create({ directory: '/proj', title: 'A', model });

    const get = createReqRes({ path: `/session/${created.session.id}`, method: 'GET' });
    await router(get.req, get.res, get.next);
    expect(get.res.payload.title).toBe('A');

    const unknown = createReqRes({ path: '/session/ses_nope', method: 'GET' });
    await router(unknown.req, unknown.res, unknown.next);
    expect(unknown.wasNext()).toBe(true);

    const patch = createReqRes({ path: `/session/${created.session.id}`, method: 'PATCH', body: { title: 'B' } });
    await router(patch.req, patch.res, patch.next);
    expect(patch.res.payload.title).toBe('B');

    const del = createReqRes({ path: `/session/${created.session.id}`, method: 'DELETE' });
    await router(del.req, del.res, del.next);
    expect(del.res.statusCode).toBe(200);
    expect(await engine.store.has(created.session.id)).toBe(false);
  });

  it('rejects cross-directory access with 404', async () => {
    const { router, engine } = makeHarness({ settings: { engine: 'builtin' } });
    const created = await engine.store.create({ directory: '/proj', model });
    const { req, res, next } = createReqRes({
      path: `/session/${created.session.id}`, method: 'GET', query: { directory: '/other' },
    });
    await router(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it('accepts prompts, starts turns, and rejects non-text parts', async () => {
    const { router, engine, started } = makeHarness({ settings: { engine: 'builtin' } });
    const created = await engine.store.create({ directory: '/proj', model });
    const { req, res, next } = createReqRes({
      path: `/session/${created.session.id}/prompt_async`,
      method: 'POST',
      body: { model, parts: [{ type: 'text', text: 'hello' }] },
    });
    await router(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res.payload.info.role).toBe('user');
    expect(started).toHaveLength(1);
    expect(started[0].sessionID).toBe(created.session.id);

    const bad = createReqRes({
      path: `/session/${created.session.id}/prompt_async`,
      method: 'POST',
      body: { model, parts: [{ type: 'file', url: 'file:///x', mime: 'text/plain' }] },
    });
    await router(bad.req, bad.res, bad.next);
    expect(bad.res.statusCode).toBe(400);
  });

  it('answers abort, todo, and unsupported sends', async () => {
    const { router, engine } = makeHarness({ settings: { engine: 'builtin' } });
    const created = await engine.store.create({ directory: '/proj', model });

    const abort = createReqRes({ path: `/session/${created.session.id}/abort`, method: 'POST', body: {} });
    await router(abort.req, abort.res, abort.next);
    expect(abort.res.statusCode).toBe(200);

    const todo = createReqRes({ path: `/session/${created.session.id}/todo`, method: 'GET' });
    await router(todo.req, todo.res, todo.next);
    expect(todo.res.payload).toEqual([]);

    const command = createReqRes({ path: `/session/${created.session.id}/command`, method: 'POST', body: {} });
    await router(command.req, command.res, command.next);
    expect(command.res.statusCode).toBe(501);
  });

  it('round-trips revert, unrevert, and fork', async () => {
    const { router, engine } = makeHarness({ settings: { engine: 'builtin' } });
    const created = await engine.store.create({ directory: '/proj', model });
    const first = await engine.store.appendMessage(created.session.id, { role: 'user', model }, []);
    await engine.store.appendMessage(created.session.id, { role: 'assistant', model }, []);

    const revert = createReqRes({
      path: `/session/${created.session.id}/revert`, method: 'POST', body: { messageID: first.info.id },
    });
    await router(revert.req, revert.res, revert.next);
    expect(revert.res.payload.revert).toEqual({ messageID: first.info.id });
    expect((await engine.store.get(created.session.id)).messages).toHaveLength(1);

    const unrevert = createReqRes({ path: `/session/${created.session.id}/unrevert`, method: 'POST', body: {} });
    await router(unrevert.req, unrevert.res, unrevert.next);
    expect((await engine.store.get(created.session.id)).messages).toHaveLength(2);

    const fork = createReqRes({
      path: `/session/${created.session.id}/fork`, method: 'POST', body: { messageID: first.info.id },
    });
    await router(fork.req, fork.res, fork.next);
    expect(fork.res.payload.id).not.toBe(created.session.id);
  });

  it('routes permission replies by registry membership', async () => {
    const { router, engine } = makeHarness({ settings: {} });
    const asked = engine.permissions.ask({ sessionID: 'bse_x', directory: '/proj', permission: 'bash' });
    const pending = engine.permissions.list()[0];
    const reply = createReqRes({ path: `/permission/${pending.id}/reply`, method: 'POST', body: { reply: 'once' } });
    await router(reply.req, reply.res, reply.next);
    expect(reply.res.statusCode).toBe(200);
    await expect(asked).resolves.toBe('once');

    const unknown = createReqRes({ path: '/permission/prm_nope/reply', method: 'POST', body: { reply: 'once' } });
    await router(unknown.req, unknown.res, unknown.next);
    expect(unknown.wasNext()).toBe(true);
  });

  it('moves builtin sessions across directories', async () => {
    const { router, engine } = makeHarness({ settings: {} });
    const created = await engine.store.create({ directory: '/a', model });
    const move = createReqRes({
      path: '/experimental/control-plane/move-session',
      method: 'POST',
      body: { sessionID: created.session.id, destination: { directory: '/b' } },
    });
    await router(move.req, move.res, move.next);
    expect(move.res.payload.directory).toBe('/b');

    const foreign = createReqRes({
      path: '/experimental/control-plane/move-session',
      method: 'POST',
      body: { sessionID: 'ses_opencode', destination: { directory: '/b' } },
    });
    await router(foreign.req, foreign.res, foreign.next);
    expect(foreign.wasNext()).toBe(true);
  });

  it('manages the go api key without ever returning it', async () => {
    const { router, engine } = makeHarness({ settings: {} });
    const before = createReqRes({ path: '/agent/go-api-key', method: 'GET' });
    await router(before.req, before.res, before.next);
    expect(before.res.payload).toEqual({ configured: false });

    const put = createReqRes({ path: '/agent/go-api-key', method: 'PUT', body: { key: 'secret' } });
    await router(put.req, put.res, put.next);
    expect(put.res.payload).toEqual({ configured: true });
    expect(await engine.credentials.getGoApiKey()).toBe('secret');

    const after = createReqRes({ path: '/agent/go-api-key', method: 'GET' });
    await router(after.req, after.res, after.next);
    expect(after.res.payload).toEqual({ configured: true });
    expect(JSON.stringify(after.res.payload)).not.toContain('secret');
  });

  it('parses raw JSON streams when no body parser ran', async () => {
    const { router, engine } = makeHarness({ settings: {} });
    const payload = Buffer.from(JSON.stringify({ key: 'stream-key' }));
    const stream = Readable.from([payload]);
    stream.path = '/agent/go-api-key';
    stream.method = 'PUT';
    stream.query = {};
    stream.headers = { 'content-type': 'application/json' };
    stream.originalUrl = '/agent/go-api-key';
    const res = {
      statusCode: null,
      payload: undefined,
      headersSent: false,
      writableEnded: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        return this;
      },
    };
    await router(stream, res, () => {});
    expect(res.payload).toEqual({ configured: true });
    expect(await engine.credentials.getGoApiKey()).toBe('stream-key');
  });

  it('answers 400 for malformed JSON streams', async () => {
    const { router } = makeHarness({ settings: {} });
    const stream = Readable.from([Buffer.from('{oops')]);
    stream.path = '/agent/go-api-key';
    stream.method = 'PUT';
    stream.query = {};
    stream.headers = { 'content-type': 'application/json' };
    stream.originalUrl = '/agent/go-api-key';
    const res = {
      statusCode: null,
      payload: undefined,
      headersSent: false,
      writableEnded: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        return this;
      },
    };
    await router(stream, res, () => {});
    expect(res.statusCode).toBe(400);
  });

  it('merges status maps from both engines', async () => {
    const { router, engine } = makeHarness({
      settings: { engine: 'builtin' },
      upstreamImpl: async () => ({ ok: true, status: 200, json: async () => ({ ses_a: { type: 'idle' } }) }),
    });
    engine.getBusySessions = () => ({ [ 'bse_busy' ]: { type: 'busy' } });
    const { req, res, next } = createReqRes({ path: '/session/status', method: 'GET', query: {}, originalUrl: '/session/status' });
    await router(req, res, next);
    expect(res.payload).toEqual({ ses_a: { type: 'idle' }, bse_busy: { type: 'busy' } });
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentStore } from './store.js';
import { createAgentEventBus } from './events.js';
import { createPermissionRegistry } from './permissions.js';
import { createAgentDispatch } from './dispatch.js';

const fsPromises = { mkdir, readdir, readFile, rename, unlink, writeFile };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const model = { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' };

const makeHarness = ({ engine = 'builtin', eligibleProviders = ['opencode-go'] } = {}) => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-dispatch-'));
  const store = createAgentStore({ fsPromises, path, dataDir });
  const events = createAgentEventBus();
  const permissions = createPermissionRegistry({ events });
  const started = [];
  const aborted = [];
  const engineRuntime = {
    store,
    events,
    permissions,
    providers: {
      isProviderEligible: async (providerID) => eligibleProviders.includes(providerID),
      // Capability-only predicate: what the builtin engine speaks at all,
      // never credential-aware (that is providerEligible's routing question).
      isProviderServed: (providerID) => providerID === 'opencode-go' || providerID.startsWith('x-'),
    },
    readEngineSettings: async () => ({ engine, engineModel: 'opencode-go/deepseek-v4-flash' }),
    resolveDefaultModelRef: async () => model,
    isBusy: (sessionID) => started.some((turn) => turn.sessionID === sessionID && !turn.done),
    getBusySessions: () => Object.fromEntries(
      started.filter((turn) => !turn.done).map((turn) => [turn.sessionID, { type: 'busy' }]),
    ),
    startTurn: ({ sessionID }) => {
      const turn = started.find((entry) => entry.sessionID === sessionID && !entry.done);
      if (turn) throw Object.assign(new Error('busy'), { code: 'session_busy' });
      started.push({ sessionID, done: false });
      return { abort: () => {} };
    },
    abortTurn: (sessionID) => {
      aborted.push(sessionID);
      const turn = started.find((entry) => entry.sessionID === sessionID && !entry.done);
      if (turn) turn.done = true;
      return true;
    },
  };
  const published = [];
  events.subscribe((entry) => published.push(entry));
  return {
    store,
    events,
    permissions,
    engineRuntime,
    published,
    finishTurn: (sessionID) => {
      const turn = started.find((entry) => entry.sessionID === sessionID && !entry.done);
      if (turn) turn.done = true;
    },
    dispatch: createAgentDispatch({ engine: engineRuntime }),
  };
};

describe('agent dispatch', () => {
  it('reports creation engine from settings', async () => {
    const builtin = makeHarness({ engine: 'builtin' });
    expect(await builtin.dispatch.creationIsBuiltin()).toBe(true);
    const opencode = makeHarness({ engine: 'opencode' });
    expect(await opencode.dispatch.creationIsBuiltin()).toBe(false);
  });

  it('creates builtin sessions and publishes session.created', async () => {
    const harness = makeHarness();
    const info = await harness.dispatch.createSession({ directory: '/proj', title: 'Plan' });
    expect(info.id.startsWith('bse_')).toBe(true);
    expect(info.title).toBe('Plan');
    expect(info.agent).toBe('build');
    expect(info.model).toEqual(model);
    expect(info.revertedTail).toBeUndefined();
    expect(await harness.store.has(info.id)).toBe(true);
    expect(harness.published.some((entry) => entry.payload.type === 'session.created'
      && entry.payload.properties.sessionID === info.id)).toBe(true);
  });

  it('kicks turns and refuses busy sessions with typed errors', async () => {
    const harness = makeHarness();
    const info = await harness.dispatch.createSession({ directory: '/proj' });

    const userMessage = await harness.dispatch.prompt({
      sessionID: info.id,
      parts: [{ type: 'text', text: 'hello' }],
    });
    expect(userMessage.info.role).toBe('user');
    expect(userMessage.parts[0].text).toBe('hello');
    expect(harness.engineRuntime.isBusy(info.id)).toBe(true);

    await expect(harness.dispatch.prompt({ sessionID: info.id, parts: [{ type: 'text', text: 'again' }] }))
      .rejects.toMatchObject({ statusCode: 409, code: 'session_busy' });

    harness.finishTurn(info.id);

    await expect(harness.dispatch.prompt({ sessionID: info.id, parts: [] }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(harness.dispatch.prompt({ sessionID: info.id, parts: [{ type: 'file', url: 'x' }] }))
      .rejects.toMatchObject({ statusCode: 400, code: 'unsupported_part' });
    await expect(harness.dispatch.prompt({
      sessionID: info.id,
      parts: [{ type: 'text', text: 'x' }],
      model: { providerID: 'opencode-go' },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves ownership, status, and directory-scoped readers', async () => {
    const harness = makeHarness();
    const info = await harness.dispatch.createSession({ directory: '/proj' });

    expect(await harness.dispatch.ownsSession(info.id)).toBe(true);
    expect(await harness.dispatch.ownsSession('ses_outside')).toBe(false);
    expect(await harness.dispatch.ownsSession('')).toBe(false);

    expect(harness.dispatch.getStatus(info.id).type).toBe('idle');
    await harness.dispatch.prompt({ sessionID: info.id, parts: [{ type: 'text', text: 'go' }] });
    expect(harness.dispatch.getStatus(info.id).type).toBe('busy');
    expect(await harness.dispatch.busyMapFor('/proj')).toEqual({ [info.id]: { type: 'busy' } });
    expect(await harness.dispatch.busyMapFor('/other')).toEqual({});

    expect((await harness.dispatch.getSession(info.id, { directory: '/other' }))).toBeNull();
    expect((await harness.dispatch.getSession(info.id, { directory: '/proj' })).id).toBe(info.id);
    const messages = await harness.dispatch.getMessages(info.id, { directory: '/proj' });
    expect(messages).toHaveLength(1);
    expect(await harness.dispatch.getMessages('bse_missing', {})).toBeNull();
  });

  it('forks, patches metadata, and deletes builtin sessions', async () => {
    const harness = makeHarness();
    const info = await harness.dispatch.createSession({ directory: '/proj', title: 'orig' });
    await harness.dispatch.prompt({ sessionID: info.id, parts: [{ type: 'text', text: 'one' }] });
    harness.finishTurn(info.id);

    const forked = await harness.dispatch.forkSession(info.id, {});
    expect(forked).not.toBeNull();
    expect(forked.id).not.toBe(info.id);
    const forkedRecord = await harness.store.get(forked.id);
    expect(forkedRecord.messages).toHaveLength(1);
    expect(await harness.dispatch.forkSession('bse_missing', {})).toBeNull();

    const patched = await harness.dispatch.patchSession(info.id, { metadata: { taskhunter: { goal: { id: 'g1' } } } });
    expect(patched.metadata.taskhunter.goal.id).toBe('g1');
    expect(await harness.dispatch.patchSession('bse_missing', { title: 'x' })).toBeNull();

    expect(await harness.dispatch.deleteSession(info.id)).toBe(true);
    expect(await harness.store.has(info.id)).toBe(false);
    expect(await harness.dispatch.deleteSession('bse_missing')).toBe(false);
  });

  it('lists sessions newest-first with directory filter and answers permissions', async () => {
    const harness = makeHarness();
    const a = await harness.dispatch.createSession({ directory: '/a', title: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = await harness.dispatch.createSession({ directory: '/b', title: 'b' });
    const list = await harness.dispatch.listSessions({ directory: '/b' });
    expect(list.map((session) => session.id)).toEqual([b.id]);
    expect((await harness.dispatch.listSessions({})).map((session) => session.id)).toEqual([b.id, a.id]);

    const asked = harness.permissions.ask({ sessionID: b.id, directory: '/b', permission: 'bash', patterns: ['bash'] });
    expect(harness.dispatch.pendingPermissions().map((entry) => entry.sessionID)).toEqual([b.id]);
    expect(harness.dispatch.ownsPermission('prm_missing')).toBe(false);
    expect(harness.dispatch.replyPermission(harness.dispatch.pendingPermissions()[0].id, 'once')).toBe(true);
    await expect(asked).resolves.toBe('once');
  });

  it('refuses turns and creates for providers the builtin engine cannot serve', async () => {
    const harness = makeHarness({ eligibleProviders: ['opencode-go', 'x-ok'] });
    const info = await harness.dispatch.createSession({ directory: '/a' });

    // A per-turn override naming an unreachable provider is refused before the
    // turn starts, never left to fail mid-stream in the provider layer.
    const override = await harness.dispatch.prompt({
      sessionID: info.id,
      parts: [{ type: 'text', text: 'hi' }],
      model: { providerID: 'local', modelID: 'qwen' },
    }).catch((cause) => cause);
    expect(override.code).toBe('unsupported_provider');
    expect(override.statusCode).toBe(400);

    // A create-time model the engine cannot serve is refused too.
    const created = await harness.dispatch.createSession({
      directory: '/a',
      model: { providerID: 'local', modelID: 'qwen' },
    }).catch((cause) => cause);
    expect(created.code).toBe('unsupported_provider');

    // An unreachable provider already persisted on the session (a provider
    // removed after the session started) is refused on plain prompts too.
    const stranded = await harness.store.create({
      directory: '/a',
      title: 'stuck',
      agent: 'build',
      model: { providerID: 'local', modelID: 'qwen' },
    });
    const strandedPrompt = await harness.dispatch.prompt({
      sessionID: stranded.session.id,
      parts: [{ type: 'text', text: 'hi' }],
    }).catch((cause) => cause);
    expect(strandedPrompt.code).toBe('unsupported_provider');

    // Eligible providers are untouched: go (default) and a configured custom.
    await expect(harness.dispatch.prompt({
      sessionID: info.id,
      parts: [{ type: 'text', text: 'hi' }],
    })).resolves.toBeDefined();
    harness.finishTurn(info.id);
    await expect(harness.dispatch.prompt({
      sessionID: info.id,
      parts: [{ type: 'text', text: 'again' }],
      model: { providerID: 'x-ok', modelID: 'm' },
    })).resolves.toBeDefined();
    await expect(harness.dispatch.createSession({
      directory: '/a',
      model: { providerID: 'x-ok', modelID: 'm' },
    })).resolves.toBeDefined();
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCompactionRuntime } from './compaction.js';
import { createAgentEventBus } from './events.js';
import { createAgentLoop } from './loop.js';
import { createPermissionRegistry, PermissionReply } from './permissions.js';
import { createAgentStore } from './store.js';
import { AgentEventType, FinishReason, ProviderChunkType } from './types.js';

const fsPromises = { mkdir, readdir, readFile, rename, unlink, writeFile };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const model = { providerID: 'opencode-go', modelID: 'm' };

// Scripted provider: each streamProvider call consumes the next script.
const scriptedProviders = (scripts) => {
  const queue = scripts.map((script) => [...script]);
  return {
    resolveProviderTarget: async (ref) => ({
      format: 'test', endpoint: 't', apiKey: 'k', apiModelID: ref.modelID, contextLimit: 1_000_000,
    }),
    streamProvider: async function* () {
      const script = queue.shift() || [{ type: ProviderChunkType.DONE, finish: FinishReason.STOP, usage: { input: 1, output: 1 } }];
      for (const chunk of script) {
        yield chunk;
      }
    },
  };
};

const makeHarness = ({ scripts, toolExecute } = {}) => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-loop-'));
  const store = createAgentStore({ fsPromises, path, dataDir });
  const events = createAgentEventBus();
  const permissions = createPermissionRegistry({ events });
  const providers = scriptedProviders(scripts);
  const compaction = createCompactionRuntime({ store, events, providers });
  const tools = {
    definitions: [{ name: 'read', description: 'read a file', parameters: { type: 'object' } }],
    execute: toolExecute || (async () => ({ output: 'file-contents' })),
  };
  const loop = createAgentLoop({ store, events, permissions, providers, tools, compaction });
  const published = [];
  events.subscribe((entry) => {
    published.push(entry.payload);
  });
  return { store, events, permissions, loop, published };
};

const textTurn = (text) => [
  { type: ProviderChunkType.TEXT_DELTA, text },
  { type: ProviderChunkType.DONE, finish: FinishReason.STOP, usage: { input: 10, output: 5 } },
];

const toolTurn = (input) => [
  { type: ProviderChunkType.TOOL_START, id: 'call_1', name: 'read' },
  { type: ProviderChunkType.TOOL_INPUT_DELTA, id: 'call_1', text: input },
  { type: ProviderChunkType.TOOL_END, id: 'call_1' },
  { type: ProviderChunkType.DONE, finish: FinishReason.TOOL_CALLS, usage: { input: 10, output: 5 } },
];

describe('agent loop', () => {
  it('runs a plain text turn to idle with persisted messages', async () => {
    const { store, loop, published } = makeHarness({ scripts: [textTurn('hello')] });
    const created = await store.create({ directory: '/proj', model });
    await store.appendMessage(created.session.id, { role: 'user', model }, [{ type: 'text', text: 'hi' }]);

    const result = await loop.runTurn({ sessionID: created.session.id, modelRef: model, agent: 'build' });
    expect(result.status).toBe('done');

    const record = await store.get(created.session.id);
    expect(record.messages).toHaveLength(2);
    expect(record.messages[1].parts.find((part) => part.type === 'text').text).toBe('hello');
    expect(record.messages[1].info.time.completed).toBeGreaterThan(0);
    expect(record.session.tokens).toMatchObject({ input: 10, output: 5 });
    expect(record.session.title).toBe('hi');

    const types = published.map((payload) => payload.type);
    expect(types).toContain(AgentEventType.SESSION_STATUS);
    expect(types).toContain(AgentEventType.MESSAGE_PART_DELTA);
    expect(types).toContain(AgentEventType.SESSION_IDLE);
    const idleStatus = published.find((payload) => payload.type === AgentEventType.SESSION_STATUS && payload.properties.status.type === 'idle');
    expect(idleStatus).toBeTruthy();
  });

  it('executes tools after permission and feeds results back', async () => {
    const seen = [];
    const { store, permissions, loop } = makeHarness({
      scripts: [toolTurn('{"filePath":"a.txt"}'), textTurn('done')],
      toolExecute: async (name, args) => {
        seen.push([name, args]);
        return { output: 'contents', title: 'Read a.txt' };
      },
    });
    const created = await store.create({ directory: '/proj', model });
    await store.appendMessage(created.session.id, { role: 'user', model }, [{ type: 'text', text: 'read it' }]);

    const run = loop.runTurn({ sessionID: created.session.id, modelRef: model, agent: 'build' });
    // Reply to the permission ask like the UI would.
    const deadline = Date.now() + 2000;
    let replied = false;
    while (Date.now() < deadline && !replied) {
      const pending = permissions.list()[0];
      if (pending) {
        permissions.reply(pending.id, { reply: PermissionReply.ONCE });
        replied = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    expect(replied).toBe(true);
    await expect(run).resolves.toMatchObject({ status: 'done' });
    expect(seen).toEqual([['read', { filePath: 'a.txt' }]]);

    const record = await store.get(created.session.id);
    const toolPart = record.messages[1].parts.find((part) => part.type === 'tool');
    expect(toolPart.state.status).toBe('completed');
    expect(toolPart.state.output).toBe('contents');
  });

  it('ends the turn as blocked when permission is rejected', async () => {
    const { store, permissions, loop, published } = makeHarness({ scripts: [toolTurn('{}')] });
    const created = await store.create({ directory: '/proj', model });
    await store.appendMessage(created.session.id, { role: 'user', model }, [{ type: 'text', text: 'do it' }]);

    const run = loop.runTurn({ sessionID: created.session.id, modelRef: model, agent: 'build' });
    const deadline = Date.now() + 2000;
    let replied = false;
    while (Date.now() < deadline && !replied) {
      const pending = permissions.list()[0];
      if (pending) {
        permissions.reply(pending.id, { reply: PermissionReply.REJECT });
        replied = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
    await expect(run).resolves.toMatchObject({ status: 'blocked' });
    expect(published.some((payload) => payload.type === AgentEventType.SESSION_ERROR)).toBe(true);
  });

  it('marks the turn aborted on signal', async () => {
    // Provider adapters must honor AbortSignal (they forward it to fetch);
    // the fake does the same so the loop can observe the abort.
    const hanging = async function* (target, { signal } = {}) {
      await new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      yield { type: ProviderChunkType.TEXT_DELTA, text: 'never' };
    };
    const providers = {
      resolveProviderTarget: async (ref) => ({ format: 't', endpoint: 't', apiKey: 'k', apiModelID: ref.modelID, contextLimit: 1 }),
      streamProvider: hanging,
    };
    dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-loop-'));
    const store = createAgentStore({ fsPromises, path, dataDir });
    const events = createAgentEventBus();
    const permissions = createPermissionRegistry({ events });
    const compaction = createCompactionRuntime({ store, events, providers });
    const loop = createAgentLoop({
      store, events, permissions, providers, compaction,
      tools: { definitions: [], execute: async () => ({ output: '' }) },
    });
    const created = await store.create({ directory: '/proj', model });
    await store.appendMessage(created.session.id, { role: 'user', model }, [{ type: 'text', text: 'go' }]);

    const controller = new AbortController();
    const run = loop.runTurn({ sessionID: created.session.id, modelRef: model, agent: 'build', signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await expect(run).resolves.toMatchObject({ status: 'aborted' });

    const record = await store.get(created.session.id);
    const assistant = record.messages.find((message) => message.info.role === 'assistant');
    expect(assistant.info.error.name).toBe('MessageAbortedError');
  });

  it('fails the turn loudly on provider resolution errors', async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-loop-'));
    const store = createAgentStore({ fsPromises, path, dataDir });
    const events = createAgentEventBus();
    const published = [];
    events.subscribe((entry) => {
      published.push(entry.payload);
    });
    const providers = {
      resolveProviderTarget: async () => { throw Object.assign(new Error('no key'), { code: 'missing_credentials' }); },
      streamProvider: async function* () {},
    };
    const loop = createAgentLoop({
      store,
      events,
      permissions: createPermissionRegistry({ events }),
      providers,
      tools: { definitions: [], execute: async () => ({ output: '' }) },
      compaction: createCompactionRuntime({ store, events, providers }),
    });
    const created = await store.create({ directory: '/proj', model });
    await store.appendMessage(created.session.id, { role: 'user', model }, [{ type: 'text', text: 'hi' }]);
    await expect(loop.runTurn({ sessionID: created.session.id, modelRef: model, agent: 'build' })).resolves.toMatchObject({ status: 'error' });
    expect(published.some((payload) => payload.type === AgentEventType.SESSION_ERROR)).toBe(true);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCompactionRuntime } from './compaction.js';
import { createAgentEventBus } from './events.js';
import { createAgentStore } from './store.js';
import { ProviderChunkType } from './types.js';

const fsPromises = { mkdir, readdir, readFile, rename, unlink, writeFile };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const makeRuntime = (providerScripts) => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-compact-'));
  const store = createAgentStore({ fsPromises, path, dataDir });
  const events = createAgentEventBus();
  const queue = [...(providerScripts || [])];
  const providers = {
    resolveProviderTarget: async (model) => ({ format: 'test', endpoint: 't', apiKey: 'k', apiModelID: model.modelID, contextLimit: null }),
    streamProvider: async function* () {
      const script = queue.shift() || [];
      for (const chunk of script) {
        yield chunk;
      }
    },
  };
  return { store, events, compaction: createCompactionRuntime({ store, events, providers }) };
};

const model = { providerID: 'opencode-go', modelID: 'm' };

const seedTurns = async (store, sessionID, count) => {
  for (let i = 0; i < count; i += 1) {
    await store.appendMessage(sessionID, { role: 'user', model }, [{ type: 'text', text: `q${i}` }]);
    await store.appendMessage(sessionID, { role: 'assistant', model }, [{ type: 'text', text: `a${i}` }]);
  }
};

describe('compaction', () => {
  it('passes history through when no compaction exists', async () => {
    const { store, compaction } = makeRuntime();
    const created = await store.create({ directory: '/proj', model });
    await seedTurns(store, created.session.id, 1);
    const record = await store.get(created.session.id);
    const messages = compaction.buildContextMessages(record, []);
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(compaction.needsCompaction(10, 1_000_000)).toBe(false);
    expect(compaction.needsCompaction(900_000, 1_000_000)).toBe(true);
  });

  it('appends pending tool results without persisting them', async () => {
    const { store, compaction } = makeRuntime();
    const created = await store.create({ directory: '/proj', model });
    const record = await store.get(created.session.id);
    const messages = compaction.buildContextMessages(record, [{ id: 'call_1', output: 'out', isError: false }]);
    const last = messages[messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content[0]).toMatchObject({ type: 'tool-result', id: 'call_1' });
    expect((await store.get(created.session.id)).messages).toHaveLength(0);
  });

  it('summarizes the head and keeps recent turns', async () => {
    const { store, compaction } = makeRuntime([[{ type: ProviderChunkType.TEXT_DELTA, text: 'summary here' }]]);
    const created = await store.create({ directory: '/proj', model });
    await seedTurns(store, created.session.id, 4);

    const summary = await compaction.compact({ sessionID: created.session.id, modelRef: model, agent: 'build' });
    expect(summary).toBe('summary here');

    const record = await store.get(created.session.id);
    expect(record.session.compaction.summary).toBe('summary here');
    const messages = compaction.buildContextMessages(record, []);
    // Summary preface (system) + last two user turns.
    expect(messages[0].role).toBe('system');
    expect(messages[0].content[0].text).toContain('summary here');
    const userTexts = messages.filter((message) => message.role === 'user').map((message) => message.content[0].text);
    expect(userTexts).toEqual(['q2', 'q3']);
  });

  it('returns null when history is too short to compact', async () => {
    const { store, compaction } = makeRuntime();
    const created = await store.create({ directory: '/proj', model });
    await seedTurns(store, created.session.id, 1);
    await expect(compaction.compact({ sessionID: created.session.id, modelRef: model, agent: 'build' })).resolves.toBeNull();
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentStore } from './store.js';

const fsPromises = { mkdir, readdir, readFile, rename, unlink, writeFile };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const makeStore = () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-store-'));
  return createAgentStore({ fsPromises, path, dataDir });
};

const model = { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' };

describe('agent store', () => {
  it('creates, reads, and reports sessions', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', title: 'Hello', agent: 'build', model });

    expect(created.session.id.startsWith('bse_')).toBe(true);
    expect(await store.has(created.session.id)).toBe(true);
    expect(await store.has('bse_missing')).toBe(false);
    expect(await store.get('bse_missing')).toBeNull();

    const fetched = await store.get(created.session.id);
    expect(fetched.session.title).toBe('Hello');
    expect(fetched.messages).toEqual([]);
  });

  it('counts sessions for engine gating', async () => {
    const store = makeStore();
    expect(await store.count()).toBe(0);
    await store.create({ directory: '/proj', model });
    await store.create({ directory: '/other', model });
    expect(await store.count()).toBe(2);
  });

  it('rejects invalid create inputs', async () => {
    const store = makeStore();
    await expect(store.create({ directory: '', model })).rejects.toThrow();
    await expect(store.create({ directory: '/proj', model: {} })).rejects.toThrow();
  });

  it('lists sessions newest-first with directory filtering', async () => {
    const store = makeStore();
    const first = await store.create({ directory: '/a', title: 'first', model });
    // Ensure distinct updated timestamps.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await store.create({ directory: '/b', title: 'second', model });

    const all = await store.list();
    expect(all.map((session) => session.id)).toEqual([second.session.id, first.session.id]);
    expect(await store.list({ directory: '/a' })).toHaveLength(1);
  });

  it('appends and updates messages', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', model });
    const id = created.session.id;

    const message = await store.appendMessage(id, { role: 'user', agent: 'build', model }, [
      { id: 'p1', sessionID: id, messageID: 'm1', type: 'text', text: 'hi' },
    ]);
    expect(message.info.id.startsWith('bmsg_')).toBe(true);
    expect(message.info.sessionID).toBe(id);

    const changed = { ...message, parts: [...message.parts, { type: 'text', text: 'more' }] };
    await store.updateMessage(id, changed);
    const fetched = await store.get(id);
    expect(fetched.messages).toHaveLength(1);
    expect(fetched.messages[0].parts).toHaveLength(2);
  });

  it('reverts and unreverts by truncating the tail', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', model });
    const id = created.session.id;
    const user = await store.appendMessage(id, { role: 'user', model }, []);
    await store.appendMessage(id, { role: 'assistant', model }, []);
    await store.appendMessage(id, { role: 'user', model }, []);

    const session = await store.revert(id, user.info.id);
    expect(session.revert).toEqual({ messageID: user.info.id });
    expect((await store.get(id)).messages).toHaveLength(1);

    const restored = await store.unrevert(id);
    expect(restored.revert).toBeNull();
    expect((await store.get(id)).messages).toHaveLength(3);
  });

  it('forks history into a new session', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', title: 'orig', model });
    const id = created.session.id;
    const first = await store.appendMessage(id, { role: 'user', model }, []);
    await store.appendMessage(id, { role: 'assistant', model }, []);

    const forked = await store.fork(id, first.info.id);
    expect(forked.session.id).not.toBe(id);
    expect(forked.session.directory).toBe('/proj');
    expect(forked.messages).toHaveLength(1);
    expect(forked.messages[0].info.sessionID).toBe(forked.session.id);
  });

  it('deletes sessions', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', model });
    expect(await store.remove(created.session.id)).toBe(true);
    expect(await store.has(created.session.id)).toBe(false);
    expect(await store.remove(created.session.id)).toBe(false);
  });

  it('throws on corrupt records instead of returning empty success', async () => {
    const store = makeStore();
    const created = await store.create({ directory: '/proj', model });
    const id = created.session.id;
    const filePath = path.join(dataDir, 'sessions', `${id}.json`);
    await writeFile(filePath, '{not json', 'utf8');
    await expect(store.get(id)).rejects.toThrow();

    await writeFile(filePath, JSON.stringify({ version: 999, session: {}, messages: [] }), 'utf8');
    await expect(store.get(id)).rejects.toThrow();
  });
});

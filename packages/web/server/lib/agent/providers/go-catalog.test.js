import { describe, expect, it } from 'vitest';

import { createGoCatalog } from './go-catalog.js';
import { GO_API_BASE_URL, ProviderFormat } from '../types.js';

// Live catalog shape (verified): OpenAI-style list with ids only, no
// endpoints. Endpoints come from the static docs table.
const catalogPayload = {
  object: 'list',
  data: [
    { id: 'kimi-k3', object: 'model' },
    { id: 'qwen3.8-max', object: 'model' },
    { id: 'muse-spark-1.3-contributor', object: 'model' },
    { id: 'some-future-model', object: 'model' },
  ],
};

const catalogFetch = (calls) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, json: async () => catalogPayload };
};

describe('go catalog', () => {
  it('requires an api key', () => {
    expect(() => createGoCatalog({})).toThrow();
  });

  it('resolves endpoints from the static table for catalog-known models', async () => {
    const calls = [];
    const catalog = createGoCatalog({ apiKey: 'k', fetchImpl: catalogFetch(calls) });

    expect(await catalog.resolveModel('opencode-go/kimi-k3')).toMatchObject({
      id: 'kimi-k3',
      endpoint: `${GO_API_BASE_URL}/chat/completions`,
      format: ProviderFormat.OPENAI_CHAT,
    });
    expect(await catalog.resolveModel('qwen3.8-max')).toMatchObject({ format: ProviderFormat.ANTHROPIC_MESSAGES });
    expect(await catalog.resolveModel('muse-spark-1.3-contributor')).toMatchObject({ format: ProviderFormat.OPENAI_RESPONSES });

    expect(calls).toHaveLength(1);
    expect(calls[0].init.headers.Authorization).toBe('Bearer k');
  });

  it('rejects unknown models explicitly', async () => {
    const catalog = createGoCatalog({ apiKey: 'k', fetchImpl: catalogFetch([]) });
    const error = await catalog.resolveModel('opencode-go/nope').catch((cause) => cause);
    expect(error.code).toBe('unknown_model');
  });

  it('rejects catalog-known models missing from the endpoint table', async () => {
    const catalog = createGoCatalog({ apiKey: 'k', fetchImpl: catalogFetch([]) });
    const error = await catalog.resolveModel('some-future-model').catch((cause) => cause);
    expect(error.code).toBe('unsupported_endpoint');
  });

  it('falls back to the static table when the catalog is unreachable', async () => {
    const catalog = createGoCatalog({
      apiKey: 'k',
      fetchImpl: async () => { throw new Error('offline'); },
    });
    expect(await catalog.resolveModel('kimi-k3')).toMatchObject({
      endpoint: `${GO_API_BASE_URL}/chat/completions`,
    });
  });

  it('refreshes after the ttl expires', async () => {
    const calls = [];
    let now = 1_000;
    const catalog = createGoCatalog({ apiKey: 'k', fetchImpl: catalogFetch(calls), ttlMs: 60_000, now: () => now });
    await catalog.resolveModel('kimi-k3');
    await catalog.resolveModel('kimi-k3');
    expect(calls).toHaveLength(1);
    now += 61_000;
    await catalog.resolveModel('kimi-k3');
    expect(calls).toHaveLength(2);
  });
});

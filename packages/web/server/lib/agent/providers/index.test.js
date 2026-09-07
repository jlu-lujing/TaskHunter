import { describe, expect, it } from 'vitest';

import { createProviderRouter } from './index.js';
import { ProviderFormat } from '../types.js';

const encode = (text) => new TextEncoder().encode(text);

describe('provider router', () => {
  it('resolves go models through the catalog', async () => {
    const goCatalog = {
      resolveModel: async (modelID) => {
        if (modelID === 'kimi-k3' || modelID === 'opencode-go/kimi-k3') {
          return { id: 'kimi-k3', endpoint: 'https://go.test/chat/completions', format: ProviderFormat.OPENAI_CHAT, contextLimit: null };
        }
        throw Object.assign(new Error('unknown'), { code: 'unknown_model' });
      },
    };
    const router = createProviderRouter({ getGoApiKey: async () => 'k', goCatalog, userAgent: 'TaskHunter-agent' });
    const target = await router.resolveProviderTarget({ providerID: 'opencode-go', modelID: 'opencode-go/kimi-k3' });
    expect(target).toMatchObject({ format: ProviderFormat.OPENAI_CHAT, apiModelID: 'kimi-k3', apiKey: 'k' });
  });

  it('requires a go api key', async () => {
    const router = createProviderRouter({});
    const error = await router.resolveProviderTarget({ providerID: 'opencode-go', modelID: 'opencode-go/kimi-k3' }).catch((cause) => cause);
    expect(error.code).toBe('missing_credentials');
  });

  it('rejects non-go providers explicitly', async () => {
    const router = createProviderRouter({ getGoApiKey: async () => 'k', goCatalog: { resolveModel: async () => { throw new Error('unreachable'); } } });
    const error = await router.resolveProviderTarget({ providerID: 'anthropic', modelID: 'claude-x' }).catch((cause) => cause);
    expect(error.code).toBe('unsupported_provider');
  });

  it('resolves custom providers from settings and their key file', async () => {
    const router = createProviderRouter({
      getEngineProviders: async () => ({ 'x-local': { endpoint: 'https://llm.test/v1/chat', format: ProviderFormat.OPENAI_CHAT } }),
      getProviderApiKey: async (id) => (id === 'x-local' ? 'ck-secret' : null),
    });
    const target = await router.resolveProviderTarget({ providerID: 'x-local', modelID: 'x-local/gpt-x/v2' });
    expect(target).toMatchObject({
      format: ProviderFormat.OPENAI_CHAT,
      endpoint: 'https://llm.test/v1/chat',
      apiKey: 'ck-secret',
      apiModelID: 'gpt-x/v2',
    });
  });

  it('rejects custom providers without config or key, never falls back to guessing', async () => {
    const noConfig = createProviderRouter({ getEngineProviders: async () => ({}) });
    expect((await noConfig.resolveProviderTarget({ providerID: 'x-gone', modelID: 'x-gone/m' }).catch((cause) => cause)).code).toBe('unknown_provider');
    const noKey = createProviderRouter({
      getEngineProviders: async () => ({ 'x-local': { endpoint: 'https://llm.test/v1/chat', format: ProviderFormat.OPENAI_CHAT } }),
    });
    expect((await noKey.resolveProviderTarget({ providerID: 'x-local', modelID: 'm' }).catch((cause) => cause)).code).toBe('missing_credentials');
  });

  it('treats custom providers as eligible only when fully configured', async () => {
    const base = { 'x-ok': { endpoint: 'https://llm.test/v1', format: ProviderFormat.OPENAI_CHAT } };
    const router = createProviderRouter({
      getGoApiKey: async () => null,
      getEngineProviders: async () => ({
        ...base,
        'x-nokey': { endpoint: 'https://llm.test/v1', format: ProviderFormat.ANTHROPIC_MESSAGES },
        'x-broken': { endpoint: 'not a url', format: 'carrier-pigeon' },
      }),
      getProviderApiKey: async (id) => (id === 'x-ok' ? 'k' : null),
    });
    expect(await router.isProviderEligible('x-ok')).toBe(true);
    expect(await router.isProviderEligible('x-nokey')).toBe(false);
    expect(await router.isProviderEligible('x-broken')).toBe(false);
    expect(await router.isProviderEligible('x-missing')).toBe(false);
    expect(await router.isProviderEligible('anthropic')).toBe(false);
    expect(await router.isProviderEligible('../etc')).toBe(false);
    expect(await router.isProviderEligible('opencode-go')).toBe(false);
  });

  it('treats go as eligible only with a key', async () => {
    const withKey = createProviderRouter({ getGoApiKey: async () => 'k' });
    const without = createProviderRouter({ getGoApiKey: async () => null });
    expect(await withKey.isProviderEligible('opencode-go')).toBe(true);
    expect(await without.isProviderEligible('opencode-go')).toBe(false);
  });

  it('answers the served-capability question without credentials', () => {
    // No keys configured anywhere: served-ness is about the wire protocol the
    // engine speaks, so a missing key must not flip it to false.
    const router = createProviderRouter({});
    expect(router.isProviderServed('opencode-go')).toBe(true);
    expect(router.isProviderServed('x-my-provider')).toBe(true);
    expect(router.isProviderServed('local')).toBe(false);
    expect(router.isProviderServed('anthropic')).toBe(false);
    expect(router.isProviderServed('x..bad')).toBe(false);
    expect(router.isProviderServed('')).toBe(false);
    expect(router.isProviderServed(undefined)).toBe(false);
  });

  it('parses provider/model refs on the first slash', async () => {
    const { parseModelRef } = await import('./index.js');
    expect(parseModelRef('opencode-go/deepseek-v4-flash')).toEqual({ providerID: 'opencode-go', modelID: 'deepseek-v4-flash' });
    expect(parseModelRef('a/b/c')).toEqual({ providerID: 'a', modelID: 'b/c' });
    expect(parseModelRef('noslash')).toBeNull();
    expect(parseModelRef('/leadingslash')).toBeNull();
    expect(parseModelRef('trailing/')).toBeNull();
    expect(parseModelRef(null)).toBeNull();
  });

  it('dispatches streaming by format', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
    const router = createProviderRouter({ getGoApiKey: async () => 'k', fetchImpl });
    const seen = [];
    for await (const chunk of router.streamProvider(
      { format: ProviderFormat.OPENAI_CHAT, endpoint: 'https://go.test/chat/completions', apiKey: 'k', apiModelID: 'm' },
      { messages: [], tools: [], signal: undefined, sessionID: 'bse_1' },
    )) {
      seen.push(chunk);
    }
    expect(seen[seen.length - 1].type).toBe('done');
  });

  it('rejects unknown formats explicitly', () => {
    const router = createProviderRouter({ getGoApiKey: async () => 'k' });
    expect(() => router.streamProvider(
      { format: 'smoke-signals', endpoint: 'https://go.test/x', apiKey: 'k', apiModelID: 'm' },
      { messages: [], tools: [], sessionID: 'bse_1' },
    )).toThrow(/unsupported provider format/);
  });
});

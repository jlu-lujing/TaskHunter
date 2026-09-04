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

import { describe, expect, test } from 'bun:test';
import {
  buildAuthSetRequest,
  buildProviderUpsertRequest,
  isConfigDefinedCustomProvider,
  isCustomOpenAICompatibleProvider,
  providerToCustomFormState,
  resolveProviderConfigScope,
  validateCustomProvider,
  type CustomProviderConfig,
  type CustomProviderFormState,
} from './custom-provider-form';

const t = (key: string) => key;

const baseForm = (overrides: Partial<CustomProviderFormState> = {}): CustomProviderFormState => ({
  providerID: 'custom-provider',
  name: 'Custom Provider',
  protocol: 'openai-chat',
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  models: [{ row: 'm0', id: 'model-a', name: 'Model A', contextLimit: '', outputLimit: '', supportsImageInput: false, thinkingLevels: '' }],
  headers: [{ row: 'h0', key: '', value: '' }],
  ...overrides,
});

const modelRow = (overrides: Partial<CustomProviderFormState['models'][number]> = {}): CustomProviderFormState['models'][number] => ({
  row: 'm0',
  id: 'model-a',
  name: 'Model A',
  contextLimit: '',
  outputLimit: '',
  supportsImageInput: false,
  thinkingLevels: '',
  ...overrides,
});

/** Mirrors server upsert semantics for request-construction tests. */
function mergeProviderConfig(
  existing: Record<string, unknown>,
  providerID: string,
  config: CustomProviderConfig,
): Record<string, unknown> {
  const providerSection = (
    typeof existing.provider === 'object' && existing.provider !== null && !Array.isArray(existing.provider)
      ? { ...(existing.provider as Record<string, unknown>) }
      : {}
  );
  providerSection[providerID] = config;
  const next: Record<string, unknown> = {
    ...existing,
    provider: providerSection,
  };
  if (Array.isArray(existing.disabled_providers)) {
    next.disabled_providers = existing.disabled_providers.filter((entry) => entry !== providerID);
  }
  return next;
}

describe('validateCustomProvider', () => {
  test('builds trimmed config and auth payloads', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: ' custom-provider ',
        name: ' Custom Provider ',
        baseURL: ' https://api.example.com/v1 ',
        apiKey: ' sk-secret ',
        models: [modelRow({ id: ' model-a ', name: ' Model A ' })],
        headers: [
          { row: 'h0', key: ' X-Test ', value: ' enabled ' },
          { row: 'h1', key: '', value: '' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual({
      providerID: 'custom-provider',
      name: 'Custom Provider',
      apiKey: 'sk-secret',
      config: {
        npm: '@ai-sdk/openai-compatible',
        name: 'Custom Provider',
        options: {
          baseURL: 'https://api.example.com/v1',
          headers: {
            'X-Test': 'enabled',
          },
        },
        models: {
          'model-a': { name: 'Model A' },
        },
      },
    });
  });

  test('supports {env:VAR} credentials without writing an auth key', () => {
    const result = validateCustomProvider({
      form: baseForm({
        apiKey: '{env: CUSTOM_PROVIDER_KEY}',
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.apiKey).toEqual(undefined);
    expect(result.result?.config.env).toEqual(['CUSTOM_PROVIDER_KEY']);
  });

  test('uses the selected OpenCode provider adapter', () => {
    const result = validateCustomProvider({
      form: baseForm({ protocol: 'openai-responses' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.npm).toBe('@ai-sdk/openai');
  });

  test('rejects missing credentials', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '   ' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.apiKey).toBe('settings.providers.page.custom.error.apiKey.required');
  });

  test('allows empty api key when editing with existing auth', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
      allowExistingAuth: true,
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.apiKey).toEqual(undefined);
    expect(result.result?.apiKey).toEqual(undefined);
  });

  test('rejects invalid provider id, base URL, and duplicate rows', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: 'Bad ID',
        baseURL: 'ftp://example.com',
        models: [
          modelRow(),
          modelRow({ row: 'm1', id: 'model-a', name: 'Model A 2' }),
        ],
        headers: [
          { row: 'h0', key: 'Authorization', value: 'one' },
          { row: 'h1', key: 'authorization', value: 'two' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.format');
    expect(result.err.baseURL).toBe('settings.providers.page.custom.error.baseURL.format');
    expect(result.models[1]).toEqual({
      id: 'settings.providers.page.custom.error.duplicate',
      name: undefined,
    });
    expect(result.headers[1]).toEqual({
      key: 'settings.providers.page.custom.error.duplicate',
      value: undefined,
    });
  });

  test('allows reconnecting a disabled provider id', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      disabledProviders: ['custom-provider'],
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });

  test('rejects an already-connected provider id on create', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.exists');
  });

  test('allows updating the same provider id while editing', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: 'sk-updated' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });
});

describe('request construction', () => {
  test('builds auth.set and provider upsert requests', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    expect(buildAuthSetRequest(plan)).toEqual({
      providerID: 'custom-provider',
      auth: { type: 'api', key: 'sk-test' },
    });
    expect(buildProviderUpsertRequest(plan)).toEqual({
      providerID: 'custom-provider',
      config: plan.config,
      scope: 'user',
    });
  });

  test('includes explicit project/custom scope on upsert requests', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    expect(buildProviderUpsertRequest(plan, { scope: 'project' }).scope).toBe('project');
    expect(buildProviderUpsertRequest(plan, { scope: 'custom' }).scope).toBe('custom');
  });

  test('omits auth.set when using env credentials', () => {
    const validated = validateCustomProvider({
      form: baseForm({ apiKey: '{env:MY_KEY}' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(buildAuthSetRequest(validated.result!)).toBeNull();
  });
});

describe('mergeProviderConfig persistence shape', () => {
  test('merges provider block and clears disabled_providers entry', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    const next = mergeProviderConfig(
      {
        model: 'openai/gpt-4o',
        provider: {
          openai: { name: 'OpenAI' },
        },
        disabled_providers: ['custom-provider', 'other'],
      },
      plan.providerID,
      plan.config,
    );

    expect(next).toEqual({
      model: 'openai/gpt-4o',
      provider: {
        openai: { name: 'OpenAI' },
        'custom-provider': plan.config,
      },
      disabled_providers: ['other'],
    });
  });

  test('creates provider section when missing', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    const next = mergeProviderConfig({}, plan.providerID, plan.config);
    expect(next.provider).toEqual({
      'custom-provider': plan.config,
    });
  });
});

describe('provider edit helpers', () => {
  test('detects openai-compatible custom providers and prefills form state', () => {
    expect(isCustomOpenAICompatibleProvider({
      id: 'campus-llm',
      options: { baseURL: 'https://llm.example.edu/v1' },
      models: [],
    })).toBe(true);

    const state = providerToCustomFormState({
      id: 'campus-llm',
      name: 'Campus LLM',
      env: ['CAMPUS_KEY'],
      options: {
        baseURL: 'https://llm.example.edu/v1',
        headers: { 'X-Campus': '1' },
      },
      models: [{ id: 'fast', name: 'Fast' }],
    });

    expect(state.providerID).toBe('campus-llm');
    expect(state.name).toBe('Campus LLM');
    expect(state.baseURL).toBe('https://llm.example.edu/v1');
    expect(state.apiKey).toBe('{env:CAMPUS_KEY}');
    expect(state.protocol).toBe('openai-chat');
    expect(state.models[0]).toEqual({
      row: state.models[0].row,
      id: 'fast',
      name: 'Fast',
      contextLimit: '',
      outputLimit: '',
      supportsImageInput: false,
      thinkingLevels: '',
    });
    expect(state.headers[0]).toEqual({ row: state.headers[0].row, key: 'X-Campus', value: '1' });
  });

  test('prefills token limits and image input from live provider model fields', () => {
    const state = providerToCustomFormState({
      id: 'campus-llm',
      options: { baseURL: 'https://llm.example.edu/v1' },
      models: [
        {
          id: 'vision',
          name: 'Vision',
          limit: { context: 200000, output: 16000 },
          capabilities: { attachment: true },
        },
        { id: 'plain', name: 'Plain', limit: { context: 0, output: 0 } },
      ],
    });

    expect(state.models[0]).toEqual({
      row: state.models[0].row,
      id: 'vision',
      name: 'Vision',
      contextLimit: '200000',
      outputLimit: '16000',
      supportsImageInput: true,
      thinkingLevels: '',
    });
    expect(state.models[1]?.contextLimit).toBe('');
    expect(state.models[1]?.outputLimit).toBe('');
    expect(state.models[1]?.supportsImageInput).toBe(false);
  });

  test('serializes optional token limits and image attachment per model', () => {
    const result = validateCustomProvider({
      form: baseForm({
        models: [
          modelRow({ contextLimit: '128000', outputLimit: '16000', supportsImageInput: true }),
          modelRow({ row: 'm1', id: 'model-b', name: 'Model B' }),
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.models).toEqual({
      'model-a': { name: 'Model A', limit: { context: 128000, output: 16000 }, attachment: true, modalities: { input: ['text', 'image'] } },
      'model-b': { name: 'Model B' },
    });
  });

  test('rejects malformed or half-filled token limits', () => {
    const malformed = validateCustomProvider({
      form: baseForm({ models: [modelRow({ contextLimit: '12.5k', outputLimit: '16000' })] }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(malformed.result).toEqual(undefined);
    expect(malformed.models[0]?.contextLimit).toBe('settings.providers.page.custom.error.limit.format');

    const halfFilled = validateCustomProvider({
      form: baseForm({ models: [modelRow({ contextLimit: '128000' })] }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(halfFilled.result).toEqual(undefined);
    expect(halfFilled.models[0]?.outputLimit).toBe('settings.providers.page.custom.error.limit.pairRequired');
    expect(halfFilled.models[0]?.contextLimit).toEqual(undefined);
  });

  test('writes protocol-specific thinking variants from comma-separated levels', () => {
    const openai = validateCustomProvider({
      form: baseForm({
        models: [modelRow({ thinkingLevels: 'low, medium,high, low' })],
      }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(openai.result?.config.models['model-a']?.variants).toEqual({
      low: { reasoningEffort: 'low' },
      medium: { reasoningEffort: 'medium' },
      high: { reasoningEffort: 'high' },
    });

    const anthropic = validateCustomProvider({
      form: baseForm({
        protocol: 'anthropic-messages',
        models: [modelRow({ thinkingLevels: 'low, max' })],
      }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(anthropic.result?.config.models['model-a']?.variants).toEqual({
      low: { thinking: { type: 'enabled', budgetTokens: 4096 } },
      max: { thinking: { type: 'enabled', budgetTokens: 32768 } },
    });
  });

  test('omits variants when no thinking levels are provided', () => {
    const result = validateCustomProvider({
      form: baseForm({ models: [modelRow({ thinkingLevels: '  ,  ' })] }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(result.result?.config.models['model-a']).toEqual({ name: 'Model A' });
  });

  test('rejects malformed thinking level names', () => {
    const result = validateCustomProvider({
      form: baseForm({ models: [modelRow({ thinkingLevels: 'low, High Effort' })] }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(result.result).toEqual(undefined);
    expect(result.models[0]?.thinkingLevels).toBe('settings.providers.page.custom.error.thinkingLevels.format');
  });

  test('rejects thinking levels the Anthropic protocol cannot map', () => {
    const result = validateCustomProvider({
      form: baseForm({
        protocol: 'anthropic-messages',
        models: [modelRow({ thinkingLevels: 'low, minimal' })],
      }),
      t,
      existingProviderIDs: new Set(),
    });
    expect(result.result).toEqual(undefined);
    expect(result.models[0]?.thinkingLevels).toBe('settings.providers.page.custom.error.thinkingLevels.anthropic');
  });

  test('prefills thinking levels from a saved provider model variants block', () => {
    const state = providerToCustomFormState({
      id: 'campus-llm',
      options: { baseURL: 'https://llm.example.edu/v1' },
      models: {
        fast: { name: 'Fast', variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } } },
      },
    });

    expect(state.models[0]?.thinkingLevels).toBe('low, high');
  });

  test('prefills the protocol from a custom provider model', () => {
    const state = providerToCustomFormState({
      id: 'responses-api',
      options: { baseURL: 'https://api.example.com/v1' },
      models: [{ id: 'gpt', name: 'GPT', api: { npm: '@ai-sdk/openai' } }],
    });

    expect(state.protocol).toBe('openai-responses');
  });

  test('requires a config-layer source before treating a provider as editable custom', () => {
    const catalogLike = {
      id: 'openai',
      options: { baseURL: 'https://api.openai.com/v1' },
      models: [{ id: 'gpt-4o', name: 'GPT-4o', api: { npm: '@ai-sdk/openai-compatible' } }],
    };

    expect(isCustomOpenAICompatibleProvider(catalogLike)).toBe(true);
    expect(isConfigDefinedCustomProvider(catalogLike, undefined)).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: false },
      project: { exists: false },
      custom: { exists: false },
    })).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: true },
      project: { exists: false },
    })).toBe(true);
  });

  test('resolveProviderConfigScope follows custom > project > user precedence', () => {
    expect(resolveProviderConfigScope(undefined)).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: false },
      custom: { exists: false },
    })).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: false },
    })).toBe('project');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: true },
    })).toBe('custom');
    expect(resolveProviderConfigScope({
      user: { exists: false },
      project: { exists: false },
      custom: { exists: true },
    })).toBe('custom');
  });
});

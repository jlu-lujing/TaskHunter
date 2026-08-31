/**
 * Custom provider form helpers.
 * Mirrors OpenCode web UI validation and request construction so a provider
 * can be defined from Settings without code changes.
 */

export const CUSTOM_PROVIDER_PROTOCOLS = {
  'openai-chat': '@ai-sdk/openai-compatible',
  'openai-responses': '@ai-sdk/openai',
  'anthropic-messages': '@ai-sdk/anthropic',
} as const;
export type CustomProviderProtocol = keyof typeof CUSTOM_PROVIDER_PROTOCOLS;
export type CustomProviderNpm = (typeof CUSTOM_PROVIDER_PROTOCOLS)[CustomProviderProtocol];
export const CUSTOM_PROVIDER_ID = '__custom_provider__';
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const BASE_URL_PATTERN = /^https?:\/\//;
const ENV_KEY_PATTERN = /^\{env:([^}]+)\}$/;

export type CustomProviderTranslator = (
  key: string,
  vars?: Record<string, string | number | boolean>,
) => string;

export type ModelRow = {
  row: string;
  id: string;
  name: string;
  /** Raw input; '' leaves the OpenCode model limit unset (unknown). */
  contextLimit: string;
  /** Raw input; '' leaves the OpenCode model limit unset (unknown). */
  outputLimit: string;
  /** Written as `attachment: true` when checked; omitted otherwise. */
  supportsImageInput: boolean;
};

export type HeaderRow = {
  row: string;
  key: string;
  value: string;
};

export type CustomProviderFormState = {
  providerID: string;
  name: string;
  protocol: CustomProviderProtocol;
  baseURL: string;
  apiKey: string;
  models: ModelRow[];
  headers: HeaderRow[];
};

export type FieldErrors = {
  providerID?: string;
  name?: string;
  baseURL?: string;
  apiKey?: string;
};

export type ModelFieldErrors = {
  id?: string;
  name?: string;
  contextLimit?: string;
  outputLimit?: string;
};

export type HeaderFieldErrors = {
  key?: string;
  value?: string;
};

export type CustomProviderModelConfig = {
  name: string;
  limit?: { context: number; output: number };
  attachment?: boolean;
};

export type CustomProviderConfig = {
  npm: CustomProviderNpm;
  name: string;
  env?: string[];
  options: {
    baseURL: string;
    headers?: Record<string, string>;
  };
  models: Record<string, CustomProviderModelConfig>;
};

export type CustomProviderPersistPlan = {
  providerID: string;
  name: string;
  /** Literal API key to send via auth.set; omitted when using {env:VAR} or empty. */
  apiKey?: string;
  config: CustomProviderConfig;
};

export type ValidateCustomProviderInput = {
  form: CustomProviderFormState;
  t: CustomProviderTranslator;
  existingProviderIDs: ReadonlySet<string>;
  disabledProviders?: readonly string[];
  /** When editing this provider id, treat it as an allowed update target. */
  editingProviderID?: string;
  /**
   * When true, empty apiKey is allowed because auth.json already has a credential
   * (edit path). Still requires env or key when false.
   */
  allowExistingAuth?: boolean;
};

export type ValidateCustomProviderResult = {
  err: FieldErrors;
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  result?: CustomProviderPersistPlan;
};

export type ProviderModelLike = {
  id?: string;
  name?: string;
  api?: { npm?: string };
  limit?: { context?: number; output?: number };
  capabilities?: { attachment?: boolean };
};

export type ProviderLikeForCustomForm = {
  id: string;
  name?: string;
  env?: string[];
  options?: Record<string, unknown> | null;
  models?: ProviderModelLike[] | Record<string, ProviderModelLike>;
};

let rowCounter = 0;

const nextRow = (): string => `row-${rowCounter++}`;

export const createModelRow = (): ModelRow => ({
  row: nextRow(),
  id: '',
  name: '',
  contextLimit: '',
  outputLimit: '',
  supportsImageInput: false,
});

export const createHeaderRow = (): HeaderRow => ({
  row: nextRow(),
  key: '',
  value: '',
});

export const createEmptyCustomProviderForm = (): CustomProviderFormState => ({
  providerID: '',
  name: '',
  protocol: 'openai-chat',
  baseURL: '',
  apiKey: '',
  models: [createModelRow()],
  headers: [createHeaderRow()],
});

function protocolFromNpm(npm: string | undefined): CustomProviderProtocol {
  switch (npm) {
    case '@ai-sdk/openai':
      return 'openai-responses';
    case '@ai-sdk/anthropic':
      return 'anthropic-messages';
    default:
      return 'openai-chat';
  }
}

function parseEnvApiKey(apiKey: string): { env?: string; key?: string } {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {};
  }
  const envMatch = trimmed.match(ENV_KEY_PATTERN);
  const env = envMatch?.[1]?.trim();
  if (env) {
    return { env };
  }
  return { key: trimmed };
}

export function isCustomOpenAICompatibleProvider(provider: ProviderLikeForCustomForm): boolean {
  const options = provider.options && typeof provider.options === 'object' ? provider.options : null;
  const baseURL = typeof options?.baseURL === 'string' ? options.baseURL.trim() : '';
  if (baseURL && BASE_URL_PATTERN.test(baseURL)) {
    return true;
  }

  const models = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.values(provider.models)
      : []);

  return models.some((model) => {
    if (!model || typeof model !== 'object') {
      return false;
    }
    const api = 'api' in model && model.api && typeof model.api === 'object'
      ? model.api as { npm?: unknown }
      : null;
    return typeof api?.npm === 'string' && new Set<string>(Object.values(CUSTOM_PROVIDER_PROTOCOLS)).has(api.npm);
  });
}

export type ProviderConfigSourcesLike = {
  user?: { exists?: boolean };
  project?: { exists?: boolean };
  custom?: { exists?: boolean };
};

export type ProviderConfigScope = 'user' | 'project' | 'custom';

/**
 * True when a provider both looks OpenAI-compatible-custom and is defined in a
 * user/project/custom OpenCode config layer. Catalog-only providers often share
 * the same npm/baseURL signals and must not get Edit / config overrides.
 */
export function isConfigDefinedCustomProvider(
  provider: ProviderLikeForCustomForm,
  sources: ProviderConfigSourcesLike | null | undefined,
): boolean {
  if (!sources) {
    return false;
  }
  const inConfigLayer = Boolean(
    sources.user?.exists || sources.project?.exists || sources.custom?.exists,
  );
  return inConfigLayer && isCustomOpenAICompatibleProvider(provider);
}

/**
 * Effective writable config layer for a provider, matching OpenCode merge
 * precedence: custom > project > user.
 */
export function resolveProviderConfigScope(
  sources: ProviderConfigSourcesLike | null | undefined,
): ProviderConfigScope {
  if (sources?.custom?.exists) {
    return 'custom';
  }
  if (sources?.project?.exists) {
    return 'project';
  }
  return 'user';
}

export function providerToCustomFormState(provider: ProviderLikeForCustomForm): CustomProviderFormState {
  const options = provider.options && typeof provider.options === 'object' ? provider.options : {};
  const baseURL = typeof options.baseURL === 'string' ? options.baseURL : '';
  const headersRaw = options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers)
    ? options.headers as Record<string, unknown>
    : {};
  const headerRows = Object.entries(headersRaw)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([key, value]) => ({ row: nextRow(), key, value }));

  const modelEntries: ProviderModelLike[] = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.entries(provider.models).map(([id, value]) => ({
          id,
          name: typeof value?.name === 'string' ? value.name : id,
          api: value?.api,
          limit: value?.limit,
          capabilities: value?.capabilities,
        }))
      : []);

  const prefillTokenLimit = (value: number | undefined): string => (
    value !== undefined && Number.isFinite(value) && value > 0 ? String(value) : ''
  );

  const models = modelEntries.length > 0
    ? modelEntries.map((model) => ({
        row: nextRow(),
        id: typeof model?.id === 'string' ? model.id : '',
        name: typeof model?.name === 'string' ? model.name : (typeof model?.id === 'string' ? model.id : ''),
        contextLimit: prefillTokenLimit(model?.limit?.context),
        outputLimit: prefillTokenLimit(model?.limit?.output),
        supportsImageInput: model?.capabilities?.attachment === true,
      }))
    : [createModelRow()];

  const envName = Array.isArray(provider.env)
    ? provider.env.find((entry) => typeof entry === 'string' && entry.trim().length > 0)?.trim()
    : undefined;

  const modelWithApi = modelEntries.find(
    (model): model is { id?: string; name?: string; api?: { npm?: string } } => 'api' in model,
  );

  return {
    providerID: provider.id,
    name: typeof provider.name === 'string' && provider.name.trim() ? provider.name : provider.id,
    protocol: protocolFromNpm(modelWithApi?.api?.npm),
    baseURL,
    apiKey: envName ? `{env:${envName}}` : '',
    models,
    headers: headerRows.length > 0 ? headerRows : [createHeaderRow()],
  };
}

/**
 * Validates form input and builds the auth + OpenCode provider config payloads.
 */
export function validateCustomProvider(input: ValidateCustomProviderInput): ValidateCustomProviderResult {
  const providerID = input.form.providerID.trim();
  const name = input.form.name.trim();
  const baseURL = input.form.baseURL.trim();
  const { env, key } = parseEnvApiKey(input.form.apiKey);
  const disabledProviders = input.disabledProviders ?? [];
  const editingProviderID = input.editingProviderID?.trim();

  const idError = !providerID
    ? input.t('settings.providers.page.custom.error.providerID.required')
    : !PROVIDER_ID_PATTERN.test(providerID)
      ? input.t('settings.providers.page.custom.error.providerID.format')
      : undefined;

  const nameError = !name
    ? input.t('settings.providers.page.custom.error.name.required')
    : undefined;

  const urlError = !baseURL
    ? input.t('settings.providers.page.custom.error.baseURL.required')
    : !BASE_URL_PATTERN.test(baseURL)
      ? input.t('settings.providers.page.custom.error.baseURL.format')
      : undefined;

  const credentialsSatisfied = Boolean(env || key || (editingProviderID && input.allowExistingAuth && editingProviderID === providerID));
  const apiKeyError = credentialsSatisfied
    ? undefined
    : input.t('settings.providers.page.custom.error.apiKey.required');

  const disabled = disabledProviders.includes(providerID);
  const isSelfEdit = Boolean(editingProviderID && editingProviderID === providerID);
  const existsError = idError || isSelfEdit
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t('settings.providers.page.custom.error.providerID.exists')
      : undefined;

  const seenModels = new Set<string>();
  // Token limits are optional, but OpenCode's `limit` block requires context and
  // output together, so one filled field forces the other.
  const parseTokenLimit = (raw: string): number | undefined => (
    /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : undefined
  );
  const parsedLimits: Array<{ context?: number; output?: number }> = [];
  const modelErrors = input.form.models.map((model) => {
    const id = model.id.trim();
    const modelIdError = !id
      ? input.t('settings.providers.page.custom.error.required')
      : seenModels.has(id)
        ? input.t('settings.providers.page.custom.error.duplicate')
        : (() => {
            seenModels.add(id);
            return undefined;
          })();
    const modelNameError = !model.name.trim()
      ? input.t('settings.providers.page.custom.error.required')
      : undefined;

    const contextRaw = model.contextLimit.trim();
    const outputRaw = model.outputLimit.trim();
    let contextLimitError: string | undefined;
    let outputLimitError: string | undefined;
    let context: number | undefined;
    let output: number | undefined;
    if (contextRaw || outputRaw) {
      if (!contextRaw) {
        contextLimitError = input.t('settings.providers.page.custom.error.limit.pairRequired');
      } else {
        context = parseTokenLimit(contextRaw);
        if (context === undefined) {
          contextLimitError = input.t('settings.providers.page.custom.error.limit.format');
        }
      }
      if (!outputRaw) {
        outputLimitError = input.t('settings.providers.page.custom.error.limit.pairRequired');
      } else {
        output = parseTokenLimit(outputRaw);
        if (output === undefined) {
          outputLimitError = input.t('settings.providers.page.custom.error.limit.format');
        }
      }
    }
    parsedLimits.push({ context, output });

    return { id: modelIdError, name: modelNameError, contextLimit: contextLimitError, outputLimit: outputLimitError };
  });

  const modelsValid = modelErrors.every(
    (entry) => !entry.id && !entry.name && !entry.contextLimit && !entry.outputLimit,
  );
  const modelConfig: Record<string, CustomProviderModelConfig> = Object.fromEntries(
    input.form.models.map((model, index) => {
      const entry: CustomProviderModelConfig = { name: model.name.trim() };
      const { context, output } = parsedLimits[index] ?? {};
      if (context !== undefined && output !== undefined) {
        entry.limit = { context, output };
      }
      if (model.supportsImageInput) {
        entry.attachment = true;
      }
      return [model.id.trim(), entry];
    }),
  );

  const seenHeaders = new Set<string>();
  const headerErrors = input.form.headers.map((header) => {
    const headerKey = header.key.trim();
    const headerValue = header.value.trim();
    if (!headerKey && !headerValue) {
      return {};
    }
    const keyError = !headerKey
      ? input.t('settings.providers.page.custom.error.required')
      : seenHeaders.has(headerKey.toLowerCase())
        ? input.t('settings.providers.page.custom.error.duplicate')
        : (() => {
            seenHeaders.add(headerKey.toLowerCase());
            return undefined;
          })();
    const valueError = !headerValue
      ? input.t('settings.providers.page.custom.error.required')
      : undefined;
    return { key: keyError, value: valueError };
  });

  const headersValid = headerErrors.every((entry) => !entry.key && !entry.value);
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
      .filter((header) => header.key && header.value)
      .map((header) => [header.key, header.value]),
  );

  const err: FieldErrors = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
    apiKey: apiKeyError,
  };

  const ok = !idError && !existsError && !nameError && !urlError && !apiKeyError && modelsValid && headersValid;
  if (!ok) {
    return { err, models: modelErrors, headers: headerErrors };
  }

  return {
    err,
    models: modelErrors,
    headers: headerErrors,
    result: {
      providerID,
      name,
      apiKey: key,
      config: {
        npm: CUSTOM_PROVIDER_PROTOCOLS[input.form.protocol],
        name,
        ...(env ? { env: [env] } : {}),
        options: {
          baseURL,
          ...(Object.keys(headerConfig).length > 0 ? { headers: headerConfig } : {}),
        },
        models: modelConfig,
      },
    },
  };
}

/**
 * Builds the OpenCode auth.set request body when a literal API key is present.
 */
export function buildAuthSetRequest(plan: CustomProviderPersistPlan): {
  providerID: string;
  auth: { type: 'api'; key: string };
} | null {
  if (!plan.apiKey) {
    return null;
  }
  return {
    providerID: plan.providerID,
    auth: { type: 'api', key: plan.apiKey },
  };
}

/**
 * Builds the TaskHunter provider upsert request body (config persistence).
 * `scope` selects the OpenCode config layer (user/project/custom). Create
 * defaults to user; edit must pass the provider's effective existing layer.
 */
export function buildProviderUpsertRequest(
  plan: CustomProviderPersistPlan,
  options?: { scope?: ProviderConfigScope },
): {
  providerID: string;
  config: CustomProviderConfig;
  scope: ProviderConfigScope;
} {
  return {
    providerID: plan.providerID,
    config: plan.config,
    scope: options?.scope ?? 'user',
  };
}

import {
  CONFIG_FILE,
  readConfigLayers,
  readConfigLayer,
  isPlainObject,
  getConfigForPath,
  writeConfig,
} from './shared.js';

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const BASE_URL_PATTERN = /^https?:\/\//;
const OPENAI_COMPATIBLE_NPM = '@ai-sdk/openai-compatible';
const CUSTOM_PROVIDER_NPM_PACKAGES = new Set([
  OPENAI_COMPATIBLE_NPM,
  '@ai-sdk/openai',
  '@ai-sdk/anthropic',
]);

function getProviderSources(providerId, workingDirectory) {
  const layers = readConfigLayers(workingDirectory);
  const { userConfig, projectConfig, customConfig, paths } = layers;

  const customProviders = isPlainObject(customConfig?.provider) ? customConfig.provider : {};
  const customProvidersAlias = isPlainObject(customConfig?.providers) ? customConfig.providers : {};
  const projectProviders = isPlainObject(projectConfig?.provider) ? projectConfig.provider : {};
  const projectProvidersAlias = isPlainObject(projectConfig?.providers) ? projectConfig.providers : {};
  const userProviders = isPlainObject(userConfig?.provider) ? userConfig.provider : {};
  const userProvidersAlias = isPlainObject(userConfig?.providers) ? userConfig.providers : {};

  const customExists =
    Object.prototype.hasOwnProperty.call(customProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(customProvidersAlias, providerId);
  const projectExists =
    Object.prototype.hasOwnProperty.call(projectProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(projectProvidersAlias, providerId);
  const userExists =
    Object.prototype.hasOwnProperty.call(userProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(userProvidersAlias, providerId);

  return {
    sources: {
      auth: { exists: false },
      user: { exists: userExists, path: paths.userPath },
      project: { exists: projectExists, path: paths.projectPath || null },
      custom: { exists: customExists, path: paths.customPath }
    }
  };
}

/**
 * Validate a custom provider config payload before persistence.
 * Returns { ok: true, value } or { ok: false, error }.
 *
 * Credentials: either config.env contains a variable name, or hasStoredAuth is true
 * (auth.json already has a key — typically after auth.set, or when editing).
 */
function validateCustomProviderConfig(providerId, config, options = {}) {
  if (!providerId || typeof providerId !== 'string' || !PROVIDER_ID_PATTERN.test(providerId)) {
    return { ok: false, error: 'Provider ID must match /^[a-z0-9][a-z0-9-_]*$/' };
  }

  if (!isPlainObject(config)) {
    return { ok: false, error: 'Provider config must be an object' };
  }

  const name = typeof config.name === 'string' ? config.name.trim() : '';
  if (!name) {
    return { ok: false, error: 'Provider name is required' };
  }

  const npm = typeof config.npm === 'string' ? config.npm.trim() : OPENAI_COMPATIBLE_NPM;
  if (!CUSTOM_PROVIDER_NPM_PACKAGES.has(npm)) {
    return { ok: false, error: 'Custom providers must use @ai-sdk/openai-compatible, @ai-sdk/openai, or @ai-sdk/anthropic' };
  }

  const optionsBlock = isPlainObject(config.options) ? config.options : null;
  if (!optionsBlock) {
    return { ok: false, error: 'Provider options are required' };
  }

  const baseURL = typeof optionsBlock.baseURL === 'string' ? optionsBlock.baseURL.trim() : '';
  if (!baseURL) {
    return { ok: false, error: 'Base URL is required' };
  }
  if (!BASE_URL_PATTERN.test(baseURL)) {
    return { ok: false, error: 'Base URL must start with http:// or https://' };
  }

  const models = isPlainObject(config.models) ? config.models : null;
  if (!models || Object.keys(models).length === 0) {
    return { ok: false, error: 'At least one model is required' };
  }

  const normalizedModels = {};
  for (const [modelId, modelValue] of Object.entries(models)) {
    const trimmedId = typeof modelId === 'string' ? modelId.trim() : '';
    if (!trimmedId) {
      return { ok: false, error: 'Model id is required' };
    }
    if (!isPlainObject(modelValue)) {
      return { ok: false, error: `Model "${trimmedId}" must be an object` };
    }
    const modelName = typeof modelValue.name === 'string' ? modelValue.name.trim() : '';
    if (!modelName) {
      return { ok: false, error: `Model "${trimmedId}" requires a name` };
    }
    const normalizedModel = { name: modelName };

    // Optional OpenCode model limits: the limit block carries context+output
    // together (partial blocks are rejected so OpenCode never sees half a schema).
    const limitBlock = isPlainObject(modelValue.limit) ? modelValue.limit : null;
    if (limitBlock) {
      const isTokenCount = (value) => Number.isSafeInteger(value) && value > 0;
      if (!isTokenCount(limitBlock.context) || !isTokenCount(limitBlock.output)) {
        return { ok: false, error: `Model "${trimmedId}" limit requires positive integer context and output` };
      }
      normalizedModel.limit = { context: limitBlock.context, output: limitBlock.output };
    }
    if (modelValue.attachment === true || modelValue.attachment === false) {
      normalizedModel.attachment = modelValue.attachment;
    }
    // OpenCode gates image input on modalities.input; pass the block through
    // (validated) so the custom-provider form's image checkbox takes effect.
    if (modelValue.modalities !== undefined) {
      if (!isPlainObject(modelValue.modalities) || !Array.isArray(modelValue.modalities.input)
        || modelValue.modalities.input.length === 0
        || !modelValue.modalities.input.every((modality) => typeof modality === 'string' && modality.trim().length > 0)) {
        return { ok: false, error: `Model "${trimmedId}" modalities.input must be a non-empty array of strings` };
      }
      normalizedModel.modalities = { input: modelValue.modalities.input.map((modality) => modality.trim()) };
    }
    // Thinking variants: names are what the UI lists; each value is opaque
    // provider request options that OpenCode merges when the variant is picked.
    if (modelValue.variants !== undefined) {
      if (!isPlainObject(modelValue.variants) || Object.keys(modelValue.variants).length === 0) {
        return { ok: false, error: `Model "${trimmedId}" variants must be a non-empty object` };
      }
      const variants = {};
      for (const [variantName, variantOptions] of Object.entries(modelValue.variants)) {
        if (!variantName.trim() || !isPlainObject(variantOptions)) {
          return { ok: false, error: `Model "${trimmedId}" variant "${variantName}" requires a non-empty name and an options object` };
        }
        variants[variantName.trim()] = variantOptions;
      }
      normalizedModel.variants = variants;
    }

    normalizedModels[trimmedId] = normalizedModel;
  }

  const normalized = {
    npm,
    name,
    options: {
      baseURL,
    },
    models: normalizedModels,
  };

  let env = [];
  if (Array.isArray(config.env)) {
    env = config.env
      .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      .map((entry) => entry.trim());
    if (env.length > 0) {
      normalized.env = env;
    }
  }

  const hasStoredAuth = Boolean(options.hasStoredAuth);
  if (env.length === 0 && !hasStoredAuth) {
    return {
      ok: false,
      error: 'API key or {env:VAR} credentials are required',
    };
  }

  if (isPlainObject(optionsBlock.headers)) {
    const headers = {};
    for (const [headerKey, headerValue] of Object.entries(optionsBlock.headers)) {
      if (typeof headerKey !== 'string' || !headerKey.trim()) {
        continue;
      }
      if (typeof headerValue !== 'string' || !headerValue.trim()) {
        return { ok: false, error: `Header "${headerKey}" requires a non-empty value` };
      }
      headers[headerKey.trim()] = headerValue.trim();
    }
    if (Object.keys(headers).length > 0) {
      normalized.options.headers = headers;
    }
  }

  return { ok: true, value: { providerId, config: normalized } };
}

/**
 * Persist (create or update) a custom provider block in OpenCode user/project/custom config.
 * Does not write secrets — API keys remain in auth.json via the OpenCode auth API.
 */
function upsertProviderConfig(providerId, config, workingDirectory, scope = 'user', options = {}) {
  const validated = validateCustomProviderConfig(providerId, config, options);
  if (!validated.ok) {
    const error = new Error(validated.error);
    error.statusCode = 400;
    throw error;
  }

  const layers = readConfigLayers(workingDirectory);
  let targetPath = layers.paths.userPath;

  if (scope === 'project') {
    if (!workingDirectory) {
      throw new Error('Working directory is required for project scope');
    }
    targetPath = layers.paths.projectPath || targetPath;
  } else if (scope === 'custom') {
    if (!layers.paths.customPath) {
      throw new Error('Custom config path (OPENCODE_CONFIG) is not set');
    }
    targetPath = layers.paths.customPath;
  } else if (scope !== 'user') {
    throw new Error('Invalid scope');
  }

  const targetConfig = getConfigForPath(layers, targetPath);
  const providerConfig = isPlainObject(targetConfig.provider) ? { ...targetConfig.provider } : {};
  providerConfig[validated.value.providerId] = validated.value.config;
  targetConfig.provider = providerConfig;

  if (Array.isArray(targetConfig.disabled_providers)) {
    targetConfig.disabled_providers = targetConfig.disabled_providers.filter(
      (entry) => entry !== validated.value.providerId,
    );
  }

  const writePath = targetPath || CONFIG_FILE;
  writeConfig(targetConfig, writePath);

  return {
    providerId: validated.value.providerId,
    path: writePath,
    config: validated.value.config,
  };
}

/**
 * Config self-heal: custom-provider models saved by older builds carry
 * `attachment: true` but no `modalities` block, and OpenCode gates image
 * input on the declared input modalities (never on `attachment`). Backfill
 * the declaration so previously saved models work without user action.
 *
 * Runs at TaskHunter startup, before OpenCode reads the config. Idempotent:
 * models with a non-empty `modalities.input` are left untouched. Unchecking
 * image input in the form removes `attachment`, so the heal never resurrects
 * a decision the user reversed.
 *
 * Returns `{ healedModels, path }`; path is null when nothing changed.
 */
function healCustomProviderImageModalities(options = {}) {
  let targetPath = options.configPath;
  let config;
  if (targetPath) {
    config = readConfigLayer(targetPath).config;
  } else {
    const layers = readConfigLayers(options.workingDirectory);
    targetPath = layers.paths.userPath || CONFIG_FILE;
    config = getConfigForPath(layers, targetPath);
  }
  const providers = isPlainObject(config?.provider) ? config.provider : null;
  if (!providers) return { healedModels: [], path: null };

  const healedModels = [];
  let changed = false;
  for (const provider of Object.values(providers)) {
    // Only entries TaskHunter itself writes (custom providers carry a baseURL
    // in options); anything else in the file is user-managed and off-limits.
    if (!isPlainObject(provider) || !isPlainObject(provider.options) || !BASE_URL_PATTERN.test(provider.options.baseURL)) {
      continue;
    }
    const models = isPlainObject(provider.models) ? provider.models : null;
    if (!models) continue;
    for (const [modelId, model] of Object.entries(models)) {
      if (!isPlainObject(model) || model.attachment !== true) continue;
      const modalities = isPlainObject(model.modalities) ? model.modalities : {};
      if (Array.isArray(modalities.input) && modalities.input.length > 0) continue;
      model.modalities = { ...modalities, input: ['text', 'image'], output: ['text'] };
      healedModels.push(modelId);
      changed = true;
    }
  }
  if (changed) writeConfig(config, targetPath);
  return { healedModels, path: changed ? targetPath : null };
}

function removeProviderConfig(providerId, workingDirectory, scope = 'user') {
  if (!providerId || typeof providerId !== 'string') {
    throw new Error('Provider ID is required');
  }

  const layers = readConfigLayers(workingDirectory);
  let targetPath = layers.paths.userPath;

  if (scope === 'project') {
    if (!workingDirectory) {
      throw new Error('Working directory is required for project scope');
    }
    targetPath = layers.paths.projectPath || targetPath;
  } else if (scope === 'custom') {
    if (!layers.paths.customPath) {
      return false;
    }
    targetPath = layers.paths.customPath;
  }

  const targetConfig = getConfigForPath(layers, targetPath);
  const providerConfig = isPlainObject(targetConfig.provider) ? targetConfig.provider : {};
  const providersConfig = isPlainObject(targetConfig.providers) ? targetConfig.providers : {};
  const removedProvider = Object.prototype.hasOwnProperty.call(providerConfig, providerId);
  const removedProviders = Object.prototype.hasOwnProperty.call(providersConfig, providerId);

  if (!removedProvider && !removedProviders) {
    return false;
  }

  if (removedProvider) {
    delete providerConfig[providerId];
    if (Object.keys(providerConfig).length === 0) {
      delete targetConfig.provider;
    } else {
      targetConfig.provider = providerConfig;
    }
  }

  if (removedProviders) {
    delete providersConfig[providerId];
    if (Object.keys(providersConfig).length === 0) {
      delete targetConfig.providers;
    } else {
      targetConfig.providers = providersConfig;
    }
  }

  writeConfig(targetConfig, targetPath || CONFIG_FILE);
  console.log(`Removed provider ${providerId} from config: ${targetPath}`);
  return true;
}

export {
  getProviderSources,
  healCustomProviderImageModalities,
  removeProviderConfig,
  upsertProviderConfig,
  validateCustomProviderConfig,
};

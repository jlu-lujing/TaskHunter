// Provider resolution and streaming dispatch for the builtin engine.
//
// OpenCode Go models (`opencode-go/<id>`) resolve through the live catalog and
// the static endpoint table. Custom providers (`x-<id>/<model>`) come from the
// `engineProviders` settings entries: an absolute endpoint, a wire format, and
// a per-provider key file. Any other provider ID is an explicit unsupported
// error, never a guessed protocol.

import {
  GO_MODEL_ID_PREFIX,
  GO_PROVIDER_ID,
  ProviderFormat,
  ENGINE_FORMAT_VALUES,
  isCustomProviderId,
  customProviderIdFromModelRef,
} from '../types.js';
import { streamOpenAiChat } from './openai-chat.js';
import { streamAnthropicMessages } from './anthropic-messages.js';
import { streamOpenAiResponses } from './openai-responses.js';
import { createGoCatalog } from './go-catalog.js';

// Split a "providerID/modelID" ref on the first slash. Model IDs may legally
// contain slashes, so only the first one separates the provider.
export const parseModelRef = (ref) => {
  if (typeof ref !== 'string') {
    return null;
  }
  const slash = ref.indexOf('/');
  if (slash <= 0 || slash === ref.length - 1) {
    return null;
  }
  return { providerID: ref.slice(0, slash), modelID: ref.slice(slash + 1) };
};

export const createProviderRouter = ({
  getGoApiKey,
  getProviderApiKey,
  getEngineProviders,
  goCatalog,
  userAgent,
  fetchImpl = fetch,
} = {}) => {
  const readGoApiKey = typeof getGoApiKey === 'function' ? getGoApiKey : async () => null;
  const readProviderApiKey = typeof getProviderApiKey === 'function' ? getProviderApiKey : async () => null;
  const readEngineProviders = typeof getEngineProviders === 'function' ? getEngineProviders : async () => ({});
  let lazyCatalog = goCatalog || null;
  let lazyCatalogKey = null;

  const getCatalog = async () => {
    if (lazyCatalog && goCatalog) {
      return lazyCatalog;
    }
    const apiKey = await readGoApiKey();
    if (!apiKey) {
      return null;
    }
    if (!lazyCatalog || lazyCatalogKey !== apiKey) {
      lazyCatalog = createGoCatalog({ apiKey, fetchImpl, userAgent });
      lazyCatalogKey = apiKey;
    }
    return lazyCatalog;
  };

  const resolveProviderTarget = async ({ providerID, modelID }) => {
    if (providerID === GO_PROVIDER_ID || (typeof modelID === 'string' && modelID.startsWith(GO_MODEL_ID_PREFIX))) {
      const catalog = await getCatalog();
      if (!catalog) {
        throw Object.assign(new Error('opencode-go API key is not configured'), { code: 'missing_credentials' });
      }
      const entry = await catalog.resolveModel(modelID);
      return {
        format: entry.format,
        endpoint: entry.endpoint,
        apiKey: await readGoApiKey(),
        apiModelID: entry.id,
        contextLimit: entry.contextLimit,
      };
    }
    const customId = isCustomProviderId(providerID) ? providerID : customProviderIdFromModelRef(modelID);
    if (customId) {
      const providers = await readEngineProviders();
      const config = providers && typeof providers === 'object' ? providers[customId] : null;
      if (!config || typeof config.endpoint !== 'string' || !ENGINE_FORMAT_VALUES.has(config.format)) {
        throw Object.assign(new Error(`custom provider '${customId}' is not configured`), { code: 'unknown_provider' });
      }
      const apiKey = await readProviderApiKey(customId);
      if (!apiKey) {
        throw Object.assign(new Error(`custom provider '${customId}' has no API key configured`), { code: 'missing_credentials' });
      }
      // The model id travels verbatim: the upstream names its models, and the
      // `x-<id>/` prefix only selects the endpoint here.
      const apiModelID = typeof modelID === 'string' && modelID.startsWith(`${customId}/`)
        ? modelID.slice(customId.length + 1)
        : modelID;
      return {
        format: config.format,
        endpoint: config.endpoint,
        apiKey,
        apiModelID,
        contextLimit: Number.isFinite(config.contextLimit) ? config.contextLimit : null,
      };
    }
    throw Object.assign(new Error(`unsupported provider for builtin engine: ${providerID}`), {
      code: 'unsupported_provider',
    });
  };

  const streamProvider = (target, { messages, tools, toolChoice, signal, sessionID }) => {
    const common = {
      endpoint: target.endpoint,
      apiKey: target.apiKey,
      apiModelID: target.apiModelID,
      messages,
      tools,
      toolChoice,
      signal,
      userAgent,
      sessionRef: sessionID,
      fetchImpl,
    };
    if (target.format === ProviderFormat.OPENAI_CHAT) {
      return streamOpenAiChat(common);
    }
    if (target.format === ProviderFormat.ANTHROPIC_MESSAGES) {
      return streamAnthropicMessages(common);
    }
    if (target.format === ProviderFormat.OPENAI_RESPONSES) {
      return streamOpenAiResponses(common);
    }
    throw new Error(`unsupported provider format: ${target.format}`);
  };

  // Whether a provider can run on the builtin engine right now. Session
  // routing asks this before committing a new session or a model override;
  // Go needs a configured key, custom providers need a valid settings entry
  // and a stored key — a half-configured custom provider must fall back to
  // opencode rather than strand the request on an unusable engine.
  const isProviderEligible = async (providerID) => {
    if (providerID === GO_PROVIDER_ID) {
      return (await readGoApiKey()) !== null;
    }
    if (!isCustomProviderId(providerID)) {
      return false;
    }
    const providers = await readEngineProviders();
    const config = providers && typeof providers === 'object' ? providers[providerID] : null;
    if (!config || typeof config.endpoint !== 'string' || !ENGINE_FORMAT_VALUES.has(config.format)) {
      return false;
    }
    return (await readProviderApiKey(providerID)) !== null;
  };

  return {
    resolveProviderTarget,
    streamProvider,
    isProviderEligible,
  };
};

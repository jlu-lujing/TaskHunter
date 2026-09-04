// Provider resolution and streaming dispatch for the builtin engine.
//
// Phase 1 supports OpenCode Go models (`opencode-go/<id>`) only. Any other
// provider ID is an explicit unsupported error — custom OpenAI-compatible
// providers arrive in a later pass.

import { GO_MODEL_ID_PREFIX, GO_PROVIDER_ID, ProviderFormat } from '../types.js';
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
  goCatalog,
  userAgent,
  fetchImpl = fetch,
} = {}) => {
  const readGoApiKey = typeof getGoApiKey === 'function' ? getGoApiKey : async () => null;
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

  return {
    resolveProviderTarget,
    streamProvider,
  };
};

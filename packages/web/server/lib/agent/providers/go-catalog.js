// OpenCode Go model catalog: cached GET /zen/go/v1/models.
//
// The catalog is the only Go surface that changes over time (model list,
// per-model endpoints). Endpoint paths map statically to wire formats (see
// GO_ENDPOINT_FORMATS in ../types.js, declared by the Go docs); anything else
// is an explicit unsupported error, never a guessed protocol.

import { GO_API_BASE_URL, GO_ENDPOINT_FORMATS, GO_MODEL_ID_PREFIX, GO_MODELS_URL } from '../types.js';

const DEFAULT_CATALOG_TTL_MS = 10 * 60 * 1000;

// Endpoint-per-model is declared by the Go docs table, not by the live
// catalog: GET /models returns OpenAI-style {data:[{id,...}]} with no
// endpoint field. This table mirrors that docs section; a model the catalog
// knows but the table lacks is an explicit unsupported_endpoint error (the
// table needs a refresh), never a guessed protocol.
const CHAT_COMPLETIONS = `${GO_API_BASE_URL}/chat/completions`;
const MESSAGES = `${GO_API_BASE_URL}/messages`;
const RESPONSES = `${GO_API_BASE_URL}/responses`;

const GO_MODEL_ENDPOINTS = new Map(Object.entries({
  'grok-4.6': RESPONSES,
  'gpt-5.6-luna': RESPONSES,
  'glm-5.3-flash': CHAT_COMPLETIONS,
  'glm-5.3': CHAT_COMPLETIONS,
  'glm-5.2': CHAT_COMPLETIONS,
  'glm-5.1': CHAT_COMPLETIONS,
  'kimi-k3': CHAT_COMPLETIONS,
  'kimi-k2.7-code': CHAT_COMPLETIONS,
  'kimi-k2.6': CHAT_COMPLETIONS,
  'longcat-2.0': CHAT_COMPLETIONS,
  'deepseek-v4-pro': CHAT_COMPLETIONS,
  'deepseek-v4-flash': CHAT_COMPLETIONS,
  'deepseek-v4-flash-vision-exp': CHAT_COMPLETIONS,
  'mimo-v2.5': CHAT_COMPLETIONS,
  'mimo-v2.5-pro': CHAT_COMPLETIONS,
  'minimax-m3': MESSAGES,
  'minimax-m2.7': MESSAGES,
  'minimax-m2.5': MESSAGES,
  'muse-spark-1.3-contributor': RESPONSES,
  'muse-spark-1.2-contributor': RESPONSES,
  'qwen3.8-max': MESSAGES,
  'qwen3.8-flash': MESSAGES,
  'qwen3.7-max': MESSAGES,
  'qwen3.7-plus': MESSAGES,
  'qwen3.6-plus': MESSAGES,
  'hy4-preview': CHAT_COMPLETIONS,
  'hy3': CHAT_COMPLETIONS,
}));

const normalizeId = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value.startsWith(GO_MODEL_ID_PREFIX) ? value.slice(GO_MODEL_ID_PREFIX.length) : value;
};

const extractItems = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload.models)) {
      return payload.models;
    }
  }
  return null;
};

export const createGoCatalog = ({
  apiKey,
  fetchImpl = fetch,
  userAgent,
  ttlMs = DEFAULT_CATALOG_TTL_MS,
  now = Date.now,
} = {}) => {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new Error('createGoCatalog requires an apiKey');
  }
  let cached = null;

  const load = async () => {
    const response = await fetchImpl(GO_MODELS_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`go model catalog request failed with ${response.status}`);
    }
    const payload = await response.json().catch(() => null);
    const items = extractItems(payload);
    if (!items) {
      throw new Error('go model catalog returned an unrecognized shape');
    }
    const models = new Map();
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const id = normalizeId(item.id ?? item.model ?? item.name);
      if (!id) {
        continue;
      }
      models.set(id, {
        id,
        contextLimit: Number.isFinite(item.context_limit)
          ? item.context_limit
          : (Number.isFinite(item.contextLimit) ? item.contextLimit : null),
      });
    }
    cached = { fetchedAt: now(), models };
    return cached;
  };

  const getCatalog = async ({ refresh = false } = {}) => {
    if (!refresh && cached && (now() - cached.fetchedAt) < ttlMs) {
      return cached;
    }
    return load();
  };

  // Resolve a UI-facing model ID (`opencode-go/<id>` or bare `<id>`) to the
  // concrete call target. The endpoint comes from the static docs table; the
  // live catalog only proves the model still exists. A catalog failure falls
  // back to the static table (offline resilience); an unknown model with a
  // reachable catalog is an explicit error.
  const resolveModel = async (modelID) => {
    const id = normalizeId(modelID);
    if (!id) {
      throw new Error('go model resolution requires a model ID');
    }
    const endpoint = GO_MODEL_ENDPOINTS.get(id) ?? null;
    let catalog = null;
    try {
      catalog = await getCatalog();
    } catch (error) {
      console.warn('[go-catalog] live catalog unreachable, using static endpoint table:', error?.message ?? error);
    }
    const known = catalog ? catalog.models.has(id) : false;
    if (!endpoint) {
      if (known) {
        throw Object.assign(
          new Error(`opencode-go model ${id} has no declared endpoint; the static endpoint table needs a refresh`),
          { code: 'unsupported_endpoint' },
        );
      }
      throw Object.assign(new Error(`unknown opencode-go model: ${id}`), { code: 'unknown_model' });
    }
    if (catalog && !known) {
      throw Object.assign(new Error(`unknown opencode-go model: ${id}`), { code: 'unknown_model' });
    }
    const format = GO_ENDPOINT_FORMATS.get(endpoint) ?? null;
    if (!format) {
      throw Object.assign(new Error(`unsupported endpoint for opencode-go model ${id}: ${endpoint}`), {
        code: 'unsupported_endpoint',
      });
    }
    return {
      id,
      endpoint,
      format,
      contextLimit: catalog?.models.get(id)?.contextLimit ?? null,
    };
  };

  const clear = () => {
    cached = null;
  };

  return {
    getCatalog,
    resolveModel,
    clear,
  };
};

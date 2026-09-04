// Shared constants and shape contracts for the builtin agent engine.
//
// This module owns the vocabulary every other lib/agent module speaks:
// engine selection values, ID prefixes, OpenCode-compatible event/part type
// strings, and the normalized provider chunk protocol consumed by the agent
// loop. It has no dependencies and performs no IO.

export const ENGINE_OPENCODE = 'opencode';
export const ENGINE_BUILTIN = 'builtin';
export const ENGINE_VALUES = new Set([ENGINE_OPENCODE, ENGINE_BUILTIN]);
export const DEFAULT_ENGINE = ENGINE_OPENCODE;
// Default model for newly created builtin sessions when settings do not
// name one. Also the formatSettingsResponse fallback in settings-helpers.js.
export const DEFAULT_BUILTIN_MODEL_REF = 'opencode-go/deepseek-v4-flash';

// Session/message/part/request IDs. The `bse_` prefix keeps builtin sessions
// distinguishable from opencode `ses_*` IDs in logs and diagnostics. Engine
// routing never parses IDs — it asks the store — so the prefix is a
// readability aid, not a contract.
export const SESSION_ID_PREFIX = 'bse_';
export const MESSAGE_ID_PREFIX = 'bmsg_';
export const PART_ID_PREFIX = 'bprt_';
export const PERMISSION_REQUEST_ID_PREFIX = 'prm_';
export const EVENT_ID_PREFIX = 'evt_';

const randomSuffix = (length) => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

export const createSessionId = () => `${SESSION_ID_PREFIX}${Date.now().toString(36)}${randomSuffix(8)}`;
export const createMessageId = () => `${MESSAGE_ID_PREFIX}${Date.now().toString(36)}${randomSuffix(8)}`;
export const createPartId = () => `${PART_ID_PREFIX}${Date.now().toString(36)}${randomSuffix(8)}`;
export const createPermissionRequestId = () => `${PERMISSION_REQUEST_ID_PREFIX}${Date.now().toString(36)}${randomSuffix(8)}`;
export const createEventId = () => `${EVENT_ID_PREFIX}${Date.now().toString(36)}${randomSuffix(8)}`;

// Event types emitted by the builtin engine. Names and payload shapes mirror
// the OpenCode SSE subset TaskHunter consumes (see the event map in the
// module DOCUMENTATION.md); the UI cannot tell which engine produced them.
export const AgentEventType = {
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_DELETED: 'session.deleted',
  SESSION_STATUS: 'session.status',
  SESSION_IDLE: 'session.idle',
  SESSION_ERROR: 'session.error',
  SESSION_COMPACTED: 'session.compacted',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  MESSAGE_PART_DELTA: 'message.part.delta',
  PERMISSION_ASKED: 'permission.asked',
  PERMISSION_REPLIED: 'permission.replied',
};

export const SessionStatusType = {
  IDLE: 'idle',
  BUSY: 'busy',
  RETRY: 'retry',
};

// Part types persisted and rendered for builtin sessions. This is a subset of
// the OpenCode part union: step-*, patch, diff, compaction, subtask, agent and
// snapshot parts are not produced in Phase 1.
export const PartType = {
  TEXT: 'text',
  REASONING: 'reasoning',
  TOOL: 'tool',
  FILE: 'file',
};

export const ToolStateStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
};

// Normalized provider stream chunks (provider adapter -> agent loop).
// Every adapter yields exactly these shapes; the loop never parses wire
// formats. Tool input arrives as raw fragments the loop accumulates and
// JSON-parses once the tool call completes.
export const ProviderChunkType = {
  TEXT_DELTA: 'text-delta',
  REASONING_DELTA: 'reasoning-delta',
  TOOL_START: 'tool-start',
  TOOL_INPUT_DELTA: 'tool-input-delta',
  TOOL_END: 'tool-end',
  DONE: 'done',
};

// Turn finish reasons. `length` means the provider stopped on output limits
// and the loop should compact before continuing; `content-filter` becomes a
// message error like upstream does.
export const FinishReason = {
  STOP: 'stop',
  TOOL_CALLS: 'tool-calls',
  LENGTH: 'length',
  CONTENT_FILTER: 'content-filter',
};

// Unified message content the loop sends to providers (provider-agnostic;
// each adapter maps it to its wire format).
export const MessageContentType = {
  TEXT: 'text',
  TOOL_CALL: 'tool-call',
  TOOL_RESULT: 'tool-result',
};

// Token accounting uses a heuristic until a tokenizer is available. Documented
// as an estimate: it only drives compaction timing, never billing.
export const ESTIMATED_CHARS_PER_TOKEN = 4;
export const estimateTokens = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
};

// Compaction budget fallback when the model catalog reports no limit.
export const DEFAULT_COMPACTION_BUDGET_TOKENS = 128_000;
export const DEFAULT_COMPACTION_TRIGGER_RATIO = 0.8;

// OpenCode Go endpoints and their wire formats. The mapping is static because
// the docs declare one format per endpoint path; model availability comes
// from the live catalog (providers/go-catalog.js), never from this table.
export const GO_API_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const GO_MODELS_URL = `${GO_API_BASE_URL}/models`;

export const ProviderFormat = {
  OPENAI_CHAT: 'openai-chat',
  ANTHROPIC_MESSAGES: 'anthropic-messages',
  OPENAI_RESPONSES: 'openai-responses',
};

export const GO_ENDPOINT_FORMATS = new Map([
  [`${GO_API_BASE_URL}/chat/completions`, ProviderFormat.OPENAI_CHAT],
  [`${GO_API_BASE_URL}/messages`, ProviderFormat.ANTHROPIC_MESSAGES],
  [`${GO_API_BASE_URL}/responses`, ProviderFormat.OPENAI_RESPONSES],
]);

export const GO_PROVIDER_ID = 'opencode-go';
export const GO_MODEL_ID_PREFIX = 'opencode-go/';

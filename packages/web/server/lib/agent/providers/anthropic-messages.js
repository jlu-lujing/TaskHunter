// Anthropic Messages streaming adapter (/v1/messages).
//
// Normalizes Anthropic SSE (event:/data: pairs, content_block deltas,
// message_delta stop reasons) into the shared provider chunk protocol.
// max_tokens is required by the API; the default is deliberately generous
// for agentic turns and is documented as tunable, not authoritative.

import { FinishReason, ProviderChunkType } from '../types.js';

export const DEFAULT_ANTHROPIC_MAX_TOKENS = 32768;
const ERROR_BODY_SNIPPET_LIMIT = 500;
const THINKING_MIN_BUDGET_TOKENS = 1024;

// Global thinking enablement. Only Anthropic-native ids qualify: the Go
// gateway serves non-Claude models (Qwen, GLM, MiniMax) over this same wire
// format, and unknown request fields would 400 there. Claude 4.7+ rejects
// manual budgets and 4.5-era models reject adaptive; the generation picks the
// mode, and a request the model refuses on the thinking field is retried in
// the other mode, then without thinking, so one generation quirk never costs
// the whole turn.
const ANTHROPIC_MODEL_PATTERN = /^claude-/i;

const modelGeneration = (apiModelID) => {
  const stripped = apiModelID.replace(ANTHROPIC_MODEL_PATTERN, '');
  const pair = /(\d+)[.-](\d+)/.exec(stripped);
  if (pair) {
    return { major: Number(pair[1]), minor: Number(pair[2]) };
  }
  const single = /(\d+)/.exec(stripped);
  return single ? { major: Number(single[1]), minor: 0 } : null;
};

const wantsAdaptiveThinking = (apiModelID) => {
  const generation = modelGeneration(apiModelID);
  return generation !== null
    && (generation.major > 4 || (generation.major === 4 && generation.minor >= 6));
};

const adaptiveThinking = () => ({ kind: 'adaptive', thinking: { type: 'adaptive' } });

const budgetThinking = (maxTokens) => {
  if (maxTokens <= THINKING_MIN_BUDGET_TOKENS) {
    return null;
  }
  const budget = Math.min(
    Math.max(THINKING_MIN_BUDGET_TOKENS, Math.floor(maxTokens * 0.8)),
    maxTokens - 1,
  );
  return { kind: 'enabled', thinking: { type: 'enabled', budget_tokens: budget } };
};

const buildThinkingConfig = (apiModelID, maxTokens) => {
  if (!ANTHROPIC_MODEL_PATTERN.test(apiModelID)) {
    return null;
  }
  return wantsAdaptiveThinking(apiModelID) ? adaptiveThinking() : budgetThinking(maxTokens);
};

// The rejection names the mode it refused:
// `"thinking.type.enabled" is not supported for this model...`.
const isThinkingRejectionFor = (status, snippet, sentType) => (
  status === 400 && (snippet || '').includes(`thinking.type.${sentType}`)
);

const flipThinkingConfig = (thinkingConfig, maxTokens) => (
  thinkingConfig.kind === 'adaptive' ? budgetThinking(maxTokens) : adaptiveThinking()
);

const readSseBlocks = async function* (body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = null;
  const flush = function* () {
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        if (pendingEvent) {
          yield pendingEvent;
          pendingEvent = null;
        }
      } else if (trimmed.startsWith(':')) {
        // comment/heartbeat, ignore
      } else if (trimmed.startsWith('event:')) {
        pendingEvent = { event: trimmed.slice('event:'.length).trim(), data: pendingEvent?.data ?? '' };
      } else if (trimmed.startsWith('data:')) {
        const data = trimmed.slice('data:'.length).trim();
        pendingEvent = { event: pendingEvent?.event ?? 'message', data: `${pendingEvent?.data ?? ''}${data}` };
      }
      boundary = buffer.indexOf('\n');
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    yield* flush();
  }
  buffer += decoder.decode();
  yield* flush();
  if (pendingEvent) {
    yield pendingEvent;
  }
};

const toContentBlocks = (content) => {
  const blocks = [];
  for (const part of content || []) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text });
    } else if (part.type === 'thinking') {
      // Signed thinking replay: Anthropic rejects a thinking-enabled request
      // whose earlier assistant turns lost their thinking blocks; the
      // signature is the part's integrity seal and must travel with it.
      if (typeof part.signature === 'string' && part.signature.length > 0) {
        blocks.push({ type: 'thinking', thinking: String(part.text ?? ''), signature: part.signature });
      }
    } else if (part.type === 'tool-call') {
      blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input ?? {} });
    } else if (part.type === 'tool-result') {
      blocks.push({
        type: 'tool_result',
        tool_use_id: part.id,
        content: String(part.output ?? ''),
        ...(part.isError ? { is_error: true } : {}),
      });
    }
  }
  return blocks;
};

const mapStopReason = (reason) => {
  if (reason === 'tool_use') {
    return FinishReason.TOOL_CALLS;
  }
  if (reason === 'max_tokens') {
    return FinishReason.LENGTH;
  }
  if (reason === 'refusal') {
    return FinishReason.CONTENT_FILTER;
  }
  return FinishReason.STOP;
};

export const streamAnthropicMessages = async function* ({
  endpoint,
  apiKey,
  apiModelID,
  extraHeaders,
  messages,
  tools,
  toolChoice,
  maxTokens = DEFAULT_ANTHROPIC_MAX_TOKENS,
  signal,
  userAgent,
  sessionRef,
  fetchImpl = fetch,
}) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error('anthropic-messages streaming requires an endpoint');
  }
  if (typeof apiModelID !== 'string' || apiModelID.length === 0) {
    throw new Error('anthropic-messages streaming requires a model ID');
  }
  const systemParts = [];
  const wireMessages = [];
  for (const message of messages || []) {
    if (message.role === 'system') {
      for (const part of message.content || []) {
        if (part.type === 'text') {
          systemParts.push(part.text);
        }
      }
      continue;
    }
    const blocks = toContentBlocks(message.content);
    if (blocks.length > 0) {
      wireMessages.push({ role: message.role, content: blocks });
    }
  }
  const requestPayload = (thinkingConfig) => ({
    model: apiModelID,
    max_tokens: maxTokens,
    stream: true,
    ...(systemParts.length > 0 ? { system: systemParts.join('\n') } : {}),
    messages: wireMessages,
    ...((tools || []).length > 0
      ? {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description || '',
          input_schema: tool.parameters || { type: 'object', properties: {} },
        })),
      }
      : {}),
    ...(toolChoice ? { tool_choice: { type: toolChoice } } : {}),
    ...(thinkingConfig ? { thinking: thinkingConfig.thinking } : {}),
  });
  const openStream = async (thinkingConfigs) => {
    // Fallback chain: the generation's mode, then the other mode, then none.
    // Only a thinking-field rejection moves to the next rung; every other
    // failure (auth, rate limit, malformed) surfaces immediately.
    let thinkingFailure = null;
    for (const thinkingConfig of thinkingConfigs) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...(userAgent ? { 'User-Agent': userAgent } : {}),
          ...(sessionRef ? { 'x-opencode-session': sessionRef } : {}),
          'anthropic-version': '2023-06-01',
          ...(extraHeaders || {}),
        },
        body: JSON.stringify(requestPayload(thinkingConfig)),
        signal,
      });
      if (response.ok && response.body) {
        return response;
      }
      const snippet = await response.text().then((text) => text.slice(0, ERROR_BODY_SNIPPET_LIMIT)).catch(() => '');
      const failure = `anthropic-messages request failed with ${response.status}${snippet ? `: ${snippet}` : ''}`;
      if (thinkingConfig && isThinkingRejectionFor(response.status, snippet, thinkingConfig.thinking.type)) {
        thinkingFailure = failure;
        continue;
      }
      throw new Error(failure);
    }
    throw new Error(thinkingFailure || 'anthropic-messages request failed');
  };
  const initialThinking = buildThinkingConfig(apiModelID, maxTokens);
  const thinkingChain = initialThinking
    ? [initialThinking, flipThinkingConfig(initialThinking, maxTokens), null].filter(Boolean)
    : [null];
  const response = await openStream(thinkingChain);

  const blockIndexToToolId = new Map();
  let finish = null;
  let usage = { input: 0, output: 0 };
  let doneEmitted = false;
  for await (const block of readSseBlocks(response.body)) {
    let event;
    try {
      event = JSON.parse(block.data);
    } catch {
      throw new Error('anthropic-messages stream contained a malformed JSON chunk');
    }
    switch (block.event) {
      case 'message_start': {
        const input = event.message?.usage?.input_tokens;
        if (Number.isFinite(input)) {
          usage.input = input;
        }
        break;
      }
      case 'content_block_start': {
        const start = event.content_block;
        if (start?.type === 'tool_use' && typeof start.id === 'string') {
          blockIndexToToolId.set(event.index, start.id);
          yield { type: ProviderChunkType.TOOL_START, id: start.id, name: start.name || '' };
        }
        break;
      }
      case 'content_block_delta': {
        const delta = event.delta;
        if (!delta) {
          break;
        }
        if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
          yield { type: ProviderChunkType.TEXT_DELTA, text: delta.text };
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && delta.partial_json.length > 0) {
          const id = blockIndexToToolId.get(event.index);
          if (id) {
            yield { type: ProviderChunkType.TOOL_INPUT_DELTA, id, text: delta.partial_json };
          }
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length > 0) {
          yield { type: ProviderChunkType.REASONING_DELTA, text: delta.thinking, blockIndex: event.index };
        } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string' && delta.signature.length > 0) {
          yield { type: ProviderChunkType.REASONING_SEAL, signature: delta.signature, blockIndex: event.index };
        }
        break;
      }
      case 'message_delta': {
        if (typeof event.delta?.stop_reason === 'string' && !finish) {
          finish = mapStopReason(event.delta.stop_reason);
        }
        const output = event.usage?.output_tokens;
        if (Number.isFinite(output)) {
          usage.output = output;
        }
        break;
      }
      case 'message_stop': {
        break;
      }
      case 'error': {
        throw new Error(`anthropic-messages stream error: ${event.error?.message || 'unknown'}`);
      }
      default: {
        break;
      }
    }
  }
  for (const id of blockIndexToToolId.values()) {
    yield { type: ProviderChunkType.TOOL_END, id };
  }
  if (!doneEmitted) {
    doneEmitted = true;
    yield { type: ProviderChunkType.DONE, finish: finish || FinishReason.STOP, usage };
  }
};

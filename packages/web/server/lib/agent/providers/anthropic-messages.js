// Anthropic Messages streaming adapter (/v1/messages).
//
// Normalizes Anthropic SSE (event:/data: pairs, content_block deltas,
// message_delta stop reasons) into the shared provider chunk protocol.
// max_tokens is required by the API; the default is deliberately generous
// for agentic turns and is documented as tunable, not authoritative.

import { FinishReason, ProviderChunkType } from '../types.js';

export const DEFAULT_ANTHROPIC_MAX_TOKENS = 32768;
const ERROR_BODY_SNIPPET_LIMIT = 500;

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
    body: JSON.stringify({
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
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const snippet = await response.text().then((text) => text.slice(0, ERROR_BODY_SNIPPET_LIMIT)).catch(() => '');
    throw new Error(`anthropic-messages request failed with ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

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
          yield { type: ProviderChunkType.REASONING_DELTA, text: delta.thinking };
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

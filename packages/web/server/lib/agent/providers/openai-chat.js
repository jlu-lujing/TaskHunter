// OpenAI Chat Completions streaming adapter (/v1/chat/completions).
//
// Maps unified loop messages to the chat wire format and normalizes the SSE
// stream (delta.tool_calls fragments, finish_reason, usage) into provider
// chunks defined in ../types.js. No dependencies beyond fetch.

import { FinishReason, ProviderChunkType } from '../types.js';

const DONE_MARKER = '[DONE]';
const ERROR_BODY_SNIPPET_LIMIT = 500;

const readSseLines = async function* (body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      yield buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      boundary = buffer.indexOf('\n');
    }
  }
  const tail = buffer.trim();
  if (tail.length > 0) {
    yield tail;
  }
};

const toWireMessage = (message) => {
  if (message.role === 'system') {
    const text = (message.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    return { role: 'system', content: text };
  }
  if (message.role === 'assistant') {
    const textParts = [];
    const toolCalls = [];
    for (const part of message.content || []) {
      if (part.type === 'text') {
        textParts.push(part.text);
      } else if (part.type === 'tool-call') {
        toolCalls.push({
          id: part.id,
          type: 'function',
          function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
        });
      }
    }
    const wire = { role: 'assistant', content: textParts.join('') || null };
    if (toolCalls.length > 0) {
      wire.tool_calls = toolCalls;
    }
    return wire;
  }
  // user role: text plus tool results
  const textParts = [];
  const toolMessages = [];
  for (const part of message.content || []) {
    if (part.type === 'text') {
      textParts.push(part.text);
    } else if (part.type === 'tool-result') {
      toolMessages.push({ role: 'tool', tool_call_id: part.id, content: String(part.output ?? '') });
    }
  }
  const messages = [];
  const text = textParts.join('');
  if (text.length > 0 || toolMessages.length === 0) {
    messages.push({ role: 'user', content: text });
  }
  messages.push(...toolMessages);
  return messages;
};

const toWireTools = (tools) => (tools || []).map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description || '',
    parameters: tool.parameters || { type: 'object', properties: {} },
  },
}));

const mapFinishReason = (reason) => {
  if (reason === 'tool_calls') {
    return FinishReason.TOOL_CALLS;
  }
  if (reason === 'length') {
    return FinishReason.LENGTH;
  }
  if (reason === 'content_filter') {
    return FinishReason.CONTENT_FILTER;
  }
  return FinishReason.STOP;
};

export const streamOpenAiChat = async function* ({
  endpoint,
  apiKey,
  apiModelID,
  extraHeaders,
  messages,
  tools,
  toolChoice,
  signal,
  userAgent,
  sessionRef,
  fetchImpl = fetch,
}) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error('openai-chat streaming requires an endpoint');
  }
  if (typeof apiModelID !== 'string' || apiModelID.length === 0) {
    throw new Error('openai-chat streaming requires a model ID');
  }
  const wireMessages = [];
  for (const message of messages || []) {
    const mapped = toWireMessage(message);
    if (Array.isArray(mapped)) {
      wireMessages.push(...mapped);
    } else {
      wireMessages.push(mapped);
    }
  }
  const wireTools = toWireTools(tools);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(userAgent ? { 'User-Agent': userAgent } : {}),
      ...(sessionRef ? { 'x-opencode-session': sessionRef } : {}),
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      model: apiModelID,
      stream: true,
      stream_options: { include_usage: true },
      messages: wireMessages,
      ...(wireTools.length > 0 ? { tools: wireTools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const snippet = await response.text().then((text) => text.slice(0, ERROR_BODY_SNIPPET_LIMIT)).catch(() => '');
    throw new Error(`openai-chat request failed with ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

  const seenToolCalls = new Set();
  let finish = null;
  let usage = { input: 0, output: 0 };
  for await (const line of readSseLines(response.body)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(':')) {
      continue;
    }
    if (!trimmed.startsWith('data:')) {
      continue;
    }
    const data = trimmed.slice('data:'.length).trim();
    if (data === DONE_MARKER) {
      break;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error('openai-chat stream contained a malformed JSON chunk');
    }
    if (event.usage) {
      usage = {
        input: Number.isFinite(event.usage.prompt_tokens) ? event.usage.prompt_tokens : usage.input,
        output: Number.isFinite(event.usage.completion_tokens) ? event.usage.completion_tokens : usage.output,
      };
    }
    const choice = Array.isArray(event.choices) ? event.choices[0] : null;
    const delta = choice?.delta;
    if (!delta) {
      if (typeof choice?.finish_reason === 'string' && !finish) {
        finish = mapFinishReason(choice.finish_reason);
      }
      continue;
    }
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      yield { type: ProviderChunkType.TEXT_DELTA, text: delta.content };
    }
    for (const toolCall of delta.tool_calls || []) {
      const id = toolCall.id;
      if (typeof id === 'string' && id.length > 0 && !seenToolCalls.has(id)) {
        seenToolCalls.add(id);
        yield { type: ProviderChunkType.TOOL_START, id, name: toolCall.function?.name || '' };
      }
      const fragment = toolCall.function?.arguments;
      const targetId = typeof id === 'string' && id.length > 0 ? id : Array.from(seenToolCalls).pop();
      if (typeof fragment === 'string' && fragment.length > 0 && targetId) {
        yield { type: ProviderChunkType.TOOL_INPUT_DELTA, id: targetId, text: fragment };
      }
    }
    if (typeof choice?.finish_reason === 'string' && !finish) {
      finish = mapFinishReason(choice.finish_reason);
    }
  }
  for (const id of seenToolCalls) {
    yield { type: ProviderChunkType.TOOL_END, id };
  }
  yield { type: ProviderChunkType.DONE, finish: finish || FinishReason.STOP, usage };
};

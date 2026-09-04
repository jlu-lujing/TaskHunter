// OpenAI Responses streaming adapter (/v1/responses).
//
// The Responses API is stateful and uses item types (output_text,
// function_call, function_call_output) instead of chat messages. `store` is
// set to false so the gateway keeps no server-side conversation state — the
// loop owns history. Reasoning items are consumed live but dropped from
// history (re-sending encrypted reasoning requires provider round-trips the
// loop does not perform yet).

import { FinishReason, ProviderChunkType } from '../types.js';

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

const toInputItems = (messages) => {
  const items = [];
  for (const message of messages || []) {
    if (message.role === 'system') {
      continue;
    }
    if (message.role === 'user') {
      const text = (message.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
      const results = (message.content || []).filter((part) => part.type === 'tool-result');
      if (text.length > 0 || results.length === 0) {
        items.push({ role: 'user', content: [{ type: 'input_text', text }] });
      }
      for (const result of results) {
        items.push({ type: 'function_call_output', call_id: result.id, output: String(result.output ?? '') });
      }
      continue;
    }
    // assistant role
    for (const part of message.content || []) {
      if (part.type === 'text' && part.text.length > 0) {
        items.push({ role: 'assistant', content: [{ type: 'output_text', text: part.text }] });
      } else if (part.type === 'tool-call') {
        items.push({
          type: 'function_call',
          call_id: part.id,
          name: part.name,
          arguments: JSON.stringify(part.input ?? {}),
        });
      }
    }
  }
  return items;
};

const joinSystemText = (messages) => (messages || [])
  .filter((message) => message.role === 'system')
  .flatMap((message) => (message.content || []).filter((part) => part.type === 'text').map((part) => part.text))
  .join('\n');

export const streamOpenAiResponses = async function* ({
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
    throw new Error('openai-responses streaming requires an endpoint');
  }
  if (typeof apiModelID !== 'string' || apiModelID.length === 0) {
    throw new Error('openai-responses streaming requires a model ID');
  }
  const instructions = joinSystemText(messages);
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
      store: false,
      stream: true,
      ...(instructions.length > 0 ? { instructions } : {}),
      input: toInputItems(messages),
      ...((tools || []).length > 0
        ? {
          tools: tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || { type: 'object', properties: {} },
          })),
        }
        : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const snippet = await response.text().then((text) => text.slice(0, ERROR_BODY_SNIPPET_LIMIT)).catch(() => '');
    throw new Error(`openai-responses request failed with ${response.status}${snippet ? `: ${snippet}` : ''}`);
  }

  const outputIndexToCallId = new Map();
  const endedCallIds = [];
  let sawFunctionCall = false;
  let incompleteReason = null;
  let failedError = null;
  let usage = { input: 0, output: 0 };
  for await (const line of readSseLines(response.body)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
      continue;
    }
    const data = trimmed.slice('data:'.length).trim();
    if (data === '[DONE]') {
      break;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error('openai-responses stream contained a malformed JSON chunk');
    }
    switch (event.type) {
      case 'response.output_item.added': {
        const item = event.item;
        if (item?.type === 'function_call' && typeof item.call_id === 'string') {
          outputIndexToCallId.set(event.output_index, item.call_id);
          sawFunctionCall = true;
          yield { type: ProviderChunkType.TOOL_START, id: item.call_id, name: item.name || '' };
          if (typeof item.arguments === 'string' && item.arguments.length > 0) {
            yield { type: ProviderChunkType.TOOL_INPUT_DELTA, id: item.call_id, text: item.arguments };
          }
        }
        break;
      }
      case 'response.function_call_arguments.delta': {
        const id = outputIndexToCallId.get(event.output_index);
        if (id && typeof event.delta === 'string' && event.delta.length > 0) {
          yield { type: ProviderChunkType.TOOL_INPUT_DELTA, id, text: event.delta };
        }
        break;
      }
      case 'response.function_call_arguments.done': {
        const id = outputIndexToCallId.get(event.output_index);
        if (id && !endedCallIds.includes(id)) {
          endedCallIds.push(id);
        }
        break;
      }
      case 'response.output_text.delta': {
        if (typeof event.delta === 'string' && event.delta.length > 0) {
          yield { type: ProviderChunkType.TEXT_DELTA, text: event.delta };
        }
        break;
      }
      case 'response.reasoning_summary_text.delta': {
        if (typeof event.delta === 'string' && event.delta.length > 0) {
          yield { type: ProviderChunkType.REASONING_DELTA, text: event.delta };
        }
        break;
      }
      case 'response.incomplete': {
        incompleteReason = event.response?.incomplete_details?.reason || 'length';
        break;
      }
      case 'response.failed': {
        failedError = event.response?.error?.message || 'response failed';
        break;
      }
      case 'response.completed': {
        const completedUsage = event.response?.usage;
        if (completedUsage) {
          usage = {
            input: Number.isFinite(completedUsage.input_tokens) ? completedUsage.input_tokens : usage.input,
            output: Number.isFinite(completedUsage.output_tokens) ? completedUsage.output_tokens : usage.output,
          };
        }
        break;
      }
      default: {
        break;
      }
    }
  }
  if (failedError) {
    throw new Error(`openai-responses stream failed: ${failedError}`);
  }
  for (const [, callId] of outputIndexToCallId) {
    if (!endedCallIds.includes(callId)) {
      endedCallIds.push(callId);
    }
  }
  for (const id of endedCallIds) {
    yield { type: ProviderChunkType.TOOL_END, id };
  }
  let finish = sawFunctionCall ? FinishReason.TOOL_CALLS : FinishReason.STOP;
  if (incompleteReason === 'content_filter') {
    finish = FinishReason.CONTENT_FILTER;
  } else if (incompleteReason) {
    finish = FinishReason.LENGTH;
  }
  yield { type: ProviderChunkType.DONE, finish, usage };
};

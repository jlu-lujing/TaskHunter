import { describe, expect, it } from 'vitest';

import { streamOpenAiChat } from './openai-chat.js';
import { FinishReason, ProviderChunkType } from '../types.js';

const encode = (text) => new TextEncoder().encode(text);

const sseFetch = (chunks) => async () => ({
  ok: true,
  status: 200,
  body: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encode(chunk));
      }
      controller.close();
    },
  }),
});

const collect = async (stream) => {
  const out = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
};

describe('openai-chat adapter', () => {
  it('normalizes text, tool-call fragments, and usage', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"read","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"arguments":"{\\"file"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"arguments":"Path\\":\\"a\\""}}]}}]}\n\n',
      ': heartbeat\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ];
    const seen = await collect(
      streamOpenAiChat({
        endpoint: 'https://example.test/v1/chat/completions',
        apiKey: 'k',
        apiModelID: 'm',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        tools: [{ name: 'read', description: 'r', parameters: { type: 'object' } }],
        fetchImpl: sseFetch(chunks),
      }),
    );

    expect(seen[0]).toEqual({ type: ProviderChunkType.TEXT_DELTA, text: 'Hello' });
    expect(seen).toContainEqual({ type: ProviderChunkType.TOOL_START, id: 'call_1', name: 'read' });
    const fragments = seen.filter((chunk) => chunk.type === ProviderChunkType.TOOL_INPUT_DELTA).map((chunk) => chunk.text).join('');
    expect(fragments).toBe('{"filePath":"a"');
    expect(seen).toContainEqual({ type: ProviderChunkType.TOOL_END, id: 'call_1' });
    const done = seen[seen.length - 1];
    expect(done).toEqual({ type: ProviderChunkType.DONE, finish: FinishReason.TOOL_CALLS, usage: { input: 10, output: 5 } });
  });

  it('sends model, tools, and auth headers', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(encode('data: [DONE]\n\n')); c.close(); } }) };
    };
    await collect(
      streamOpenAiChat({
        endpoint: 'https://example.test/v1/chat/completions',
        apiKey: 'secret',
        apiModelID: 'model-x',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        userAgent: 'TaskHunter-agent',
        sessionRef: 'bse_1',
        fetchImpl,
      }),
    );
    expect(captured.url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(captured.init.body);
    expect(body.model).toBe('model-x');
    expect(body.stream).toBe(true);
    expect(captured.init.headers.Authorization).toBe('Bearer secret');
    expect(captured.init.headers['User-Agent']).toBe('TaskHunter-agent');
    expect(captured.init.headers['x-opencode-session']).toBe('bse_1');
  });

  it('throws on non-2xx with a bounded snippet', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
    await expect(
      collect(streamOpenAiChat({ endpoint: 'https://e.test', apiModelID: 'm', messages: [], fetchImpl })),
    ).rejects.toThrow(/429.*rate limited/);
  });

  it('throws on malformed JSON chunks', async () => {
    await expect(
      collect(
        streamOpenAiChat({ endpoint: 'https://e.test', apiModelID: 'm', messages: [], fetchImpl: sseFetch(['data: {oops\n\n']) }),
      ),
    ).rejects.toThrow(/malformed/);
  });
});

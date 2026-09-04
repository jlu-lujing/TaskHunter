import { describe, expect, it } from 'vitest';

import { streamAnthropicMessages } from './anthropic-messages.js';
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

const block = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const collect = async (stream) => {
  const out = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
};

describe('anthropic-messages adapter', () => {
  it('normalizes text, tool input deltas, and stop reasons', async () => {
    const chunks = [
      block('message_start', { message: { usage: { input_tokens: 7 } } }),
      block('content_block_start', { index: 0, content_block: { type: 'text' } }),
      block('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Hi' } }),
      block('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'bash' } }),
      block('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"comm' } }),
      block('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: 'and":"ls"}' } }),
      block('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } }),
      block('message_stop', {}),
    ];
    const seen = await collect(
      streamAnthropicMessages({
        endpoint: 'https://example.test/v1/messages',
        apiKey: 'k',
        apiModelID: 'm',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        fetchImpl: sseFetch(chunks),
      }),
    );

    expect(seen).toContainEqual({ type: ProviderChunkType.TEXT_DELTA, text: 'Hi' });
    expect(seen).toContainEqual({ type: ProviderChunkType.TOOL_START, id: 'toolu_1', name: 'bash' });
    const fragments = seen.filter((chunk) => chunk.type === ProviderChunkType.TOOL_INPUT_DELTA).map((chunk) => chunk.text).join('');
    expect(fragments).toBe('{"command":"ls"}');
    expect(seen).toContainEqual({ type: ProviderChunkType.TOOL_END, id: 'toolu_1' });
    expect(seen[seen.length - 1]).toEqual({
      type: ProviderChunkType.DONE,
      finish: FinishReason.TOOL_CALLS,
      usage: { input: 7, output: 3 },
    });
  });

  it('maps system messages and max_tokens into the request', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(encode(`${block('message_stop', {})}`)); c.close(); } }) };
    };
    await collect(
      streamAnthropicMessages({
        endpoint: 'https://example.test/v1/messages',
        apiKey: 'k',
        apiModelID: 'm',
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'sys' }] },
          { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        ],
        fetchImpl,
      }),
    );
    const body = JSON.parse(captured.init.body);
    expect(body.system).toBe('sys');
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.stream).toBe(true);
  });

  it('surfaces stream error events', async () => {
    const chunks = [block('error', { error: { message: 'overloaded' } })];
    await expect(
      collect(streamAnthropicMessages({ endpoint: 'https://e.test', apiModelID: 'm', messages: [], fetchImpl: sseFetch(chunks) })),
    ).rejects.toThrow(/overloaded/);
  });
});

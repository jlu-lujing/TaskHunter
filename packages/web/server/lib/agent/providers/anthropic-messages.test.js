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

  it('streams thinking deltas and their sealing signature', async () => {
    const chunks = [
      block('message_start', { message: { usage: { input_tokens: 2 } } }),
      block('content_block_start', { index: 0, content_block: { type: 'thinking' } }),
      block('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'hm ' } }),
      block('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking: 'ok' } }),
      block('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'sig_abc' } }),
      block('content_block_start', { index: 1, content_block: { type: 'text' } }),
      block('content_block_delta', { index: 1, delta: { type: 'text_delta', text: 'answer' } }),
      block('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }),
      block('message_stop', {}),
    ];
    let captured;
    const fetchImpl = async (url, init) => {
      captured = init;
      return { ok: true, status: 200, body: new ReadableStream({
        start(c) { for (const chunk of chunks) { c.enqueue(encode(chunk)); } c.close(); },
      }) };
    };
    const seen = await collect(
      streamAnthropicMessages({
        endpoint: 'https://example.test/v1/messages',
        apiModelID: 'claude-sonnet-4-7',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        fetchImpl,
      }),
    );
    const reasoning = seen.filter((chunk) => chunk.type === ProviderChunkType.REASONING_DELTA).map((chunk) => chunk.text).join('');
    expect(reasoning).toBe('hm ok');
    expect(seen).toContainEqual({ type: ProviderChunkType.REASONING_SEAL, signature: 'sig_abc', blockIndex: 0 });
    expect(seen).toContainEqual({ type: ProviderChunkType.TEXT_DELTA, text: 'answer' });
    const body = JSON.parse(captured.body);
    expect(body.thinking).toEqual({ type: 'adaptive' });
  });

  it('uses a manual budget for pre-4.6 claude models and omits thinking for foreign ids', async () => {
    const bodies = [];
    const fetchImpl = async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, body: new ReadableStream({
        start(c) { c.enqueue(encode(block('message_stop', {}))); c.close(); },
      }) };
    };
    await collect(streamAnthropicMessages({ endpoint: 'https://e.test', apiModelID: 'claude-sonnet-4-5', messages: [], fetchImpl }));
    await collect(streamAnthropicMessages({ endpoint: 'https://e.test', apiModelID: 'qwen3-coder', messages: [], fetchImpl }));
    expect(bodies[0].thinking).toMatchObject({ type: 'enabled', budget_tokens: expect.any(Number) });
    expect(bodies[0].thinking.budget_tokens).toBeLessThan(bodies[0].max_tokens);
    expect(bodies[0].thinking.budget_tokens).toBeGreaterThanOrEqual(1024);
    expect(bodies[1].thinking).toBeUndefined();
  });

  it('falls back to the other thinking mode when the model rejects one', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body.thinking?.type);
      if (body.thinking?.type === 'adaptive') {
        return { ok: false, status: 400, text: async () => '"thinking.type.adaptive" is not supported for this model' };
      }
      return { ok: true, status: 200, body: new ReadableStream({
        start(c) { c.enqueue(encode(block('message_stop', {}))); c.close(); },
      }) };
    };
    await collect(streamAnthropicMessages({ endpoint: 'https://e.test', apiModelID: 'claude-sonnet-4-7', messages: [], fetchImpl }));
    expect(calls).toEqual(['adaptive', 'enabled']);
  });

  it('replays signed thinking history for tool turns', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = init;
      return { ok: true, status: 200, body: new ReadableStream({
        start(c) { c.enqueue(encode(block('message_stop', {}))); c.close(); },
      }) };
    };
    await collect(
      streamAnthropicMessages({
        endpoint: 'https://example.test/v1/messages',
        apiModelID: 'claude-sonnet-4-7',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'go' }] },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', text: 'planned', signature: 'sig_1' },
              { type: 'tool-call', id: 'toolu_9', name: 'bash', input: { command: 'ls' } },
            ],
          },
          { role: 'user', content: [{ type: 'tool-result', id: 'toolu_9', output: 'out' }] },
        ],
        fetchImpl,
      }),
    );
    const assistant = JSON.parse(captured.body).messages.find((m) => m.role === 'assistant');
    expect(assistant.content).toContainEqual({ type: 'thinking', thinking: 'planned', signature: 'sig_1' });
  });

  it('surfaces stream error events', async () => {
    const chunks = [block('error', { error: { message: 'overloaded' } })];
    await expect(
      collect(streamAnthropicMessages({ endpoint: 'https://e.test', apiModelID: 'm', messages: [], fetchImpl: sseFetch(chunks) })),
    ).rejects.toThrow(/overloaded/);
  });
});

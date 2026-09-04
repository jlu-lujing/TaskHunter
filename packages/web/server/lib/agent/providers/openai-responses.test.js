import { describe, expect, it } from 'vitest';

import { streamOpenAiResponses } from './openai-responses.js';
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

const line = (event) => `data: ${JSON.stringify(event)}\n\n`;

const collect = async (stream) => {
  const out = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
};

describe('openai-responses adapter', () => {
  it('normalizes function calls and output text', async () => {
    const chunks = [
      line({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'call_9', name: 'read' } }),
      line({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"filePath"' }),
      line({ type: 'response.function_call_arguments.delta', output_index: 0, delta: ':"x"}' }),
      line({ type: 'response.function_call_arguments.done', output_index: 0 }),
      line({ type: 'response.output_text.delta', output_index: 1, delta: 'done' }),
      line({ type: 'response.completed', response: { usage: { input_tokens: 4, output_tokens: 2 } } }),
    ];
    const seen = await collect(
      streamOpenAiResponses({
        endpoint: 'https://example.test/v1/responses',
        apiKey: 'k',
        apiModelID: 'm',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        fetchImpl: sseFetch(chunks),
      }),
    );

    expect(seen).toContainEqual({ type: ProviderChunkType.TOOL_START, id: 'call_9', name: 'read' });
    const fragments = seen.filter((chunk) => chunk.type === ProviderChunkType.TOOL_INPUT_DELTA).map((chunk) => chunk.text).join('');
    expect(fragments).toBe('{"filePath":"x"}');
    expect(seen).toContainEqual({ type: ProviderChunkType.TEXT_DELTA, text: 'done' });
    expect(seen[seen.length - 1]).toEqual({
      type: ProviderChunkType.DONE,
      finish: FinishReason.TOOL_CALLS,
      usage: { input: 4, output: 2 },
    });
  });

  it('sends store:false with instructions and input items', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(encode('data: [DONE]\n\n')); c.close(); } }) };
    };
    await collect(
      streamOpenAiResponses({
        endpoint: 'https://example.test/v1/responses',
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
    expect(body.store).toBe(false);
    expect(body.instructions).toBe('sys');
    expect(body.input[0]).toMatchObject({ role: 'user' });
  });

  it('throws when the response fails', async () => {
    const chunks = [line({ type: 'response.failed', response: { error: { message: 'bad gateway' } } })];
    await expect(
      collect(streamOpenAiResponses({ endpoint: 'https://e.test', apiModelID: 'm', messages: [], fetchImpl: sseFetch(chunks) })),
    ).rejects.toThrow(/bad gateway/);
  });
});

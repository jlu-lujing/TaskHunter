import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from './markdown-worker-protocol';

mock.module('./markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));

const OPEN = '<pre class="shiki"><code>';
const CLOSE = '</code></pre>';
// One element per line, like Shiki: the line is its own highlight.
const toyLines = (code: string): string[] => code.split('\n').map((line) => `<span class="line">${line}</span>`);
const oneShot = (code: string): string => `${OPEN}${toyLines(code).join('\n')}${CLOSE}`;

/**
 * A worker that answers highlight requests with a toy highlighter and counts
 * them. With `held` set, answers wait there until a test releases them.
 */
class CountingWorker {
  static highlightRequests = 0;
  static fromLines: number[] = [];
  static held: Array<() => void> | null = null;
  // Shifts the echoed line, as a misbehaving worker would.
  static skewFromLine = 0;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;

  postMessage(message: MarkdownWorkerRequest): void {
    let data: MarkdownWorkerResponse;
    if (message.type === 'highlight') {
      data = { type: 'highlight', id: message.id, html: oneShot(message.code) };
    } else if (message.type === 'highlightFrom') {
      CountingWorker.fromLines.push(message.fromLine);
      const fromLine = message.fromLine + CountingWorker.skewFromLine;
      data = { type: 'highlightFrom', id: message.id, fromLine, open: OPEN, close: CLOSE, lines: toyLines(message.code).slice(fromLine) };
    } else {
      return;
    }
    CountingWorker.highlightRequests += 1;
    const answer = () => this.onmessage?.(new MessageEvent('message', { data }));
    if (CountingWorker.held) CountingWorker.held.push(answer);
    else setTimeout(answer, 0);
  }

  terminate(): void {}
}

// bun test has no `window` or `Worker`; CountingWorker implements the
// members markdown-worker uses.
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis, 'Worker', { value: CountingWorker, configurable: true, writable: true });
const { highlightCodeInWorker, resetMarkdownWorkerClientCacheForTests } = await import('./markdown-worker');

const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

beforeEach(() => {
  resetMarkdownWorkerClientCacheForTests();
  CountingWorker.highlightRequests = 0;
  CountingWorker.fromLines = [];
  CountingWorker.held = null;
  CountingWorker.skewFromLine = 0;
});

describe('markdown-worker transient highlights', () => {
  test('a fence that closes on the code of its last open step is not highlighted again', async () => {
    expect(await highlightCodeInWorker('const a = 1;\n', 'ts', { transient: true })).toBe(oneShot('const a = 1;\n'));
    expect(await highlightCodeInWorker('const a = 1;\nconst b = 2;\n', 'ts', { transient: true })).toBe(oneShot('const a = 1;\nconst b = 2;\n'));
    expect(CountingWorker.highlightRequests).toBe(2);

    // The fence closes: the settled request reuses the last open step and
    // keeps it from then on.
    expect(await highlightCodeInWorker('const a = 1;\nconst b = 2;\n', 'ts')).toBe(oneShot('const a = 1;\nconst b = 2;\n'));
    expect(await highlightCodeInWorker('const a = 1;\nconst b = 2;\n', 'ts')).toBe(oneShot('const a = 1;\nconst b = 2;\n'));
    expect(CountingWorker.highlightRequests).toBe(2);

    // Other code still goes to the worker.
    await highlightCodeInWorker('const c = 3;', 'ts');
    expect(CountingWorker.highlightRequests).toBe(3);
  });

  test('a growing fence asks only for the lines after the ones it already has', async () => {
    const lines = ['const a = 1;', 'if (a < 2 && b > "x") {', `  call('${'long '.repeat(400)}');`, '}', ''];
    for (let count = 1; count <= lines.length; count += 1) {
      const code = `${lines.slice(0, count).join('\n')}\n`;
      expect(await highlightCodeInWorker(code, 'ts', { transient: true })).toBe(oneShot(code));
    }
    expect(CountingWorker.fromLines).toEqual([0, 1, 2, 3, 4]);
  });

  test('a line that was still being written is asked for again', async () => {
    await highlightCodeInWorker('one\ntw', 'text', { transient: true });
    expect(await highlightCodeInWorker('one\ntwo\nthree\n', 'text', { transient: true })).toBe(oneShot('one\ntwo\nthree\n'));
    // Only `one` ended, line break included, before the text changed.
    expect(CountingWorker.fromLines).toEqual([0, 1]);
  });

  test('other languages and unrelated code start over', async () => {
    await highlightCodeInWorker('a\nb\n', 'ts', { transient: true });
    await highlightCodeInWorker('a\nb\nc\n', 'python', { transient: true });
    await highlightCodeInWorker('x\ny\n', 'ts', { transient: true });
    expect(CountingWorker.fromLines).toEqual([0, 0, 0]);
  });

  test('a stale response does not replace the newer step it raced with', async () => {
    await highlightCodeInWorker('a\n', 'ts', { transient: true });

    CountingWorker.held = [];
    const older = highlightCodeInWorker('a\nb\n', 'ts', { transient: true });
    const newer = highlightCodeInWorker('a\nb\nc\n', 'ts', { transient: true });
    await flush();
    const [answerOlder, answerNewer] = CountingWorker.held;
    expect(answerOlder).toBeDefined();
    expect(answerNewer).toBeDefined();
    // The newer step lands first; the older one arrives after it.
    answerNewer?.();
    expect(await newer).toBe(oneShot('a\nb\nc\n'));
    answerOlder?.();
    // Its HTML is still right for its own code.
    expect(await older).toBe(oneShot('a\nb\n'));
    CountingWorker.held = null;

    // The next step continues from the newer one, not the stale one.
    expect(await highlightCodeInWorker('a\nb\nc\nd\n', 'ts', { transient: true })).toBe(oneShot('a\nb\nc\nd\n'));
    expect(CountingWorker.fromLines).toEqual([0, 1, 1, 3]);
  });

  test('lines that do not add up are not spliced in', async () => {
    await highlightCodeInWorker('a\n', 'ts', { transient: true });
    CountingWorker.skewFromLine = 1;
    expect(await highlightCodeInWorker('a\nb\n', 'ts', { transient: true })).toBe(oneShot('a\nb\n'));
    // The step fell back to highlighting the whole block.
    expect(CountingWorker.highlightRequests).toBe(3);
  });
});

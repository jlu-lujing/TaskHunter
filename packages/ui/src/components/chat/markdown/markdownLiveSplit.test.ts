import { describe, expect, mock, test } from 'bun:test';

mock.module('./markdown-worker', () => ({
  highlightCodeInWorker: mock(async () => null),
  highlightLinesInWorker: mock(async () => null),
  highlightTokensInWorker: mock(async () => null),
  resetMarkdownWorkerClientCacheForTests: mock(() => undefined),
}));

const { __liveSplitStatsForTests, __streamBlocksForTests, resetLiveSplitMemoForTests } = await import('./markdownCore');

// Every prefix split from nothing: what the full lexer path answers.
const splitFresh = (text: string) => {
  resetLiveSplitMemoForTests();
  return __streamBlocksForTests(text, true);
};

const expectSameAsFreshAtEveryStep = (head: string, growth: string): { reused: number; lexed: number } => {
  const prefixes = Array.from({ length: growth.length + 1 }, (_, length) => head + growth.slice(0, length));
  const fresh = prefixes.map(splitFresh);

  resetLiveSplitMemoForTests();
  prefixes.forEach((prefix, index) => {
    expect(__streamBlocksForTests(prefix, true)).toEqual(fresh[index]!);
  });
  return __liveSplitStatsForTests();
};

describe('live split while a fence stays open', () => {
  const head = 'Intro paragraph with **bold**.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\n';

  test('matches a fresh split at every character and stops lexing the message', () => {
    const growth = 'const a = `open\nstill ${inside}`\n\n# not a heading\nfunction f() {}\n';
    const stats = expectSameAsFreshAtEveryStep(head, growth);
    expect(stats.lexed).toBe(1);
    expect(stats.reused).toBe(growth.length);
  });

  test('a closing fence, arriving character by character, goes back to the lexer', () => {
    const growth = 'let x = 1\n```\n\nProse after the block with a [link](https://example.com).\n';
    const stats = expectSameAsFreshAtEveryStep(head, growth);
    expect(stats.lexed).toBeGreaterThan(1);
    expect(stats.reused).toBeGreaterThan(0);
  });

  test('a shorter marker or the other marker character does not close the fence', () => {
    const tildeHead = 'Text.\n\n~~~~md\n';
    const stats = expectSameAsFreshAtEveryStep(tildeHead, '```\ninner\n```\n~~~\nstill inside\n');
    expect(stats.lexed).toBe(1);
  });

  test('a reference definition inside the code takes the full path, as the lexer path does', () => {
    expectSameAsFreshAtEveryStep(head, 'ok\n[ref]: https://example.com\nmore\n');
  });

  test('a message that opens with a fence holding a reference definition matches the lexer path', () => {
    expectSameAsFreshAtEveryStep('```ts\n[ref]: https://example.com\n', `${'x\n'.repeat(305)}y`);
  });

  test('text that is not an extension of a remembered split is lexed', () => {
    resetLiveSplitMemoForTests();
    __streamBlocksForTests(`${head}let a = 1\n`, true);
    const other = 'Different message.\n\n```py\nprint(1)\n';
    expect(__streamBlocksForTests(other, true)).toEqual(splitFresh(other));
  });

  test('two parts streaming side by side each keep their own split', () => {
    resetLiveSplitMemoForTests();
    const first = `${head}let a = 1\n`;
    const second = 'Second part.\n\n```py\nx = 1\n';
    __streamBlocksForTests(first, true);
    __streamBlocksForTests(second, true);
    const before = __liveSplitStatsForTests().reused;
    __streamBlocksForTests(`${first}let b = 2\n`, true);
    __streamBlocksForTests(`${second}y = 2\n`, true);
    expect(__liveSplitStatsForTests().reused).toBe(before + 2);
  });

  test('a fence over the highlight line limit turns highlighting off on both paths', () => {
    const manyLines = 'x\n'.repeat(320);
    resetLiveSplitMemoForTests();
    __streamBlocksForTests(head, true);
    const extended = __streamBlocksForTests(head + manyLines, true);
    expect(extended).toEqual(splitFresh(head + manyLines));
    expect(extended.at(-1)?.highlight).toBe(false);
  });
});

// Prose lexes again only from the second-to-last block. Every prefix, fed one
// character at a time, must split exactly as a fresh lex of that prefix does.
describe('incremental split while prose streams', () => {
  const documents = {
    'list items merging across blank lines': '- one\n\n- two\n  continued\n\n- three\n\nAfter the list.\n\n1. a\n2. b\n',
    'table interrupting a paragraph': 'Lead paragraph\n| a | b |\n|---|---|\n| 1 | 2 |\n\nTail.\n',
    'setext heading and lazy quote': 'Title\n=====\n\n> quoted\nlazy line\n\nPara\n---\n\nend\n',
    'nested fences': '````md\n```ts\nconst a = 1\n```\n````\n\n~~~\n```\nstill code\n~~~\n\nafter\n',
    'display math spanning a blank line': 'Before.\n\n\\[\na = b\n\nc = d\n\\]\n\nAfter.\n',
    'disclosure with a summary spanning a blank line': '<details><summary>Sum\n\nmary</summary>\n\n**Body**\n\n</details>\n\nAfter.\n',
    'reference links': 'See [the docs][docs] and [^1].\n\n[docs]: https://example.com\n\n[^1]: A note.\n',
    'html comment': 'Intro\n\n<!-- a comment\n\nspanning -->\n\nOutro\n',
    'zero-width paragraphs': 'Intro\n\n\u200B\n\n- a\n\n\u200B\u200B\n\n\u200B\nJoined line\n\nOutro \u{1F468}\u200D\u{1F469}\n\n\uFEFF',
  } satisfies Record<string, string>;

  for (const [name, document] of Object.entries(documents)) {
    test(name, () => {
      expectSameAsFreshAtEveryStep('', document);
    });
  }

  test('a settled message splits as a fresh lex after streaming it', () => {
    const text = Object.values(documents).join('\n');
    resetLiveSplitMemoForTests();
    for (let end = 1; end <= text.length; end += 7) __streamBlocksForTests(text.slice(0, end), true);
    __streamBlocksForTests(text, true);
    const settled = __streamBlocksForTests(text, false);
    resetLiveSplitMemoForTests();
    expect(settled).toEqual(__streamBlocksForTests(text, false));
  });

  test('a settled message is split into the same blocks it streamed in', () => {
    resetLiveSplitMemoForTests();
    const text = 'First paragraph.\n\n- a\n- b\n\n```ts\nconst x = 1\n```\n\nLast paragraph.';
    const streamed = __streamBlocksForTests(text, true);
    const settled = __streamBlocksForTests(text, false);
    expect(settled.map((block) => block.raw)).toEqual(streamed.map((block) => block.raw));
    expect(settled.every((block) => block.mode === 'full' && block.src === block.raw)).toBe(true);
  });
});

describe('paragraphs of only zero-width characters', () => {
  test('take no block, streaming or settled', () => {
    const text = 'Done.\n\n\u200B\n\n\u200C\u200D\n\nFamily: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}, Persian: \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645';
    for (const live of [true, false]) {
      resetLiveSplitMemoForTests();
      expect(__streamBlocksForTests(text, live).map((block) => block.raw)).toEqual([
        'Done.',
        'Family: \u{1F468}\u200D\u{1F469}\u200D\u{1F467}, Persian: \u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645',
      ]);
    }
  });

  test('a text of only zero-width characters has no blocks', () => {
    for (const text of ['\u200B', '\uFEFF\n', '\u200B\n\n\u2060']) {
      for (const live of [true, false]) {
        resetLiveSplitMemoForTests();
        expect(__streamBlocksForTests(text, live)).toEqual([]);
      }
    }
  });

  test('a zero-width character that starts a line of text stays with it', () => {
    resetLiveSplitMemoForTests();
    expect(__streamBlocksForTests('\u200B\nHello', false).map((block) => block.raw)).toEqual(['\u200B\nHello']);
  });
});

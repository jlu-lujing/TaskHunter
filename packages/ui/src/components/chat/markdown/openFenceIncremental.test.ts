import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { createHighlighter, hastToHtml } from 'shiki';

// The real sanitizer and decoration on a happy-dom window, and real Shiki
// output in the shape the worker returns: every open-fence step is compared
// with rendering the same text in one shot.
const win = new Window({ url: 'https://openchamber.test/' });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  Element: win.Element,
  HTMLElement: win.HTMLElement,
  HTMLAnchorElement: win.HTMLAnchorElement,
  HTMLTableElement: win.HTMLTableElement,
  Node: win.Node,
  DocumentFragment: win.DocumentFragment,
});

const { MARKDOWN_SHIKI_THEME, MARKDOWN_SHIKI_THEME_DEFINITION } = await import('./markdownShikiThemeDefinition');
const { createIncrementalCodeHighlighter } = await import('./incrementalCodeHighlight');

const shiki = await createHighlighter({
  themes: [MARKDOWN_SHIKI_THEME_DEFINITION],
  langs: ['typescript', 'python'],
});
const resolveLang = (lang: string): string => (shiki.getLoadedLanguages().includes(lang) ? lang : 'text');
const fullPass = (code: string, lang: string): string =>
  shiki.codeToHtml(code, { lang: resolveLang(lang), theme: MARKDOWN_SHIKI_THEME, tabindex: false });
const incremental = createIncrementalCodeHighlighter({
  render: (chunk, lang, grammarState) => {
    const hast = shiki.codeToHast(chunk, { lang, theme: MARKDOWN_SHIKI_THEME, tabindex: false, grammarState });
    return { html: hastToHtml(hast), grammarState: shiki.getLastGrammarState(hast) };
  },
});

// Codes the next highlight fails on, as a worker timeout would.
const failingCodes = new Set<string>();
mock.module('./markdown-worker', () => ({
  highlightCodeInWorker: async (code: string, lang: string, options: { transient?: boolean } = {}) => {
    if (failingCodes.has(code)) return null;
    const resolved = resolveLang(lang);
    return (options.transient ? incremental.highlight(code, resolved) : null) ?? fullPass(code, resolved);
  },
}));

const {
  __pipelineStatsForTests,
  renderMarkdownBlocks,
  resetLiveSplitMemoForTests,
  resetMarkdownHtmlCacheForTests,
  resetPipelineStatsForTests,
} = await import('./markdownCore');
const { applyOpenFencePatch, createOpenFenceRenderer } = await import('./openFenceIncremental');
const { decorateMarkdown } = await import('./decorate');
const { default: DOMPurify } = await import('dompurify');

const ctx = {
  labels: {
    copy: 'Copy', copied: 'Copied', enableCodeWrap: 'Wrap', disableCodeWrap: 'Unwrap',
    enableTableWrap: 'Wrap cells', disableTableWrap: 'Unwrap cells',
    copyTable: 'Copy table', downloadTable: 'Download table', copyDiagram: 'Copy diagram',
    downloadDiagram: 'Download diagram', zoomInDiagram: 'Zoom in', zoomOutDiagram: 'Zoom out',
    resetDiagramView: 'Reset', previewLabel: 'Preview', previewTitle: 'Preview',
  },
  mermaidControls: { download: false, copy: false, showPanZoomControls: false },
  codeBlockLineWrap: false,
  tableCellWrap: false,
  renderMermaid: () => ({}),
};

type Rendered = Awaited<ReturnType<typeof renderMarkdownBlocks>>;

const resetAll = (): void => {
  resetMarkdownHtmlCacheForTests();
  resetLiveSplitMemoForTests();
  resetPipelineStatsForTests();
  incremental.reset();
};

/** What rendering `text` with nothing remembered gives. */
const oneShot = async (text: string): Promise<Rendered> => {
  resetAll();
  return renderMarkdownBlocks(text, true, 'label');
};

const paint = (html: string): HTMLElement => {
  const block = document.createElement('div');
  block.innerHTML = html;
  decorateMarkdown(block, ctx);
  return block;
};

/**
 * Paints successive renders the way the renderer does: an unchanged block is
 * kept, a block with a patch for what it shows is patched, anything else is
 * rebuilt.
 */
const createPainter = () => {
  const painted: Array<{ id: string; element: HTMLElement }> = [];
  let patched = 0;
  return {
    apply(blocks: Rendered): void {
      blocks.forEach((block, index) => {
        const current = painted[index];
        if (current?.id === block.id) return;
        const patch = current ? block.patchFrom?.(current.id) : null;
        if (current && patch && applyOpenFencePatch(current.element, patch)) {
          patched += 1;
          current.id = block.id;
          return;
        }
        painted[index] = { id: block.id, element: paint(block.html) };
      });
      painted.length = blocks.length;
    },
    elements: (): HTMLElement[] => painted.map((entry) => entry.element),
    patched: (): number => patched,
  };
};

const fence = (lang: string, lines: string[]): string => `Intro paragraph.\n\n\`\`\`${lang}\n${lines.join('\n')}\n`;

/** Committed lines, as the stream delivers them, and mid-line releases of a long line. */
const streamPrefixes = (text: string, midLineEvery = 0): string[] => {
  const prefixes: string[] = [];
  let lineStart = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    if (midLineEvery > 0) {
      for (let cut = lineStart + midLineEvery; cut < index; cut += midLineEvery) prefixes.push(text.slice(0, cut));
    }
    prefixes.push(text.slice(0, index + 1));
    lineStart = index + 1;
  }
  return prefixes;
};

const LONG_LINE = `const long = [${Array.from({ length: 300 }, (_, index) => `"item <${index}> & 'x'"`).join(', ')}];`;

const SAMPLES = {
  typescript: {
    lang: 'ts',
    lines: [
      'const greeting = `hello',
      '  ${user.name} <b>&amp;</b>,',
      '  welcome back`',
      '/* a comment that',
      '   runs over lines */',
      'export function add(a: number, b: number): number {',
      '  return a < b && b > 0 ? a + b : 0; // "quoted" & <tag>',
      '}',
      '',
      LONG_LINE,
      'type Pair<T> = [T, T];',
    ],
  },
  python: {
    lang: 'python',
    lines: ['def call(vm, argc):', '    """Docstring that', '    spans <lines> & more."""', '    frame = Frame(vm)', "    return f'{frame!r}' if argc < 2 else None"],
  },
  plain: {
    lang: 'text',
    lines: ['plain line one', 'plain <div class="x" onclick="alert(1)">&amp;</div> two', '<script>alert(1)</script>', '', '   indented & spaced   '],
  },
} satisfies Record<string, { lang: string; lines: string[] }>;

beforeEach(() => {
  resetAll();
  failingCodes.clear();
});

describe('open fence rendered by its new lines', () => {
  for (const [name, { lang, lines }] of Object.entries(SAMPLES)) {
    for (const midLine of [0, 97]) {
      test(`${name}${midLine ? ', released mid-line' : ''}: every step equals the one-shot render, in HTML and DOM`, async () => {
        const prefixes = streamPrefixes(fence(lang, lines), midLine);
        const expected: Rendered[] = [];
        for (const prefix of prefixes) expected.push(await oneShot(prefix));

        resetAll();
        const painter = createPainter();
        let fenceSteps = 0;
        for (const [step, prefix] of prefixes.entries()) {
          const blocks = await renderMarkdownBlocks(prefix, true, 'label');
          const want = expected[step] ?? [];
          expect(blocks.map((block) => block.id)).toEqual(want.map((block) => block.id));
          expect(blocks.map((block) => block.html)).toEqual(want.map((block) => block.html));
          if (blocks.at(-1)?.html.includes('<pre')) fenceSteps += 1;

          painter.apply(blocks);
          const elements = painter.elements();
          want.forEach((block, index) => {
            const fresh = paint(block.html);
            expect(elements[index]?.innerHTML).toBe(fresh.innerHTML);
            expect(elements[index]?.isEqualNode(fresh)).toBe(true);
          });
        }
        // Every step after the fence's first one patched the painted block.
        expect(painter.patched()).toBe(fenceSteps - 1);
      });
    }
  }

  test('a step sanitizes only the lines it adds', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `export const value${index} = compute(${index}, "<s${index}>") && other.call(${index});`);
    const prefixes = streamPrefixes(fence('ts', lines));
    let fenceHtml = '';
    let fenceSanitized = 0;
    for (const prefix of prefixes) {
      resetPipelineStatsForTests();
      const blocks = await renderMarkdownBlocks(prefix, true, 'label');
      const stats = __pipelineStatsForTests();
      const last = blocks.at(-1)?.html ?? '';
      if (!last.includes('<pre')) continue;
      if (fenceHtml) {
        // One sanitize per step, over the new line and the empty last one.
        expect(stats.sanitizeCalls).toBe(1);
        expect(stats.sanitizedChars).toBeLessThan(last.length - fenceHtml.length + 200);
      }
      fenceSanitized += stats.sanitizedChars;
      fenceHtml = last;
    }
    // Sanitizing the whole block on every step would read it ~100 times.
    expect(fenceSanitized).toBeLessThan(fenceHtml.length * 2);
  });

  test('an edit that is not an append renders whole, then continues by lines', async () => {
    const lines = ['let a = 1;', 'let b = 2;', 'let c = 3;', 'let d = 4;'];
    const painter = createPainter();
    for (const prefix of streamPrefixes(fence('ts', lines))) painter.apply(await renderMarkdownBlocks(prefix, true, 'label'));
    const before = painter.patched();

    const edited = fence('ts', ['let a = 1;', 'let B = "<edited>";', 'let c = 3;', 'let d = 4;']);
    resetPipelineStatsForTests();
    const blocks = await renderMarkdownBlocks(edited, true, 'label');
    // The whole block is sanitized again, not just its last lines.
    expect(__pipelineStatsForTests().sanitizedChars).toBeGreaterThan((blocks.at(-1)?.html.length ?? 0) * 0.9);
    painter.apply(blocks);
    expect(painter.patched()).toBe(before);
    const grown = `${edited}let e = 5;\n`;
    const next = await renderMarkdownBlocks(grown, true, 'label');
    painter.apply(next);
    expect(painter.patched()).toBe(before + 1);

    const expected = await oneShot(grown);
    expect(next.map((block) => block.html)).toEqual(expected.map((block) => block.html));
    expect(painter.elements().at(-1)?.innerHTML).toBe(paint(expected.at(-1)?.html ?? '').innerHTML);
  });

  test('a failed highlight and the closing fence take the full path', async () => {
    const lines = ['x = 1', 'y = 2', 'z = 3'];
    const painter = createPainter();
    const prefixes = streamPrefixes(fence('python', lines));
    for (const prefix of prefixes.slice(0, -1)) painter.apply(await renderMarkdownBlocks(prefix, true, 'label'));
    const patchedBefore = painter.patched();

    // The last step's highlight fails: the block renders plain, unpatched.
    failingCodes.add(`${lines.join('\n')}\n`);
    const failed = await renderMarkdownBlocks(prefixes.at(-1) ?? '', true, 'label');
    painter.apply(failed);
    expect(painter.patched()).toBe(patchedBefore);
    expect(failed.at(-1)?.html).not.toContain('shiki');
    failingCodes.clear();

    const closed = `${fence('python', lines)}\`\`\`\n`;
    const settled = await renderMarkdownBlocks(closed, true, 'label');
    expect(settled.at(-1)?.patchFrom).toBeUndefined();
    painter.apply(settled);
    expect(painter.patched()).toBe(patchedBefore);
    const expected = await oneShot(closed);
    expect(settled.map((block) => block.html)).toEqual(expected.map((block) => block.html));
  });
});

describe('createOpenFenceRenderer', () => {
  const sanitize = (html: string): string => DOMPurify.sanitize(html);
  const highlighted = (lines: string[]): string => fullPass(`${lines.join('\n')}\n`, 'typescript').replace(/^<pre/, '<pre data-md-lang="ts"');

  test('does not patch a block painted from a newer step', () => {
    const renderer = createOpenFenceRenderer(sanitize);
    renderer.render(highlighted(['a;', 'b;']), 'two', false);
    renderer.render(highlighted(['a;', 'b;', 'c;']), 'three', false);
    const four = renderer.render(highlighted(['a;', 'b;', 'c;', 'd;']), 'four', false);
    expect(four.patchFrom?.('two')).toMatchObject({ keepLines: 2, expectLines: 3 });
    // The stream went back to an older text: the newer block is not a base.
    const again = renderer.render(highlighted(['a;', 'b;', 'c;']), 'three-again', false);
    expect(again.patchFrom?.('four') ?? null).toBeNull();
  });

  test('a patch is refused, leaving the DOM untouched, when the block has another shape', () => {
    const renderer = createOpenFenceRenderer(sanitize);
    const first = renderer.render(highlighted(['a;', 'b;']), 'first', false);
    const second = renderer.render(highlighted(['a;', 'b;', 'c;']), 'second', false);
    const patch = second.patchFrom?.('first');
    expect(patch).toBeTruthy();
    if (!patch) return;

    const extraLine = paint(first.html);
    extraLine.querySelector('code')?.append(document.createElement('span'));
    const extraLineHtml = extraLine.innerHTML;
    expect(applyOpenFencePatch(extraLine, patch)).toBe(false);
    expect(extraLine.innerHTML).toBe(extraLineHtml);

    const ok = paint(first.html);
    expect(applyOpenFencePatch(ok, patch)).toBe(true);
    expect(ok.innerHTML).toBe(paint(second.html).innerHTML);
  });
});

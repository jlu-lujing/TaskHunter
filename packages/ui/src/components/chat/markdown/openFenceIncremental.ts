// A code fence that is still streaming, sanitized and painted by its new lines.
//
// The open fence arrives once per committed line, each time as the whole
// highlighted block. Sanitizing that block and diffing it into the DOM on every
// step made the cost of a fence grow with the square of its length. Shiki
// output is one `<span class="line">` per source line, separated by line
// breaks, and a line's HTML depends only on the text up to its end. So the
// HTML of every finished line stays the same while the fence grows: only the
// lines after them are sanitized, and the DOM keeps the lines it already has.
//
// Nothing is assumed about that stability. A step is extended only when its
// highlighted HTML starts, byte for byte, with the part already sanitized, and
// ends with the same closing tags. Sanitizing is per node, so the sanitized
// prefix followed by the newly sanitized lines is exactly what sanitizing the
// whole block gives. Anything else (an edit, a different language, a failed
// highlight, output of another shape) sanitizes the block whole and starts a
// new lineage from it.
//
// A block that ends in an unfinished source line keeps two lines open: that
// line and the empty one the trailing line break draws. Otherwise only the
// empty one is open. The caller knows the source, so it says which.

export type OpenFencePatch = {
  /** Line elements the painted `<code>` has, as a check before patching. */
  expectLines: number;
  /** Line elements that stay; the rest are replaced by `html`. */
  keepLines: number;
  /** Sanitized HTML of the lines from `keepLines` on. */
  html: string;
};

type RenderedOpenFence = {
  html: string;
  /** The DOM change turning the block painted under `paintedId` into this one. */
  patchFrom?: (paintedId: string) => OpenFencePatch | null;
};

type Painted = { finalLines: number; safeLength: number; lines: number };

type Lineage = {
  /** The highlighted `<pre><code>` and every finished line with its break. */
  raw: string;
  /** `raw`, sanitized. */
  safe: string;
  finalLines: number;
  rawClose: string;
  safeClose: string;
  /** Recent block ids rendered from this lineage, oldest first. */
  painted: Map<string, Painted>;
};

const SHIKI_CODE_BLOCK = /^(<pre\b[^>]*\bclass="shiki\b[^>]*><code\b[^>]*>)([\s\S]*)(<\/code><\/pre>\s*)$/;
const LINE_START = '<span class="line"';
const MAX_LINEAGES = 4;
const MAX_PAINTED = 8;
// Past the open-fence highlight limit a fence renders unhighlighted anyway.
const MAX_LINEAGE_CHARS = 1024 * 1024;

const countBreaks = (value: string): number => {
  let breaks = 0;
  for (let index = value.indexOf('\n'); index !== -1; index = value.indexOf('\n', index + 1)) breaks += 1;
  return breaks;
};

/** Offset just past the `count`-th line break of `value`. */
const afterBreak = (value: string, count: number): number => {
  let index = -1;
  for (let found = 0; found < count; found += 1) index = value.indexOf('\n', index + 1);
  return index + 1;
};

export const createOpenFenceRenderer = (sanitize: (html: string) => string) => {
  // Most recently used first.
  let lineages: Lineage[] = [];

  const findLineage = (raw: string): Lineage | undefined => {
    let best: Lineage | undefined;
    for (const lineage of lineages) {
      if (best && best.raw.length >= lineage.raw.length) continue;
      if (raw.length < lineage.raw.length + lineage.rawClose.length) continue;
      if (raw.startsWith(lineage.raw) && raw.endsWith(lineage.rawClose)) best = lineage;
    }
    return best;
  };

  /**
   * Moves the finished lines of `middle` (the text after the lineage's prefix)
   * into the prefix and records the block painted from this step.
   */
  const commit = (
    lineage: Lineage,
    raw: string,
    middle: string,
    safeMiddle: string,
    breaks: number,
    openLines: number,
    id: string,
  ): Painted => {
    const lines = lineage.finalLines + breaks + 1;
    const finished = Math.max(0, breaks + 1 - openLines);
    if (finished > 0) {
      lineage.raw = raw.slice(0, lineage.raw.length + afterBreak(middle, finished));
      lineage.safe += safeMiddle.slice(0, afterBreak(safeMiddle, finished));
      lineage.finalLines += finished;
    }
    const painted: Painted = { finalLines: lineage.finalLines, safeLength: lineage.safe.length, lines };
    lineage.painted.delete(id);
    lineage.painted.set(id, painted);
    if (lineage.painted.size > MAX_PAINTED) {
      const oldest = lineage.painted.keys().next().value;
      if (oldest !== undefined) lineage.painted.delete(oldest);
    }
    return painted;
  };

  const patchesTo = (lineage: Lineage, html: string, current: Painted): RenderedOpenFence['patchFrom'] => {
    const body = html.length - lineage.safeClose.length;
    return (paintedId) => {
      const from = lineage.painted.get(paintedId);
      // A block painted from a longer prefix than this step's is newer than it.
      if (!from || from.safeLength > current.safeLength) return null;
      const patchHtml = html.slice(from.safeLength, body);
      if (!patchHtml.startsWith(LINE_START)) return null;
      return { expectLines: from.lines, keepLines: from.finalLines, html: patchHtml };
    };
  };

  const remember = (lineage: Lineage): void => {
    lineages = [lineage, ...lineages.filter((entry) => entry !== lineage)].slice(0, MAX_LINEAGES);
  };

  const extend = (lineage: Lineage, raw: string, openLines: number, id: string): RenderedOpenFence | null => {
    const middle = raw.slice(lineage.raw.length, raw.length - lineage.rawClose.length);
    if (!middle.startsWith(LINE_START)) return null;
    const safeMiddle = sanitize(middle);
    const breaks = countBreaks(middle);
    if (countBreaks(safeMiddle) !== breaks || !safeMiddle.startsWith(LINE_START)) return null;
    const html = `${lineage.safe}${safeMiddle}${lineage.safeClose}`;
    const painted = commit(lineage, raw, middle, safeMiddle, breaks, openLines, id);
    remember(lineage);
    return { html, patchFrom: patchesTo(lineage, html, painted) };
  };

  const seed = (raw: string, openLines: number, id: string): RenderedOpenFence => {
    const html = sanitize(raw);
    if (raw.length > MAX_LINEAGE_CHARS) return { html };
    const rawBlock = SHIKI_CODE_BLOCK.exec(raw);
    const safeBlock = SHIKI_CODE_BLOCK.exec(html);
    if (!rawBlock || !safeBlock) return { html };
    const [, rawOpen = '', rawInner = '', rawClose = ''] = rawBlock;
    const [, safeOpen = '', safeInner = '', safeClose = ''] = safeBlock;
    const breaks = countBreaks(rawInner);
    if (!rawInner.startsWith(LINE_START) || countBreaks(safeInner) !== breaks) return { html };

    const lineage: Lineage = { raw: rawOpen, safe: safeOpen, finalLines: 0, rawClose, safeClose, painted: new Map() };
    const painted = commit(lineage, raw, rawInner, safeInner, breaks, openLines, id);
    remember(lineage);
    return { html, patchFrom: patchesTo(lineage, html, painted) };
  };

  return {
    /**
     * Sanitized HTML of the highlighted open fence `raw`, rendered as block
     * `id`. `unfinishedSource` says the fence text ends inside a line.
     */
    render(raw: string, id: string, unfinishedSource: boolean): RenderedOpenFence {
      const openLines = unfinishedSource ? 2 : 1;
      const lineage = findLineage(raw);
      return (lineage && extend(lineage, raw, openLines, id)) ?? seed(raw, openLines, id);
    },
    reset(): void {
      lineages = [];
    },
  };
};

/**
 * Shiki ends code that ends in a line break with one more, empty line; for some
 * languages it holds an empty token span. Emptied, it matches the stylesheet's
 * `:empty` rule, which hides it so it gets no number of its own.
 */
export const emptyTrailingCodeLine = (code: Element): void => {
  const last = code.lastElementChild;
  if (last && last !== code.firstElementChild && last.classList.contains('line')
    && last.firstChild && last.textContent === '') {
    last.replaceChildren();
  }
};

/**
 * Applies `patch` to a block painted from an earlier step of the same fence:
 * its finished lines stay, the rest is replaced. False, with the block
 * untouched, when it does not have the shape the patch was made for.
 */
export const applyOpenFencePatch = (block: HTMLElement, patch: OpenFencePatch): boolean => {
  const pres = block.getElementsByTagName('pre');
  const pre = pres.length === 1 ? pres[0] : undefined;
  const code = pre?.firstElementChild;
  if (!pre || !code || code.tagName !== 'CODE' || code !== pre.lastElementChild) return false;
  // Line elements separated by single line-break text nodes, nothing else.
  if (code.children.length !== patch.expectLines || code.childNodes.length !== patch.expectLines * 2 - 1) return false;
  const first = code.children[patch.keepLines];
  if (!first) return false;
  while (code.lastChild && code.lastChild !== first) code.lastChild.remove();
  first.remove();
  // `patch.html` is sanitized; see createOpenFenceRenderer.
  code.insertAdjacentHTML('beforeend', patch.html);
  emptyTrailingCodeLine(code);
  return true;
};

// Message protocol for the markdown Shiki Web Worker.
//
// The worker tokenizes a complete code block off the main thread and returns
// ready-to-splice Shiki HTML. The theme is dependency-free and imported inside
// the worker directly, so it is not sent over postMessage.

// A single styled run inside a line: [length, color, fontStyleBits].
// `color` is '' for default-foreground runs; fontStyleBits is Shiki's FontStyle
// bitmask (1=italic, 2=bold, 4=underline).
export type MarkdownTokenRun = [length: number, color: string, fontStyle: number];

export type MarkdownWorkerRequest =
  | { type: 'init' }
  // Highlight a whole block to ready-to-splice Shiki `<pre>` HTML. A block that
  // extends one highlighted before is tokenized from where that one ended;
  // `fullPass` asks for a fresh pass over the whole block instead.
  | { type: 'highlight'; id: number; code: string; lang: string; fullPass?: boolean }
  // Highlight a still-streaming block and return only its lines from
  // `fromLine` on: the client already holds the HTML of the lines before it.
  // `id` doubles as the request's sequence number.
  | { type: 'highlightFrom'; id: number; code: string; lang: string; fromLine: number }
  // Highlight a whole block but return per-line inner HTML (one entry per line),
  // so per-line layouts (diffs, gutters, virtualization) tokenize in ONE call
  // instead of one worker round-trip per line.
  | { type: 'highlightLines'; id: number; code: string; lang: string }
  // Tokenize with an arbitrary registered theme and return per-line styled runs
  // with offsets — for building CodeMirror decorations. `theme` (a resolved
  // TextMate theme object) is sent only the first time a theme name is used;
  // afterwards only `themeName` is sent and the worker reuses the loaded theme.
  | { type: 'highlightTokens'; id: number; code: string; lang: string; themeName: string; theme?: unknown };

export type MarkdownWorkerResponse =
  | { type: 'highlight'; id: number; html: string }
  // `lines` holds every line of the block from `fromLine` on, the last one
  // included; `open` and `close` are the `<pre><code>` wrapper around them.
  | { type: 'highlightFrom'; id: number; fromLine: number; open: string; close: string; lines: string[] }
  | { type: 'highlightLines'; id: number; lines: string[] }
  | { type: 'highlightTokens'; id: number; lines: MarkdownTokenRun[][] }
  | { type: 'error'; id: number; message: string };

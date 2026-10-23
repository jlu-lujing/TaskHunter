import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import {
  buildClickScript,
  buildInspectScript,
  buildScrollScript,
  buildSnapshotScript,
  buildTypeScript,
} from './pageActions';

/**
 * These scripts are source text evaluated inside another page: nothing
 * type-checks them, and a value interpolated without escaping either breaks the
 * script or runs as code.
 */
const parses = (source: string): boolean => {
  try {
    new Function(source);
    return true;
  } catch {
    return false;
  }
};

const runInWindow = (win: Window, source: string): string => (
  JSON.stringify(new Function('window', 'document', 'navigator', 'CSS', 'location', `return ${source}`)(
    win,
    win.document,
    win.navigator,
    win.CSS,
    win.location,
  ))
);

describe('page action scripts', () => {
  test('every script parses', () => {
    expect(parses(buildSnapshotScript())).toBe(true);
    expect(parses(buildSnapshotScript({ selector: '#main' }))).toBe(true);
    expect(parses(buildClickScript({ selector: '#save' }))).toBe(true);
    expect(parses(buildClickScript({ text: 'Save' }))).toBe(true);
    expect(parses(buildTypeScript({ selector: '#q', value: 'hello', submit: true }))).toBe(true);
    expect(parses(buildInspectScript({ selector: '#save' }))).toBe(true);
    expect(parses(buildScrollScript({ direction: 'bottom' }))).toBe(true);
    expect(parses(buildScrollScript({ selector: 'footer' }))).toBe(true);
  });

  test('a hostile selector is embedded as data, not as code', () => {
    const hostile = `'); window.__owned = true; ('`;
    const script = buildClickScript({ selector: hostile });
    expect(parses(script)).toBe(true);
    // Present only inside a quoted literal: that is what makes it inert.
    expect(script).toContain(JSON.stringify(hostile));
  });

  test('a typed value is embedded as data too', () => {
    const value = '"); alert(1); ("';
    const script = buildTypeScript({ selector: '#q', value, submit: false });
    expect(parses(script)).toBe(true);
    expect(script).toContain(JSON.stringify(value));
  });

  test('whitespace regexes survive interpolation', () => {
    // A doubled backslash here would produce a literal backslash-s and match
    // nothing, silently collapsing no whitespace at all.
    expect(buildSnapshotScript()).toContain('replace(/\\s+/g');
  });

  test('scrolling asks for instant behaviour, not the page preference', () => {
    // A page with scroll-behavior: smooth would otherwise still be animating
    // when the position is read.
    expect(buildScrollScript({ direction: 'bottom' })).toContain("behavior: 'instant'");
    expect(buildScrollScript({ selector: 'footer' })).toContain("behavior: 'instant'");
  });

  test('scrolling answers on a page that gets no paint frames', async () => {
    // A background tab is not composited, so its requestAnimationFrame never
    // fires. Waiting on frames alone left the action hanging until it timed out.
    const win = new Window({ url: 'https://example.test/' });
    const noFrames = (): number => 0;
    const run = new Function(
      'window', 'document', 'location', 'CSS', 'requestAnimationFrame', 'setTimeout',
      `return ${buildScrollScript({ direction: 'down' })}`,
    );
    const answer = Promise.resolve(run(win, win.document, win.location, win.CSS, noFrames, setTimeout));
    const hung = new Promise((resolve) => setTimeout(() => resolve('hung'), 1_000));
    const result = await Promise.race([answer, hung]);
    expect(result).toMatchObject({ ok: true, direction: 'down' });
    await win.happyDOM.close();
  });

  test('a scoped snapshot reads only the subtree it was given', () => {
    const script = buildSnapshotScript({ selector: '#changelog' });
    expect(script).toContain('"#changelog"');
    expect(script).toContain('root.querySelectorAll');
  });

  test('a click opens a widget that listens for mousedown or focus', () => {
    // VueMultiselect and many custom selects open on the first half of a
    // click; a bare click event reported success while they stayed shut.
    const win = new Window({ url: 'http://localhost:3000/' });
    win.document.body.innerHTML = `
      <div id="by-mousedown"><span class="placeholder">Add a monitor</span></div>
      <div id="by-focus" tabindex="-1">Pick one</div>`;
    const opened: string[] = [];
    win.document.querySelector('#by-mousedown')?.addEventListener('mousedown', () => opened.push('mousedown'));
    win.document.querySelector('#by-focus')?.addEventListener('focus', () => opened.push('focus'));

    expect(runInWindow(win, buildClickScript({ selector: '#by-mousedown' }))).toContain('"ok":true');
    expect(runInWindow(win, buildClickScript({ selector: '#by-focus' }))).toContain('"ok":true');

    expect(opened).toEqual(['mousedown', 'focus']);
  });

  test('a click sends the sequence a mouse sends, once each', () => {
    const win = new Window({ url: 'http://localhost:3000/' });
    win.document.body.innerHTML = '<button id="save">Save</button>';
    const seen: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'focus', 'pointerup', 'mouseup', 'click']) {
      win.document.querySelector('#save')?.addEventListener(type, () => seen.push(type));
    }

    runInWindow(win, buildClickScript({ selector: '#save' }));

    expect(seen).toEqual(['pointerdown', 'mousedown', 'focus', 'pointerup', 'mouseup', 'click']);
  });

  test('a page that prevents mousedown keeps its focus where it was', () => {
    // Dropdown options do this so picking one does not blur the search field.
    const win = new Window({ url: 'http://localhost:3000/' });
    win.document.body.innerHTML = '<input id="search"><div id="option" tabindex="-1">Website</div>';
    const search = win.document.querySelector('input');
    search?.focus();
    win.document.querySelector('#option')?.addEventListener('mousedown', (event) => event.preventDefault());

    runInWindow(win, buildClickScript({ selector: '#option' }));

    expect(win.document.activeElement).toBe(search);
  });

  test('copies and pastes through the browser clipboard in one tab', async () => {
    const fixture = 'test_secret_not_real_123';
    let clipboard = '';
    const win = new Window({ url: 'http://localhost:3000/' });
    Object.defineProperty(win.navigator, 'clipboard', {
      value: {
        writeText: async (value: string) => { clipboard = value; },
        readText: async () => clipboard,
      },
    });
    win.document.body.innerHTML = '<button id="copy">Copy API key</button><button id="paste">Paste</button><input id="target">';
    win.document.querySelector('#copy')?.addEventListener('click', () => {
      void win.navigator.clipboard.writeText(fixture);
    });
    win.document.querySelector('#paste')?.addEventListener('click', () => {
      void win.navigator.clipboard.readText().then((value) => {
        const target = win.document.querySelector('input');
        if (target) target.value = value;
      });
    });

    const copyResult = runInWindow(win, buildClickScript({ selector: '#copy' }));
    runInWindow(win, buildClickScript({ selector: '#paste' }));
    await Promise.resolve();

    expect(win.document.querySelector('input')?.value).toBe(fixture);
    expect(copyResult).not.toContain(fixture);
  });

  test('copies in one tab and pastes in another without serializing the value', async () => {
    const fixture = 'test_secret_not_real_123';
    let clipboard = '';
    const source = new Window({ url: 'https://example.test/account' });
    const destination = new Window({ url: 'http://localhost:3000/' });
    Object.defineProperty(source.navigator, 'clipboard', {
      value: { writeText: async (value: string) => { clipboard = value; } },
    });
    Object.defineProperty(destination.navigator, 'clipboard', {
      value: { readText: async () => clipboard },
    });
    source.document.body.innerHTML = '<button id="copy">Copy API key</button>';
    destination.document.body.innerHTML = '<button id="paste">Paste</button><input id="target">';
    source.document.querySelector('#copy')?.addEventListener('click', () => {
      void source.navigator.clipboard.writeText(fixture);
    });
    destination.document.querySelector('#paste')?.addEventListener('click', () => {
      void destination.navigator.clipboard.readText().then((value) => {
        const target = destination.document.querySelector('input');
        if (target) target.value = value;
      });
    });

    const copyResult = runInWindow(source, buildClickScript({ selector: '#copy' }));
    const pasteResult = runInWindow(destination, buildClickScript({ selector: '#paste' }));
    await Promise.resolve();

    expect(destination.document.querySelector('input')?.value).toBe(fixture);
    expect(copyResult).not.toContain(fixture);
    expect(pasteResult).not.toContain(fixture);
    expect(runInWindow(destination, buildSnapshotScript())).not.toContain(fixture);
  });
});

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { fitToolbar } from './useDiffToolbarFit';

// The row's content width at each collapse step, as layout would report it.
const WIDTH = { full: 520, noWalkthroughLabel: 450, compact: 330 };

describe('fitToolbar', () => {
  let win: Window;
  let previousDocument: PropertyDescriptor | undefined;
  let toolbar: HTMLElement;
  let base: HTMLElement;
  let available: number;
  let baseClipped: (toolbar: HTMLElement) => boolean;

  beforeEach(() => {
    win = new Window();
    previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: win.document, configurable: true, writable: true });
    toolbar = document.createElement('div');
    base = document.createElement('span');
    base.className = 'truncate';
    toolbar.appendChild(base);
    baseClipped = () => false;
    Object.defineProperty(toolbar, 'clientWidth', { get: () => available });
    Object.defineProperty(toolbar, 'scrollWidth', {
      get: () => Math.max(available, toolbar.hasAttribute('data-diff-toolbar-compact') ? WIDTH.compact
        : toolbar.hasAttribute('data-diff-toolbar-compact-walkthrough') ? WIDTH.noWalkthroughLabel : WIDTH.full),
    });
    Object.defineProperty(base, 'clientWidth', { get: () => 80 });
    Object.defineProperty(base, 'scrollWidth', { get: () => (baseClipped(toolbar) ? 120 : 80) });
  });

  afterEach(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    void win.happyDOM.close();
  });

  const steps = () => ['data-diff-toolbar-compact-walkthrough', 'data-diff-toolbar-compact'].filter((step) => toolbar.hasAttribute(step));

  test('keeps every label while the row fits', () => {
    available = 600;
    fitToolbar(toolbar);
    expect(steps()).toEqual([]);
  });

  test('drops the walkthrough label first, then the rest, only as far as needed', () => {
    available = 480;
    fitToolbar(toolbar);
    expect(steps()).toEqual(['data-diff-toolbar-compact-walkthrough']);

    available = 400;
    fitToolbar(toolbar);
    expect(steps()).toEqual(['data-diff-toolbar-compact-walkthrough', 'data-diff-toolbar-compact']);

    available = 600;
    fitToolbar(toolbar);
    expect(steps()).toEqual([]);
  });

  test('collapses labels before a branch name is clipped', () => {
    available = 600;
    baseClipped = (row) => !row.hasAttribute('data-diff-toolbar-compact-walkthrough');
    fitToolbar(toolbar);
    expect(steps()).toEqual(['data-diff-toolbar-compact-walkthrough']);
  });
});

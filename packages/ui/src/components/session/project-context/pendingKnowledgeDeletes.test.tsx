import { afterAll, expect, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { Toaster } from 'sonner';

const browser = new Window({ url: 'http://runtime.test' });
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  Element: browser.Element,
  Node: browser.Node,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  matchMedia: browser.matchMedia.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const { createRoot } = await import('react-dom/client');
const { scheduleKnowledgeDelete, usePendingKnowledgeDeletes } = await import('./pendingKnowledgeDeletes');

afterAll(async () => {
  await browser.happyDOM.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const UNDO_WINDOW_MS = 20;
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

let pending: ReadonlySet<string> = new Set();
const Probe = () => {
  pending = usePendingKnowledgeDeletes();
  return null;
};
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
await act(async () => root.render(<><Probe /><Toaster /></>));

const clickUndo = async () => {
  await wait(0);
  const undo = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Undo');
  if (!undo) throw new Error('Undo button missing');
  await act(async () => undo.click());
};

test('the entry hides at once and Undo keeps the delete from being sent', async () => {
  let runs = 0;
  act(() => scheduleKnowledgeDelete({
    key: 'note:p:1', message: 'Note deleted', undoLabel: 'Undo', undoWindowMs: UNDO_WINDOW_MS,
    run: async () => { runs += 1; return true; },
    onFailure: () => { throw new Error('unexpected failure'); },
  }));
  expect(pending.has('note:p:1')).toBe(true);

  await clickUndo();
  expect(pending.has('note:p:1')).toBe(false);
  await wait(UNDO_WINDOW_MS * 3);
  expect(runs).toBe(0);
});

test('without Undo the delete is sent and the entry stays hidden until it settles', async () => {
  let release: (ok: boolean) => void = () => {};
  act(() => scheduleKnowledgeDelete({
    key: 'plan:p:2', message: 'Plan deleted', undoLabel: 'Undo', undoWindowMs: UNDO_WINDOW_MS,
    run: () => new Promise<boolean>((resolve) => { release = resolve; }),
    onFailure: () => { throw new Error('unexpected failure'); },
  }));
  await wait(UNDO_WINDOW_MS * 2);
  expect(pending.has('plan:p:2')).toBe(true);

  await act(async () => { release(true); });
  expect(pending.has('plan:p:2')).toBe(false);
});

test('a failed delete brings the entry back and reports it', async () => {
  let failures = 0;
  act(() => scheduleKnowledgeDelete({
    key: 'memory:project:3', message: 'Memory forgotten', undoLabel: 'Undo', undoWindowMs: UNDO_WINDOW_MS,
    run: async () => false,
    onFailure: () => { failures += 1; },
  }));
  await wait(UNDO_WINDOW_MS * 2);
  expect(pending.has('memory:project:3')).toBe(false);
  expect(failures).toBe(1);
});

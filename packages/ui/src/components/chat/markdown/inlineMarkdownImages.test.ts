import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ToolPopupContent } from '../message/types';
import { attachInlineMarkdownImages } from './inlineMarkdownImages';

const win = new Window({ url: 'https://openchamber.test/' });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  Element: win.Element,
  HTMLElement: win.HTMLElement,
  MutationObserver: win.MutationObserver,
  IntersectionObserver: undefined,
});
// happy-dom never decodes pixels; a resolved decode stands for a loaded picture.
win.HTMLImageElement.prototype.decode = async () => {};

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
// Declared as JPEG, but the bytes are a PNG: validation rejects it.
const MISLABELED = PNG.replace('image/png', 'image/jpeg');

const label = (source: string, name: string): string => (
  `<span class="inline-flex" data-openchamber-markdown-image-label="true" data-openchamber-markdown-image-source="${source}">${name}</span>`
);

const settle = async () => {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const mount = (html: string) => {
  const message = document.createElement('div');
  message.setAttribute('data-message-id', 'msg_1');
  const container = document.createElement('div');
  container.innerHTML = `<div data-markdown-content>${html}</div>`;
  message.appendChild(container);
  document.body.appendChild(message);
  const popups: ToolPopupContent[] = [];
  const detach = attachInlineMarkdownImages({
    container,
    sessionId: 'ses_1',
    messageId: 'msg_1',
    directory: '/workspace',
    apiBaseUrl: '',
    useWorkspaceFsBridge: false,
    onShowPopup: (content) => popups.push(content),
  });
  return { container, popups, detach };
};

describe('inline assistant images', () => {
  test('draws each image in place of its label and opens the message gallery', async () => {
    const { container, popups, detach } = mount(
      `<p>Before</p><p>${label(PNG, 'first.png')}</p><p>Then ${label(PNG, 'second.png')} after</p>`,
    );
    await settle();

    const buttons = container.querySelectorAll<HTMLElement>('[data-openchamber-markdown-inline-image]');
    expect(buttons).toHaveLength(2);
    expect(container.textContent).not.toContain('first.png');
    expect(buttons[1]?.querySelector('img')?.getAttribute('alt')).toBe('second.png');
    expect(container.textContent).toContain('Then');

    buttons[1]?.click();
    await settle();
    expect(popups).toHaveLength(1);
    expect(popups[0]?.image?.index).toBe(1);
    expect(popups[0]?.image?.gallery?.map((item) => item.filename)).toEqual(['first.png', 'second.png']);
    detach();
  });

  test('lines up a paragraph of images at one height and leaves mixed paragraphs alone', async () => {
    // happy-dom has no pixels: each test image reports a size by its name.
    const sizes = new Map([['wide.png', { width: 400, height: 100 }], ['tall.png', { width: 100, height: 200 }]]);
    Object.defineProperty(win.HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get() { return sizes.get(this.alt)?.width ?? 0; } });
    Object.defineProperty(win.HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get() { return sizes.get(this.alt)?.height ?? 0; } });
    const { container, detach } = mount(
      `<p>${label(PNG, 'wide.png')} ${label(PNG, 'tall.png')}</p><p>Text ${label(PNG, 'wide.png')} ${label(PNG, 'tall.png')}</p>`,
    );
    await settle();

    const [row, mixed] = Array.from(container.querySelectorAll<HTMLElement>('p'));
    expect(row?.style.display).toBe('flex');
    // Shared height capped by the smaller natural height, 100px, times the ratios 4 + 0.5.
    expect(row?.style.maxWidth).toBe('calc(min(30rem, 100px) * 4.5 + 0.5rem)');
    const items = Array.from(row?.querySelectorAll<HTMLElement>('[data-openchamber-markdown-image-source]') ?? []);
    expect(items.map((item) => item.style.flex)).toEqual(['4 1 0px', '0.5 1 0px']);
    expect(mixed?.style.display).toBe('');
    detach();
  });

  test('keeps the label of an image that cannot load', async () => {
    const { container, detach } = mount(`<p>${label(MISLABELED, 'broken.jpg')}</p>`);
    await settle();

    expect(container.querySelector('[data-openchamber-markdown-inline-image]')).toBeNull();
    expect(container.textContent).toContain('broken.jpg');
    detach();
  });

  test('opens the preview of a drawn image restored into a new mount', async () => {
    const first = mount(`<p>${label(PNG, 'first.png')}</p>`);
    await settle();
    first.detach();
    const content = first.container.querySelector('[data-markdown-content]');
    if (!content) throw new Error('missing content');

    const second = mount('');
    second.container.querySelector('[data-markdown-content]')?.replaceWith(content);
    await new Promise((resolve) => setTimeout(resolve, 50));
    second.container.querySelector<HTMLElement>('[data-openchamber-markdown-inline-image]')?.click();
    await settle();

    expect(second.popups[0]?.image?.filename).toBe('first.png');
    second.detach();
  });

  test('draws a label again after Markdown re-renders its block', async () => {
    const { container, detach } = mount(`<p>${label(PNG, 'first.png')}</p>`);
    await settle();
    const content = container.querySelector('[data-markdown-content]');
    if (!content) throw new Error('missing content');
    content.innerHTML = `<p>${label(PNG, 'first.png')}</p>`;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settle();

    expect(container.querySelectorAll('[data-openchamber-markdown-inline-image]')).toHaveLength(1);
    detach();
  });
});

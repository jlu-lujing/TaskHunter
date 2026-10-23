import { refreshRuntimeUrlAuthToken } from '@/lib/runtime-auth';
import type { ToolPopupContent } from '../message/types';
import {
  getPreparedMarkdownImageUrl,
  isLocalMarkdownImageSource,
  prepareLocalMarkdownImages,
  resolveMarkdownImageSource,
  resolveWorkspaceMarkdownImageSource,
  type PreparedMarkdownImage,
} from './markdownImageAssets';
import { claimVideoRetry, isVideoSource, LOCAL_VIDEO_ATTR, swapVideoSource } from './markdownVideo';

// Assistant Markdown renders an image as its file name (markdownCore's
// `label` mode). Once the text part settles, each local or embedded image
// label is replaced in place by the picture itself, and a click opens the
// shared preview with every picture of the message. A local clip becomes a
// player in place and stays out of the preview. A label whose image cannot
// load stays as it is. Remote images never reach this module: they are links,
// so nothing loads before the user asks for it.

const LABEL_SELECTOR = '[data-openchamber-markdown-image-source]';
const INLINE_IMAGE_ATTR = 'data-openchamber-markdown-inline-image';
const INLINE_IMAGE_SELECTOR = `[${INLINE_IMAGE_ATTR}]`;
const MESSAGE_SELECTOR = '[data-message-id]';
// The grant route prepares at most this many images per request.
const MAX_MARKDOWN_IMAGE_COUNT = 12;

const READY_LABEL_CLASS = 'inline-block max-w-[min(100%,30rem)] align-top my-1 me-1';
const BUTTON_CLASS = 'block max-w-full cursor-zoom-in overflow-hidden rounded-lg border border-border/40 bg-muted/10 outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]';
const IMAGE_CLASS = 'block h-auto max-h-[30rem] w-auto max-w-full object-contain';

type InlineImage = {
  filename: string;
  /** A fresh URL for the preview; a prepared file's grant may have expired since the picture loaded. */
  resolveUrl: () => Promise<string>;
};

// Keyed by the drawn button, which moves with the DOM into the detached
// Markdown cache and back, so a restored message still opens its preview.
const inlineImages = new WeakMap<HTMLElement, InlineImage>();
// A clip's label as the renderer styled it, to fall back to.
const labelClasses = new WeakMap<HTMLElement, string>();

type InlineMarkdownImageOptions = {
  container: HTMLElement;
  sessionId: string;
  messageId: string;
  directory: string;
  apiBaseUrl: string;
  /** VS Code reads workspace images through its filesystem bridge instead of the grant route. */
  useWorkspaceFsBridge: boolean;
  onShowPopup: (content: ToolPopupContent) => void;
};

const labelSource = (label: HTMLElement): string => label.getAttribute('data-openchamber-markdown-image-source') ?? '';
const labelFilename = (label: HTMLElement): string => label.textContent?.trim() || 'image';

const collectSources = (container: HTMLElement): string[] => {
  const sources: string[] = [];
  for (const label of Array.from(container.querySelectorAll<HTMLElement>(LABEL_SELECTOR))) {
    const source = labelSource(label);
    if (source && !sources.includes(source)) sources.push(source);
    if (sources.length >= MAX_MARKDOWN_IMAGE_COUNT) break;
  }
  return sources;
};

const decodeImage = async (url: string, filename: string): Promise<HTMLImageElement> => {
  const image = document.createElement('img');
  image.alt = filename;
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.draggable = false;
  image.className = IMAGE_CLASS;
  image.src = url;
  await image.decode();
  return image;
};

// A clip draws once the browser knows its size, so a file it cannot play
// keeps its label.
const loadVideo = (url: string, filename: string, signal: AbortSignal): Promise<HTMLVideoElement> => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  video.controls = true;
  video.preload = 'metadata';
  video.playsInline = true;
  video.title = filename;
  video.setAttribute(LOCAL_VIDEO_ATTR, 'true');
  const settle = () => {
    video.removeEventListener('loadedmetadata', onReady);
    video.removeEventListener('error', onError);
    signal.removeEventListener('abort', onError);
  };
  const onReady = () => {
    settle();
    resolve(video);
  };
  const onError = () => {
    settle();
    video.removeAttribute('src');
    reject(new Error('Video is not available'));
  };
  video.addEventListener('loadedmetadata', onReady);
  video.addEventListener('error', onError);
  signal.addEventListener('abort', onError);
  video.src = url;
});

const drawImage = (label: HTMLElement, image: HTMLImageElement, entry: InlineImage): void => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.setAttribute(INLINE_IMAGE_ATTR, 'true');
  button.setAttribute('aria-label', entry.filename);
  button.appendChild(image);
  inlineImages.set(button, entry);
  label.className = READY_LABEL_CLASS;
  label.replaceChildren(button);
};

// Below this shared height a row of images wraps onto more lines.
const IMAGE_ROW_MIN_HEIGHT_REM = 8;
const IMAGE_ROW_GAP_REM = 0.5;

const drawnImageOf = (label: HTMLElement): HTMLImageElement | null => (
  label.querySelector<HTMLElement>(INLINE_IMAGE_SELECTOR)?.querySelector('img') ?? null
);

/**
 * A paragraph made only of two or more drawn images becomes one row in which
 * every image has the same height and the row spans the text width. Each
 * image grows in proportion to its width-to-height ratio, which is what keeps
 * the heights equal. The row stops widening once the shared height would pass
 * 30rem or the natural height of its smallest image, so nothing is upscaled.
 * Until every image of the paragraph is drawn, or when one cannot load, the
 * images stay side by side at their own sizes.
 */
const arrangeImageRow = (paragraph: Element | null): void => {
  if (!(paragraph instanceof HTMLElement) || paragraph.tagName !== 'P') return;
  const labels: HTMLElement[] = [];
  for (const node of Array.from(paragraph.childNodes)) {
    if (node.nodeType === 3 && !node.textContent?.trim()) continue;
    if (!(node instanceof HTMLElement) || !node.matches(LABEL_SELECTOR)) return;
    labels.push(node);
  }
  if (labels.length < 2) return;
  const images = labels.map(drawnImageOf);
  const sizes = images.map((image) => (image && image.naturalWidth > 0 && image.naturalHeight > 0
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : null));
  if (sizes.some((size) => size === null)) return;
  const known = sizes.filter((size): size is { width: number; height: number } => size !== null);
  const ratios = known.map(({ width, height }) => width / height);
  const ratioSum = ratios.reduce((total, ratio) => total + ratio, 0);
  const smallestHeight = Math.min(...known.map(({ height }) => height));
  const gaps = (labels.length - 1) * IMAGE_ROW_GAP_REM;

  paragraph.setAttribute('data-openchamber-markdown-image-row', 'true');
  Object.assign(paragraph.style, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: `${IMAGE_ROW_GAP_REM}rem`,
    maxWidth: `calc(min(30rem, ${smallestHeight}px) * ${ratioSum} + ${gaps}rem)`,
  });
  labels.forEach((label, index) => {
    const ratio = ratios[index] ?? 1;
    const size = known[index];
    Object.assign(label.style, {
      flex: `${ratio} 1 0px`,
      minWidth: `${IMAGE_ROW_MIN_HEIGHT_REM * ratio}rem`,
      maxWidth: `min(${size?.width ?? 0}px, ${30 * ratio}rem)`,
      margin: '0',
    });
    const image = images[index];
    if (image) image.style.width = '100%';
  });
};

/** Draws the settled message's images in place of their labels; returns the cleanup. */
export const attachInlineMarkdownImages = (options: InlineMarkdownImageOptions): (() => void) => {
  const { container, sessionId, messageId, directory, apiBaseUrl, useWorkspaceFsBridge, onShowPopup } = options;
  const controller = new AbortController();
  const { signal } = controller;
  const pending = new WeakSet<HTMLElement>();
  const failedSources = new Set<string>();
  let preparation: { sources: string; result: Promise<Map<string, PreparedMarkdownImage>> } | null = null;

  // One grant request covers every local image of the part. It is repeated
  // only when the part's image list changed or the cached grants expired
  // (prepareLocalMarkdownImages caches until then).
  const prepare = (refresh: boolean): Promise<Map<string, PreparedMarkdownImage>> => {
    const sources = collectSources(container).filter(isLocalMarkdownImageSource);
    const key = sources.join('\0');
    if (!preparation || preparation.sources !== key || refresh) {
      preparation = {
        sources: key,
        result: prepareLocalMarkdownImages({ sources, directory, sessionId, messageId, signal }),
      };
    }
    return preparation.result;
  };

  const resolveUrl = async (source: string, refresh: boolean): Promise<string> => {
    if (!isLocalMarkdownImageSource(source)) return resolveMarkdownImageSource(source, signal);
    if (useWorkspaceFsBridge) return resolveWorkspaceMarkdownImageSource(source, directory, signal);
    const prepared = (await prepare(refresh)).get(source);
    if (prepared?.status !== 'ready') throw new Error('Image is not available');
    // The asset URL carries the URL auth token, which has to exist first.
    await refreshRuntimeUrlAuthToken(apiBaseUrl);
    return getPreparedMarkdownImageUrl(prepared, directory);
  };

  const load = async (label: HTMLElement): Promise<void> => {
    const source = labelSource(label);
    const filename = labelFilename(label);
    pending.add(label);
    try {
      if (isVideoSource(source)) {
        // VS Code reads workspace files whole through its bridge, which a clip
        // must not go through; there it stays its file name.
        if (useWorkspaceFsBridge) throw new Error('Video is not available');
        const video = await loadVideo(await resolveUrl(source, false), filename, signal);
        if (signal.aborted || !label.isConnected || labelSource(label) !== source) return;
        labelClasses.set(label, label.className);
        label.className = READY_LABEL_CLASS;
        label.replaceChildren(video);
        return;
      }
      const image = await decodeImage(await resolveUrl(source, false), filename);
      if (signal.aborted || !label.isConnected || labelSource(label) !== source) return;
      drawImage(label, image, { filename, resolveUrl: () => resolveUrl(source, true) });
      arrangeImageRow(label.parentElement);
    } catch {
      if (!signal.aborted) failedSources.add(source);
    } finally {
      pending.delete(label);
    }
  };

  // A drawn clip reads its file again on every play and seek, after its grant
  // or URL token may have expired: it gets a fresh address and goes on, and
  // turns back into its file name when the file is gone.
  const handleVideoError = (event: Event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.hasAttribute(LOCAL_VIDEO_ATTR)) return;
    const label = video.closest<HTMLElement>(LABEL_SELECTOR);
    if (!label || !container.contains(label)) return;
    const source = labelSource(label);
    const restore = () => {
      failedSources.add(source);
      label.className = labelClasses.get(label) ?? '';
      label.textContent = video.title || source;
    };
    if (!claimVideoRetry(video)) {
      restore();
      return;
    }
    void resolveUrl(source, true).then((url) => {
      if (video.isConnected) swapVideoSource(video, url);
    }, () => {
      if (!signal.aborted && video.isConnected) restore();
    });
  };
  container.addEventListener('error', handleVideoError, true);

  const visibility = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
        visibility?.unobserve(entry.target);
        void load(entry.target);
      }
    }, { rootMargin: '200px' });

  // A label loads once it nears the viewport, so opening a long history reads
  // no image files. Labels come back when Markdown re-renders a block, and
  // morphdom may reset a drawn one to its label; both are picked up here.
  const scan = () => {
    const sources = new Set<string>();
    for (const label of Array.from(container.querySelectorAll<HTMLElement>(LABEL_SELECTOR))) {
      const source = labelSource(label);
      sources.add(source);
      if (sources.size > MAX_MARKDOWN_IMAGE_COUNT) break;
      if (label.querySelector(`[${LOCAL_VIDEO_ATTR}]`)) continue;
      const drawn = label.querySelector<HTMLElement>(INLINE_IMAGE_SELECTOR);
      if (drawn) {
        // Drawn by an earlier mount and restored from the detached DOM cache:
        // the preview resolves through this mount from now on.
        const filename = inlineImages.get(drawn)?.filename ?? drawn.getAttribute('aria-label') ?? 'image';
        inlineImages.set(drawn, { filename, resolveUrl: () => resolveUrl(source, true) });
        arrangeImageRow(label.parentElement);
        continue;
      }
      if (!source || failedSources.has(source) || pending.has(label) || label.closest('a')) continue;
      if (visibility) {
        pending.add(label);
        visibility.observe(label);
      } else {
        void load(label);
      }
    }
  };

  let scanFrame: number | null = null;
  const scheduleScan = () => {
    if (scanFrame !== null) return;
    scanFrame = window.requestAnimationFrame(() => {
      scanFrame = null;
      if (!signal.aborted) scan();
    });
  };
  const mutations = new MutationObserver(scheduleScan);
  mutations.observe(container, { childList: true, subtree: true });

  const openPreview = async (button: HTMLElement): Promise<void> => {
    const scope = container.closest(MESSAGE_SELECTOR) ?? container;
    const drawn = Array.from(scope.querySelectorAll<HTMLElement>(INLINE_IMAGE_SELECTOR)).flatMap((candidate) => {
      const entry = inlineImages.get(candidate);
      return entry ? [{ button: candidate, entry }] : [];
    });
    if (!drawn.some((item) => item.button === button)) return;
    const settled = await Promise.allSettled(drawn.map(({ entry }) => entry.resolveUrl()));
    if (signal.aborted) return;
    const gallery = drawn.flatMap(({ button: candidate, entry }, position) => {
      const result = settled[position];
      if (result?.status !== 'fulfilled') return [];
      return [{ url: result.value, filename: entry.filename, button: candidate }];
    });
    const current = gallery.findIndex((item) => item.button === button);
    const selected = gallery[current];
    if (!selected) return;
    onShowPopup({
      open: true,
      title: selected.filename,
      content: '',
      metadata: { tool: 'markdown-image-preview', filename: selected.filename },
      image: {
        url: selected.url,
        filename: selected.filename,
        gallery: gallery.map(({ url, filename }) => ({ url, filename })),
        index: current,
      },
    });
  };

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(INLINE_IMAGE_SELECTOR);
    if (!button || !container.contains(button)) return;
    event.preventDefault();
    void openPreview(button);
  };
  container.addEventListener('click', handleClick);

  scan();

  return () => {
    controller.abort();
    if (scanFrame !== null) window.cancelAnimationFrame(scanFrame);
    mutations.disconnect();
    visibility?.disconnect();
    container.removeEventListener('click', handleClick);
    container.removeEventListener('error', handleVideoError, true);
  };
};

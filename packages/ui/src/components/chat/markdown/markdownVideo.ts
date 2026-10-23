// Video in Markdown. Nobody writes a `<video>` by hand: Linear stores an
// uploaded clip as an image whose alt text is the file name, GitHub as its
// bare asset URL on a line of its own, and an agent as an image pointing at
// the file it recorded. Each is recognised here and drawn as a player.

import { refreshRuntimeUrlAuthToken } from '@/lib/runtime-auth';

const VIDEO_FILE_RE = /\.(?:mp4|m4v|mov|webm)$/i;
// The query parameter the runtime signs asset URLs with (runtime-url.ts).
const URL_TOKEN_PARAM = 'oc_url_token';
// GitHub writes an uploaded picture as markup and a clip as this bare URL.
const GITHUB_ASSET_RE = /^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/i;

/** The file name of a path or URL, without its query or fragment. */
const mediaFileName = (source: string): string => {
  const path = source.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? '';
  const encoded = path.split('/').filter(Boolean).at(-1) ?? '';
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
};

const isVideoFileName = (name: string): boolean => VIDEO_FILE_RE.test(name.trim());

/** A source, or the name it was given, that names a video file. */
export const isVideoSource = (source: string, name = ''): boolean => (
  isVideoFileName(name) || isVideoFileName(mediaFileName(source))
);

/** A bare URL that stands for a clip when it is alone on its line. */
export const isBareVideoUrl = (url: string): boolean => (
  /^https?:\/\//i.test(url) && (GITHUB_ASSET_RE.test(url) || isVideoSource(url))
);

/** Marks a player drawn for a file on this machine. */
export const LOCAL_VIDEO_ATTR = 'data-openchamber-markdown-local-video';

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `metadata` reads the first frame and the length right away; `none` reads
 * nothing until the user presses play, for a server the user did not choose.
 */
export const renderMarkdownVideo = (
  { href, title }: { href: string; title?: string | null },
  preload: 'metadata' | 'none',
): string => {
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
  return `<video src="${escapeAttr(href)}"${titleAttr} controls preload="${preload}" playsinline></video>`;
};

// A player reads its source again on every play and seek, long after it was
// drawn, while a URL token lives a minute and a file grant ten. A failure is
// therefore retried with a fresh address, at most this often per player.
const RETRY_INTERVAL_MS = 10_000;
const lastRetry = new WeakMap<HTMLVideoElement, number>();

/** Whether the player may try a fresh address now; records the try. */
export const claimVideoRetry = (video: HTMLVideoElement): boolean => {
  const now = Date.now();
  if (now - (lastRetry.get(video) ?? 0) < RETRY_INTERVAL_MS) return false;
  lastRetry.set(video, now);
  return true;
};

/** Points the player at a fresh address and goes on where it was. */
export const swapVideoSource = (video: HTMLVideoElement, url: string): void => {
  const time = video.currentTime;
  const playing = !video.paused;
  video.addEventListener('loadedmetadata', () => {
    video.currentTime = time;
    if (playing) void video.play().catch(() => undefined);
  }, { once: true });
  video.src = url;
};

const hasUrlToken = (source: string): boolean => {
  try {
    return new URL(source).searchParams.has(URL_TOKEN_PARAM);
  } catch {
    return false;
  }
};

/**
 * What stands in for a clip that cannot load: a link to it, so it still opens
 * elsewhere, or its name alone when the address is this app's own and carries
 * a token that must not be opened, shown or copied.
 */
const replaceWithFallback = (video: HTMLVideoElement, source: string): void => {
  const name = video.title || mediaFileName(source) || source;
  if (!/^https?:\/\//i.test(source) || hasUrlToken(source)) {
    video.replaceWith(document.createTextNode(name));
    return;
  }
  const link = document.createElement('a');
  link.href = source;
  link.className = 'external-link';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = name;
  video.replaceWith(link);
};

/**
 * A clip the browser cannot load (a private repository, an expired link, a
 * format it does not play) becomes its fallback; one whose URL token expired
 * first tries a fresh one. Media errors do not bubble, hence the capture
 * listener.
 */
export const attachMarkdownVideoFallback = (container: HTMLElement): (() => void) => {
  const handleError = (event: Event) => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !container.contains(video)) return;
    // A clip from this machine has its own recovery (inlineMarkdownImages.ts).
    if (video.hasAttribute(LOCAL_VIDEO_ATTR)) return;
    const source = video.getAttribute('src') ?? '';
    if (!hasUrlToken(source) || !claimVideoRetry(video)) {
      replaceWithFallback(video, source);
      return;
    }
    void refreshRuntimeUrlAuthToken().then((token) => {
      const url = new URL(source);
      url.searchParams.set(URL_TOKEN_PARAM, token);
      if (video.isConnected) swapVideoSource(video, url.toString());
    }, () => {
      if (video.isConnected) replaceWithFallback(video, source);
    });
  };
  container.addEventListener('error', handleError, true);
  return () => container.removeEventListener('error', handleError, true);
};

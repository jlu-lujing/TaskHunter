import { afterEach, describe, expect, test } from 'bun:test';

import type { DesktopHost } from './desktopHosts';
import { getLocalDesktopOrigin, withLocalDesktopHost } from './desktopCurrentHost';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

type PageWindow = {
  location: { origin: string; href: string };
  __OPENCHAMBER_LOCAL_ORIGIN__?: string;
};

const showPage = (page: { origin: string; injectedLocalOrigin?: string }): void => {
  const value: PageWindow = { location: { origin: page.origin, href: `${page.origin}/` } };
  if (page.injectedLocalOrigin !== undefined) value.__OPENCHAMBER_LOCAL_ORIGIN__ = page.injectedLocalOrigin;
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
};

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

const remote: DesktopHost = { id: 'remote', label: 'Remote', url: 'http://192.168.1.20:3000' };

describe('Local in the desktop instance list', () => {
  // #4410 and #4632: Local used to take the page's own origin, which named the
  // packaged UI scheme, or the instance whose page the window was showing.
  test('is left out when the shell reported no local origin', () => {
    for (const page of [
      // OPENCHAMBER_SKIP_LOCAL_SERVER=1: the shell injects an empty origin.
      { origin: 'openchamber-ui://app', injectedLocalOrigin: '' },
      // A page another instance served, before the shell's init script ran.
      { origin: 'http://192.168.1.20:3000' },
    ]) {
      showPage(page);
      expect(withLocalDesktopHost([remote], getLocalDesktopOrigin())).toEqual([remote]);
    }
    // The hosts config answers null for a shell without a local server.
    expect(withLocalDesktopHost([remote], null)).toEqual([remote]);
  });

  test('comes first with the origin the shell reported', () => {
    showPage({ origin: 'http://192.168.1.20:3000', injectedLocalOrigin: 'http://127.0.0.1:57123' });
    expect(withLocalDesktopHost([remote], getLocalDesktopOrigin())).toEqual([
      { id: 'local', label: 'Local', url: 'http://127.0.0.1:57123' },
      remote,
    ]);
  });
});

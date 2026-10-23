import { describe, expect, test } from 'bun:test';

import { isAndroidBeforeEdgeToEdge } from './mobileNativeChrome';

const webViewUserAgent = (android: string) =>
  `Mozilla/5.0 (Linux; Android ${android}; moto g13 Build/T1TGS33.93; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36`;

describe('isAndroidBeforeEdgeToEdge', () => {
  test('Android 14 and older lay the WebView out below the status bar', () => {
    expect(isAndroidBeforeEdgeToEdge(webViewUserAgent('13'))).toBe(true);
    expect(isAndroidBeforeEdgeToEdge(webViewUserAgent('14'))).toBe(true);
    expect(isAndroidBeforeEdgeToEdge(webViewUserAgent('7.1.2'))).toBe(true);
  });

  test('Android 15 and newer draw edge to edge', () => {
    expect(isAndroidBeforeEdgeToEdge(webViewUserAgent('15'))).toBe(false);
    expect(isAndroidBeforeEdgeToEdge(webViewUserAgent('16'))).toBe(false);
  });

  test('a user agent without an Android version keeps the injected insets', () => {
    expect(isAndroidBeforeEdgeToEdge('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe(false);
  });
});

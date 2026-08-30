import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process to prevent real spawnSync calls that would hang in tests
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '/usr/local/bin', stderr: '' })),
}));

const {
  checkForUpdates,
  detectPackageManager,
  executeUpdate,
  getCurrentVersion,
} = await import('./package-manager.js');

/** Helper: create a fetch mock that routes by URL pattern */
function createFetchMock() {
  const handlers = new Map();

  const mock = vi.fn((url, options) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    for (const [pattern, response] of handlers) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve(response);
      }
    }

    return Promise.reject(new Error(`Unexpected fetch call: ${urlStr}`));
  });

  mock.when = (pattern, response) => {
    handlers.set(pattern, response);
    return mock;
  };

  return mock;
}

describe('checkForUpdates', () => {
  let fetchMock;
  let originalFetch;
  let originalUpdateApiUrl;

  beforeEach(() => {
    fetchMock = createFetchMock();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    originalUpdateApiUrl = process.env.TASKHUNTER_UPDATE_API_URL;
    process.env.TASKHUNTER_UPDATE_API_URL = 'https://update.taskhunter.test/v1/update/check';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUpdateApiUrl === undefined) delete process.env.TASKHUNTER_UPDATE_API_URL;
    else process.env.TASKHUNTER_UPDATE_API_URL = originalUpdateApiUrl;
  });

  // --- Scenario: update API confirms a newer version ---

  it('returns available=true when the update API reports a newer version', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.10.0',
          updateAvailable: true,
          releaseNotes: '## [1.10.0] - 2026-05-01\n\n- Great new feature',
        }),
      })
      .when('raw.githubusercontent.com', {
        ok: true,
        text: async () => '## [1.10.0] - 2026-05-01\n\n- Great new feature',
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.10.0');
    expect(result.currentVersion).toBe('1.9.10');
  });

  // --- Scenario: configured update API is authoritative (no npm cross-check) ---

  it('trusts the update API verdict without consulting the npm registry', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.10.0',
          updateAvailable: true,
          releaseNotes: '## [1.10.0] - 2026-05-01\n\n- Great new feature',
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    const requestedHosts = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedHosts.every((url) => !url.includes('registry.npmjs.org'))).toBe(true);
  });

  it('returns available=false when the update API reports no update', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.9.10',
          updateAvailable: false,
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
  });

  it('reports up-to-date without any fetch when no update API URL is configured', async () => {
    delete process.env.TASKHUNTER_UPDATE_API_URL;

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns available=false when npm only has a prerelease of the current version', async () => {
    fetchMock
      .when('update.taskhunter.test', Promise.reject(new Error('Network error')))
      .when('registry.npmjs.org', {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.10.0-beta.1' },
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.10.0' });

    expect(result.available).toBe(false);
  });

  it('accepts electron desktop update claims without npm cross-checking', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.10.0',
          updateAvailable: true,
          releaseNotes: '## [1.10.0] - 2026-05-01\n\n- Great new feature',
        }),
      });

    const result = await checkForUpdates({
      appType: 'desktop-electron',
      currentVersion: '1.9.10',
      installId: '4f4dfead-9688-4c4f-97d7-4607fbbfc3ab',
      platform: 'windows',
      arch: 'arm64',
    });

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.10.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      installId: '4f4dfead-9688-4c4f-97d7-4607fbbfc3ab',
      platform: 'windows',
      arch: 'arm64',
    });
  });

  it('resolves an Android APK asset when the update API returns an AAB', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.10.0',
          updateAvailable: true,
          downloadUrl: 'https://github.com/jlu-lujing/TaskHunter/releases/download/v1.10.0/TaskHunter-1.10.0-42-android.aab',
        }),
      })
      .when('api.github.com/repos/jlu-lujing/TaskHunter/releases/tags/v1.10.0', {
        ok: true,
        json: async () => ({
          assets: [
            {
              name: 'TaskHunter-1.10.0-42-android.aab',
              browser_download_url: 'https://downloads.example/TaskHunter-1.10.0-42-android.aab',
            },
            {
              name: 'app-release.apk',
              browser_download_url: 'https://downloads.example/app-release.apk',
            },
            {
              name: 'TaskHunter-1.10.0-42-android.apk',
              browser_download_url: 'https://downloads.example/TaskHunter-1.10.0-42-android.apk',
            },
          ],
        }),
      });

    const result = await checkForUpdates({
      appType: 'mobile-capacitor',
      platform: 'android',
      currentVersion: '1.9.10',
    });

    expect(result.downloadUrl).toBe('https://downloads.example/TaskHunter-1.10.0-42-android.apk');
  });

  it('keeps a direct Android APK URL from the update API', async () => {
    const apkUrl = 'https://github.com/jlu-lujing/TaskHunter/releases/download/v1.10.0/TaskHunter-1.10.0-42-android.apk';
    fetchMock.when('update.taskhunter.test', {
      ok: true,
      json: async () => ({
        latestVersion: '1.10.0',
        updateAvailable: true,
        downloadUrl: apkUrl,
      }),
    });

    const result = await checkForUpdates({
      appType: 'mobile-capacitor',
      platform: 'android',
      currentVersion: '1.9.10',
    });

    expect(result.downloadUrl).toBe(apkUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports update available even when the npm registry is behind', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: true,
        json: async () => ({
          latestVersion: '1.10.0',
          updateAvailable: true,
          releaseNotes: '## [1.10.0] - 2026-05-01\n\n- Great new feature',
        }),
      })
      .when('registry.npmjs.org', {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.9.9' },
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
  });

  // --- Scenario: API says no update, npm agrees ---

  it('returns available=false when API says no update and versions match', async () => {
    fetchMock.when('update.taskhunter.test', {
      ok: true,
      json: async () => ({
        latestVersion: '1.9.10',
        updateAvailable: false,
      }),
    });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
  });

  // --- Scenario: API unreachable, npm fallback ---

  it('returns available=true from npm fallback when API is unreachable and npm has newer version', async () => {
    fetchMock
      .when('update.taskhunter.test', Promise.reject(new Error('Network error')))
      .when('registry.npmjs.org', {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.10.0' },
        }),
      })
      .when('raw.githubusercontent.com', {
        ok: true,
        text: async () => '## [1.10.0] - 2026-05-01\n\n- Great new feature',
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.10.0');
  });

  it('returns available=false from npm fallback when API is unreachable and versions match', async () => {
    fetchMock
      .when('update.taskhunter.test', Promise.reject(new Error('Network error')))
      .when('registry.npmjs.org', {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.9.10' },
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
  });

  // --- Scenario: API returns null (bad response), npm fallback ---

  it('returns available=false when API returns non-ok status and versions match on npm', async () => {
    fetchMock
      .when('update.taskhunter.test', {
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      .when('registry.npmjs.org', {
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.9.10' },
        }),
      });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
  });

  // --- Scenario: Both API and npm are unreachable ---

  it('returns available=false when both sources are unreachable', async () => {
    fetchMock
      .when('update.taskhunter.test', Promise.reject(new Error('Network error')))
      .when('registry.npmjs.org', Promise.reject(new Error('Registry unreachable')));

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
  });
});

describe('getCurrentVersion', () => {
  it('is exported for the CLI update command', () => {
    expect(typeof getCurrentVersion).toBe('function');
    expect(getCurrentVersion()).toMatch(/^\d+\.\d+\.\d+|unknown$/);
  });
});

describe('CLI update exports', () => {
  it('exports package-manager helpers used by the update command', () => {
    expect(typeof detectPackageManager).toBe('function');
    expect(typeof executeUpdate).toBe('function');
  });
});

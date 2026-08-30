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
  getUpdateCommand,
} = await import('./package-manager.js');

const GITHUB_RELEASES_LATEST = 'api.github.com/repos/jlu-lujing/TaskHunter/releases/latest';
const GITHUB_RELEASES_TAG = 'api.github.com/repos/jlu-lujing/TaskHunter/releases/tags';

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

const releaseResponse = (tag, extra = {}) => ({
  ok: true,
  json: async () => ({ tag_name: tag, ...extra }),
});

describe('checkForUpdates', () => {
  let fetchMock;
  let originalFetch;
  let originalUpdateApiUrl;

  beforeEach(() => {
    fetchMock = createFetchMock();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    originalUpdateApiUrl = process.env.TASKHUNTER_UPDATE_API_URL;
    delete process.env.TASKHUNTER_UPDATE_API_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUpdateApiUrl === undefined) delete process.env.TASKHUNTER_UPDATE_API_URL;
    else process.env.TASKHUNTER_UPDATE_API_URL = originalUpdateApiUrl;
  });

  // --- Scenario: own GitHub Releases is the default version source ---

  it('returns available=true when the latest GitHub release is newer', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, releaseResponse('v1.10.0', { body: '## What is new' }));

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.10.0');
    expect(result.body).toBe('## What is new');
    expect(result.releaseUrl).toBe('https://github.com/jlu-lujing/TaskHunter/releases/tag/v1.10.0');
    expect(result.updateCommand).toBe('taskhunter update');
  });

  it('returns available=false when the latest GitHub release matches the current version', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, releaseResponse('v1.9.10'));

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
    expect(result.version).toBe('1.9.10');
  });

  it('returns available=false when the latest GitHub release is older (e.g. prerelease install)', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, releaseResponse('v1.9.10'));

    const result = await checkForUpdates({ currentVersion: '1.10.0' });

    expect(result.available).toBe(false);
  });

  it('reports the web tarball asset for web clients', async () => {
    fetchMock
      .when(GITHUB_RELEASES_LATEST, releaseResponse('v1.10.0'))
      .when(`${GITHUB_RELEASES_TAG}/v1.10.0`, {
        ok: true,
        json: async () => ({
          assets: [
            {
              name: 'TaskHunter-1.10.0-arm64-mac.zip',
              browser_download_url: 'https://downloads.example/desktop.zip',
            },
            {
              name: 'taskhunter-web-1.10.0.tgz',
              browser_download_url: 'https://downloads.example/taskhunter-web-1.10.0.tgz',
            },
          ],
        }),
      });

    const result = await checkForUpdates({ appType: 'web', currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    expect(result.webTarballUrl).toBe('https://downloads.example/taskhunter-web-1.10.0.tgz');
  });

  it('omits webTarballUrl when the release ships no tgz asset', async () => {
    fetchMock
      .when(GITHUB_RELEASES_LATEST, releaseResponse('v1.10.0'))
      .when(`${GITHUB_RELEASES_TAG}/v1.10.0`, {
        ok: true,
        json: async () => ({ assets: [] }),
      });

    const result = await checkForUpdates({ appType: 'web', currentVersion: '1.9.10' });

    expect(result.available).toBe(true);
    expect(result.webTarballUrl).toBeUndefined();
  });

  it('resolves an Android APK asset when an AAB is returned for mobile', async () => {
    fetchMock
      .when(GITHUB_RELEASES_LATEST, releaseResponse('v1.10.0', {
        downloadUrl: 'https://github.com/jlu-lujing/TaskHunter/releases/download/v1.10.0/TaskHunter-1.10.0-42-android.aab',
      }))
      .when(`${GITHUB_RELEASES_TAG}/v1.10.0`, {
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

  // --- Scenario: custom update API overrides the GitHub Releases source ---

  it('uses a configured update API before falling back to GitHub Releases', async () => {
    process.env.TASKHUNTER_UPDATE_API_URL = 'https://update.taskhunter.test/v1/update/check';
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

  // --- Scenario: GitHub unavailable ---

  it('reports up-to-date (not an error) when the repository has no releases yet', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) });

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('reports no update with an error when GitHub Releases cannot be reached', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, Promise.reject(new Error('Network error')));

    const result = await checkForUpdates({ currentVersion: '1.9.10' });

    expect(result.available).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('never queries the npm registry', async () => {
    fetchMock.when(GITHUB_RELEASES_LATEST, releaseResponse('v1.10.0'));

    await checkForUpdates({ currentVersion: '1.9.10' });

    const requestedHosts = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(requestedHosts.every((url) => !url.includes('registry.npmjs.org'))).toBe(true);
  });
});

describe('getUpdateCommand', () => {
  it('installs the release tarball with the detected package manager', () => {
    const url = 'https://downloads.example/taskhunter-web-1.10.0.tgz';
    expect(getUpdateCommand('npm', url)).toContain(`install -g ${url}`);
    expect(getUpdateCommand('pnpm', url)).toContain(`add -g ${url}`);
    expect(getUpdateCommand('yarn', url)).toContain(`global add ${url}`);
    expect(getUpdateCommand('bun', url)).toContain(`add -g ${url}`);
  });

  it('returns null when no tarball asset is available', () => {
    expect(getUpdateCommand('npm', null)).toBeNull();
  });
});

describe('executeUpdate', () => {
  it('fails without spawning when no tarball asset is available', () => {
    const result = executeUpdate('npm', { webTarballUrl: null, silent: true });
    expect(result.success).toBe(false);
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

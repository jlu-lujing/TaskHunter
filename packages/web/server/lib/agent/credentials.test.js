import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCredentialStore } from './credentials.js';

const fsPromises = { mkdir, readFile, unlink, writeFile, chmod };

let dataDir = null;

afterEach(() => {
  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
    dataDir = null;
  }
});

const makeStore = () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-creds-'));
  return createCredentialStore({ fsPromises, path, dataDir: path.join(dataDir, 'agent') });
};

describe('credential store', () => {
  it('reads missing keys as unconfigured', async () => {
    const credentials = makeStore();
    expect(await credentials.getGoApiKey()).toBeNull();
    expect(await credentials.hasGoApiKey()).toBe(false);
  });

  it('round-trips keys with restricted permissions', async () => {
    const credentials = makeStore();
    await credentials.setGoApiKey('  secret-key  ');
    expect(await credentials.getGoApiKey()).toBe('secret-key');
    expect(await credentials.hasGoApiKey()).toBe(true);
    const mode = statSync(path.join(dataDir, 'agent', 'go-api-key')).mode & 0o777;
    expect(mode).toBe(0o600);

    await credentials.clearGoApiKey();
    expect(await credentials.hasGoApiKey()).toBe(false);
    // Clearing twice is idempotent.
    await credentials.clearGoApiKey();
  });

  it('rejects empty keys', async () => {
    const credentials = makeStore();
    await expect(credentials.setGoApiKey('   ')).rejects.toThrow();
    await expect(credentials.setGoApiKey('')).rejects.toThrow();
  });
});

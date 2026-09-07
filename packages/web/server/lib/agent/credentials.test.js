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

  it('round-trips provider keys with restricted permissions', async () => {
    const credentials = makeStore();
    await credentials.setProviderApiKey('x-local', '  ck-secret  ');
    expect(await credentials.getProviderApiKey('x-local')).toBe('ck-secret');
    expect(await credentials.hasProviderApiKey('x-local')).toBe(true);
    const mode = statSync(path.join(dataDir, 'agent', 'provider-key-x-local')).mode & 0o777;
    expect(mode).toBe(0o600);

    // Provider keys are namespaced apart from the go key and each other.
    expect(await credentials.getGoApiKey()).toBeNull();
    await credentials.setProviderApiKey('x-other', 'k2');
    expect(await credentials.getProviderApiKey('x-local')).toBe('ck-secret');

    await credentials.clearProviderApiKey('x-local');
    expect(await credentials.hasProviderApiKey('x-local')).toBe(false);
    await credentials.clearProviderApiKey('x-local');
  });

  it('rejects provider ids that are not safe path segments', async () => {
    const credentials = makeStore();
    for (const bad of ['..', '../escape', 'go-api-key', 'provider-key-x', 'UPPER', '', 'with space', 'x/', 'x-a/../b', '/abs', 'x'.repeat(65)]) {
      expect(() => credentials.setProviderApiKey(bad, 'k')).toThrow();
      expect(() => credentials.getProviderApiKey(bad)).toThrow();
    }
  });
});

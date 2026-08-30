import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { createUpdateCommand } from './commands-update.js';

async function withTempTaskHunterDataDir(fn) {
  const previous = process.env.TASKHUNTER_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhunter-update-test-'));
  process.env.TASKHUNTER_DATA_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    if (typeof previous === 'string') {
      process.env.TASKHUNTER_DATA_DIR = previous;
    } else {
      delete process.env.TASKHUNTER_DATA_DIR;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('update command', () => {
  it('uses the package-manager helpers on the update-available path', async () => {
    await withTempTaskHunterDataDir(async () => {
      const originalWrite = process.stdout.write;
      process.stdout.write = vi.fn(() => true);
      const executeUpdate = vi.fn(() => ({ success: true, exitCode: 0 }));
      const updateCommand = createUpdateCommand({
        packageManagerPath: '/fake/package-manager.js',
        serveCommand: vi.fn(),
        importFromFilePath: vi.fn(async () => ({
          checkForUpdates: vi.fn(async () => ({
            available: true,
            version: '9.9.9',
            webTarballUrl: 'https://downloads.example/taskhunter-web-9.9.9.tgz',
          })),
          detectPackageManager: vi.fn(() => 'npm'),
          executeUpdate,
          getCurrentVersion: vi.fn(() => '1.0.0'),
        })),
      });

      try {
        await updateCommand({ json: true });

        expect(executeUpdate).toHaveBeenCalledWith('npm', {
          silent: true,
          webTarballUrl: 'https://downloads.example/taskhunter-web-9.9.9.tgz',
        });
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });
});

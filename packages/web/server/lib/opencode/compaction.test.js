import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getCompactionConfig, upsertCompactionConfig } from './compaction.js';

// All assertions run through the custom layer (OPENCODE_CONFIG) or the
// project layer so the real user config never participates in merge
// precedence or receives writes.
let sandboxDir;
let customConfigPath;
let previousCustomEnv;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function seedCustom(compaction) {
  const config = {};
  if (compaction !== undefined) {
    config.compaction = compaction;
  }
  writeJson(customConfigPath, config);
}

describe('compaction config persistence', () => {
  beforeEach(() => {
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskhunter-compaction-'));
    customConfigPath = path.join(sandboxDir, 'custom-opencode.json');
    previousCustomEnv = process.env.OPENCODE_CONFIG;
    process.env.OPENCODE_CONFIG = customConfigPath;
  });

  afterEach(() => {
    if (previousCustomEnv === undefined) {
      delete process.env.OPENCODE_CONFIG;
    } else {
      process.env.OPENCODE_CONFIG = previousCustomEnv;
    }
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  });

  test('reads effective values and the defining layer', () => {
    seedCustom({ auto: false, prune: true });
    const state = getCompactionConfig(sandboxDir);
    expect(state.auto).toBe(false);
    expect(state.prune).toBe(true);
    expect(state.layer).toBe('custom');
  });

  test('applies OpenCode defaults when the defining block omits keys', () => {
    seedCustom({ reserved: 4096 });
    const state = getCompactionConfig(sandboxDir);
    expect(state.auto).toBe(true);
    expect(state.prune).toBe(false);
  });

  test('writes to the layer that already defines compaction', () => {
    const projectDir = path.join(sandboxDir, 'project');
    const projectConfigPath = path.join(projectDir, 'opencode.json');
    seedCustom({});
    writeJson(projectConfigPath, { compaction: { auto: true, prune: false } });

    const result = upsertCompactionConfig({ auto: false, prune: true }, projectDir);
    expect(result.layer).toBe('custom');
    expect(result.path).toBe(customConfigPath);
    expect(readJson(customConfigPath).compaction).toEqual({ auto: false, prune: true });

    // Project still holds its own block; effective state follows custom.
    expect(readJson(projectConfigPath).compaction).toEqual({ auto: true, prune: false });
    expect(getCompactionConfig(projectDir).auto).toBe(false);
  });

  test('writes to the project layer when only it defines compaction', () => {
    const projectDir = path.join(sandboxDir, 'project');
    const projectConfigPath = path.join(projectDir, 'opencode.json');
    writeJson(customConfigPath, { model: 'keep-me' });
    writeJson(projectConfigPath, { compaction: { auto: true } });

    const result = upsertCompactionConfig({ auto: false, prune: true }, projectDir);
    expect(result.layer).toBe('project');
    expect(result.path).toBe(projectConfigPath);
    expect(readJson(projectConfigPath).compaction).toEqual({ auto: false, prune: true });

    const state = getCompactionConfig(projectDir);
    expect(state.auto).toBe(false);
    expect(state.prune).toBe(true);
    expect(state.layer).toBe('project');
  });

  test('preserves unrelated compaction keys on write', () => {
    seedCustom({ auto: true, prune: false, reserved: 5000, tail_turns: 2 });
    upsertCompactionConfig({ auto: false, prune: true }, sandboxDir);
    expect(readJson(customConfigPath).compaction).toEqual({
      auto: false,
      prune: true,
      reserved: 5000,
      tail_turns: 2,
    });
  });

  test('rejects non-boolean payloads without writing', () => {
    seedCustom({ auto: true, prune: false });
    for (const payload of [
      { auto: 'false', prune: false },
      { auto: true },
      { prune: true },
      {},
    ]) {
      expect(() => upsertCompactionConfig(payload, sandboxDir)).toThrow(/booleans/);
    }
    expect(readJson(customConfigPath).compaction).toEqual({ auto: true, prune: false });
  });
});

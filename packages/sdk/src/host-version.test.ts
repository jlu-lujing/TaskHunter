import { describe, expect, test } from 'bun:test';

import {
  compareTaskHunterVersions,
  hostMeetsTaskHunterEngine,
  taskHunterEngineMinimum,
  parseTaskHunterVersion,
} from './host-version.ts';

describe('taskHunter host version', () => {
  test('parses core semver', () => {
    expect(parseTaskHunterVersion('1.22.0')).toEqual({ major: 1, minor: 22, patch: 0 });
    expect(parseTaskHunterVersion('v1.22.0-beta.1')).toEqual({ major: 1, minor: 22, patch: 0 });
    expect(parseTaskHunterVersion('junk')).toBeNull();
  });

  test('compares versions', () => {
    expect(compareTaskHunterVersions('1.22.0', '1.21.9')).toBeGreaterThan(0);
    expect(compareTaskHunterVersions('1.22.0', '1.22.0')).toBe(0);
    expect(compareTaskHunterVersions('1.21.0', '1.22.0')).toBeLessThan(0);
  });

  test('normalizes engines.taskhunter floors', () => {
    expect(taskHunterEngineMinimum('1.22.0')).toBe('1.22.0');
    expect(taskHunterEngineMinimum('>=1.22.0')).toBe('1.22.0');
    expect(taskHunterEngineMinimum('^1.22.0')).toBeNull();
  });

  test('checks host against engines.taskhunter', () => {
    expect(hostMeetsTaskHunterEngine('1.22.0', '>=1.22.0')).toBe(true);
    expect(hostMeetsTaskHunterEngine('1.22.0', '1.22.0')).toBe(true);
    expect(hostMeetsTaskHunterEngine('1.21.9', '>=1.22.0')).toBe(false);
    expect(hostMeetsTaskHunterEngine('unknown', '>=1.22.0')).toBe(false);
  });
});

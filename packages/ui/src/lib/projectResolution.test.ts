import { describe, expect, test } from 'bun:test';
import { resolveProjectForSessionDirectory } from './projectResolution';

const projects = [
  { id: 'taskhunter', path: '/workspace/taskhunter', label: 'TaskHunter' },
];

describe('resolveProjectForSessionDirectory', () => {
  test('resolves a sibling worktree to its registered project', () => {
    const worktrees = new Map([
      ['/workspace/taskhunter', [{
        path: '/workspace/taskhunter-feature',
        projectDirectory: '/workspace/taskhunter',
        branch: 'feature',
        label: 'feature',
      }]],
    ]);

    expect(resolveProjectForSessionDirectory(projects, worktrees, '/workspace/taskhunter-feature')).toEqual(projects[0]);
  });
});

import { describe, expect, test } from 'bun:test';

import { resolveProjectActionsOwner } from './useProjectActionsContext';

const projects = [
  { id: 'taskhunter', path: '/workspace/taskhunter', label: 'TaskHunter' },
];

describe('resolveProjectActionsOwner', () => {
  test('resolves a worktree directory to its owning parent project', () => {
    const owner = resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map([
        ['/workspace/taskhunter', [{
          path: '/workspace/taskhunter-feature',
          projectDirectory: '/workspace/taskhunter',
          branch: 'feature',
          label: 'feature',
        }]],
      ]),
      directory: '/workspace/taskhunter-feature',
      activeProjectId: null,
    });

    expect(owner).toEqual(projects[0]);
  });

  test('resolves a directory under the project path to that project', () => {
    const owner = resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '/workspace/taskhunter/packages/ui',
      activeProjectId: null,
    });

    expect(owner).toEqual(projects[0]);
  });

  test('falls back to the active project when the directory does not resolve', () => {
    const owner = resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '/some/other/project',
      activeProjectId: 'taskhunter',
    });

    expect(owner).toEqual(projects[0]);
  });

  test('falls back to the active project when the directory is empty or null', () => {
    expect(resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '',
      activeProjectId: 'taskhunter',
    })).toEqual(projects[0]);

    expect(resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map(),
      directory: null,
      activeProjectId: 'taskhunter',
    })).toEqual(projects[0]);
  });

  test('returns null when the directory does not resolve and the active project is unknown', () => {
    const owner = resolveProjectActionsOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '/some/other/project',
      activeProjectId: 'missing-project',
    });

    expect(owner).toBeNull();
  });
});

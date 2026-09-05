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

  test('prefers registered worktree ownership over a containing project', () => {
    const configuredProjects = [
      { id: 'home', path: '/Users/elfy', label: 'Home' },
      { id: 'infoscan', path: '/Users/elfy/GitRepos/infoscan', label: 'InfoScan' },
    ];
    const worktreePath = '/Users/elfy/.local/share/opencode/worktree/refactor-self-hosted-runners';
    const worktrees = new Map([
      ['/Users/elfy/GitRepos/infoscan', [{
        path: worktreePath,
        projectDirectory: '/Users/elfy/GitRepos/infoscan',
        branch: 'refactor/self-hosted-runners',
        label: 'refactor/self-hosted-runners',
      }]],
    ]);

    expect(resolveProjectForSessionDirectory(configuredProjects, worktrees, worktreePath)).toEqual(configuredProjects[1]);
  });
});

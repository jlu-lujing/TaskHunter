import { describe, expect, test } from 'bun:test';

import { CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { resolveProjectContextOwner } from './useProjectContextOwner';

const projects = [
  { id: 'taskhunter', path: '/workspace/taskhunter', label: 'TaskHunter' },
];

describe('resolveProjectContextOwner', () => {
  test('resolves a managed chat directory to the Chats root instead of the active project', () => {
    const owner = resolveProjectContextOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '/Users/test/.config/taskhunter/chats/2026-08-27/session-a',
      activeProjectId: 'taskhunter',
      chatDraftOpen: false,
      chatDraftTarget: 'project',
      homeDirectory: '/Users/test',
    });

    expect(owner).toEqual({
      id: CHAT_DRAFT_PROJECT_ID,
      path: '/Users/test/.config/taskhunter/chats',
    });
  });

  test('resolves a worktree session to its owning project', () => {
    const owner = resolveProjectContextOwner({
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
      chatDraftOpen: false,
      chatDraftTarget: 'project',
      homeDirectory: '/Users/test',
    });

    expect(owner).toEqual({ id: 'taskhunter', path: '/workspace/taskhunter' });
  });

  test('returns null for a recognized directory that owns nothing, instead of borrowing the active project', () => {
    const owner = resolveProjectContextOwner({
      projects,
      worktreesByProject: new Map(),
      directory: '/some/other/project',
      activeProjectId: 'taskhunter',
      chatDraftOpen: false,
      chatDraftTarget: 'project',
      homeDirectory: '/Users/test',
    });

    expect(owner).toBeNull();
  });

  test('falls back to the active project only when there is no directory at all', () => {
    const owner = resolveProjectContextOwner({
      projects,
      worktreesByProject: new Map(),
      directory: null,
      activeProjectId: 'taskhunter',
      chatDraftOpen: false,
      chatDraftTarget: 'project',
      homeDirectory: '/Users/test',
    });

    expect(owner).toEqual({ id: 'taskhunter', path: '/workspace/taskhunter' });
  });

  test('never falls back to the first project when the active project is unknown', () => {
    const owner = resolveProjectContextOwner({
      projects,
      worktreesByProject: new Map(),
      directory: null,
      activeProjectId: 'missing-project',
      chatDraftOpen: false,
      chatDraftTarget: 'project',
      homeDirectory: '/Users/test',
    });

    expect(owner).toBeNull();
  });
});

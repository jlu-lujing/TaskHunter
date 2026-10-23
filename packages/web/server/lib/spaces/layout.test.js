import { describe, expect, it } from 'vitest';

import { projectFolderName, spaceHistoryPath, spaceProjectPath } from './layout.js';

describe('projectFolderName', () => {
  it.each([
    ['/home/me/taskhunter', 'taskhunter'],
    ['/home/me/my app/', 'my-app'],
    ['C:\\Users\\me\\Projects\\web_site.v2', 'web_site.v2'],
    ['/home/me/.dotfiles', 'dotfiles'],
    ['/home/me/-rf', 'rf'],
    ['/home/me/bait repo ї', 'bait-repo-'],
    ['/home/me/$(touch x);`id`', 'touch-x-id-'],
    [`/home/me/${'a'.repeat(100)}`, 'a'.repeat(64)],
  ])('names %s as %s', (directory, name) => {
    expect(projectFolderName(directory)).toBe(name);
  });

  // The plugin link lives at /spaces/<id>/node_modules, and a name with nothing readable left says nothing.
  it.each(['/home/me/node_modules', '/home/me/NODE_MODULES', '/home/me/юнікод', '/home/me/...', '/', ''])('falls back to a fixed name for %j', (directory) => {
    expect(projectFolderName(directory)).toBe('project');
  });

  it('puts the project and the history side repository in the space, where they cannot collide', () => {
    expect(spaceProjectPath('a1b2c3d4e5f6', '/home/me/taskhunter')).toBe('/spaces/a1b2c3d4e5f6/taskhunter');
    expect(spaceHistoryPath('a1b2c3d4e5f6')).toBe('/spaces/a1b2c3d4e5f6/.taskhunter-history.git');
    expect(spaceProjectPath('a1b2c3d4e5f6', '/home/me/.taskhunter-history.git')).toBe('/spaces/a1b2c3d4e5f6/taskhunter-history.git');
    expect(() => spaceProjectPath('../etc', '/home/me/taskhunter')).toThrow();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';

// The board's git needs: a card can only be dispatched into a worktree once
// its project is a git repository, and the card menu offers a one-click
// adoption for projects that are not yet.

export const isGitRepository = async (directory) => {
  try {
    await fs.promises.access(path.join(directory, '.git'));
    return true;
  } catch {
    return false;
  }
};

const DEFAULT_IGNORES = ['node_modules/', 'dist/', 'build/', '.env'];

export const initRepository = async (directory) => {
  if (await isGitRepository(directory)) return { initialized: false };
  // A checkout with node_modules and no .gitignore would otherwise swallow
  // the whole dependency tree into the initial commit. Seed the obvious ones.
  if (!fs.existsSync(path.join(directory, '.gitignore'))
    && fs.existsSync(path.join(directory, 'node_modules'))) {
    await fs.promises.writeFile(path.join(directory, '.gitignore'), `${DEFAULT_IGNORES.join('\n')}\n`, 'utf8');
  }
  const git = simpleGit({ baseDir: directory, maxConcurrentProcesses: 1 });
  await git.init();
  await git.add('.');
  // An empty checkout still needs a root commit: worktrees branch from HEAD.
  const status = await git.status();
  await git.commit('chore: initialize repository', status.staged.length === 0 ? ['--allow-empty'] : []);
  return { initialized: true };
};

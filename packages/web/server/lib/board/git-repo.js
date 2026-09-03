import fs from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';

// The board's git needs: a card can only be dispatched into a worktree once
// its project is a git repository, and the card menu offers a one-click
// adoption for projects that are not yet.

export const isGitRepository = async (directory) => {
  // Prefer authoritative git check, fallback to spawn and fs.access.
  try {
    const git = simpleGit(directory);
    if (typeof git.checkIsRepo === 'function') {
      const isRepo = await git.checkIsRepo();
      if (isRepo) return true;
    }
  } catch {
    // ignore and fall through to spawn check
  }
  try {
    const { spawn } = await import('node:child_process');
    const ok = await new Promise((resolve) => {
      const child = spawn('git', ['rev-parse', '--git-dir'], {
        cwd: directory,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
    if (ok) return true;
  } catch {
    // ignore and fall through to fs check
  }
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
  const gitignorePath = path.join(directory, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    if (fs.existsSync(path.join(directory, 'node_modules'))) {
      await fs.promises.writeFile(gitignorePath, `${DEFAULT_IGNORES.join('\n')}\n`, 'utf8');
    }
  } else {
    try {
      const existing = await fs.promises.readFile(gitignorePath, 'utf8');
      const lines = existing.split('\n').map((line) => line.trim());
      const missing = DEFAULT_IGNORES.filter((entry) => !lines.includes(entry) && !lines.includes(entry.replace(/\/$/, '')));
      if (missing.length > 0) {
        const suffix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
        await fs.promises.appendFile(gitignorePath, `${suffix}${missing.join('\n')}\n`, 'utf8');
      }
    } catch {
      // ignore read/append failures, init should still proceed
    }
  }
  const git = simpleGit({ baseDir: directory, maxConcurrentProcesses: 1 });
  await git.init();
  await git.add('-A');
  // An empty checkout still needs a root commit: worktrees branch from HEAD.
  const status = await git.status();
  if (status.staged.includes('.env')) {
    try {
      const ignored = typeof git.checkIgnore === 'function' ? await git.checkIgnore(['.env']) : [];
      const isIgnored = Array.isArray(ignored) && ignored.length > 0;
      if (!isIgnored) {
        console.warn('[board] warning: .env is staged but not ignored by .gitignore');
      }
    } catch {
      console.warn('[board] warning: .env is staged but not ignored by .gitignore');
    }
  }
  await git.commit('chore: initialize repository', status.staged.length === 0 ? ['--allow-empty'] : []);
  return { initialized: true };
};

// Builtin tool implementations: read, write, edit, glob, grep, bash.
//
// Node builtins only (fs/promises, child_process, path, os). Every tool
// resolves paths inside the session directory — anything escaping it fails
// with an explicit error instead of touching the wider filesystem. The
// permission gate (not path checks) is the authorization boundary for bash.

import { spawn } from 'node:child_process';

const READ_DEFAULT_LIMIT_LINES = 200;
const READ_MAX_LINE_CHARS = 2000;
const GLOB_MAX_RESULTS = 200;
const GREP_MAX_MATCHES = 100;
const GREP_MAX_LINE_CHARS = 500;
const BASH_DEFAULT_TIMEOUT_MS = 60_000;
const BASH_MAX_TIMEOUT_MS = 300_000;
const BASH_MAX_OUTPUT_CHARS = 30_000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.idea', '.vscode', 'dist', 'build', 'out', 'target', '__pycache__']);

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const fail = (message) => ({ output: `Error: ${message}`, isError: true });

// Resolve a user-supplied path inside the session directory. Absolute paths
// are accepted only when contained; everything else resolves relative.
const resolveInside = (path, directory, filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('filePath is required');
  }
  const resolved = path.resolve(directory, filePath);
  const contained = resolved === directory || resolved.startsWith(directory + path.sep);
  if (!contained) {
    throw new Error(`path escapes the session directory: ${filePath}`);
  }
  return resolved;
};

const globToRegExp = (pattern) => {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += pattern[index + 2] === '/' ? 3 : 2;
      } else {
        source += '[^/]*';
        index += 1;
      }
    } else if (char === '?') {
      source += '[^/]';
      index += 1;
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/, '\\$&');
      index += 1;
    }
  }
  return new RegExp(`^${source}$`);
};

export const createAgentTools = ({ fsPromises, path, os, spawnImpl = spawn } = {}) => {
  if (!fsPromises || !path || !os) {
    throw new Error('createAgentTools requires fsPromises, path, and os');
  }

  const read = async (args, context) => {
    let filePath;
    try {
      filePath = resolveInside(path, context.directory, args?.filePath);
    } catch (error) {
      return fail(error.message);
    }
    const offset = Number.isSafeInteger(args?.offset) && args.offset > 0 ? args.offset : 1;
    const limit = Number.isSafeInteger(args?.limit) && args.limit > 0 ? Math.min(args.limit, 2000) : READ_DEFAULT_LIMIT_LINES;
    let content;
    try {
      content = await fsPromises.readFile(filePath, 'utf8');
    } catch (error) {
      return fail(error.code === 'ENOENT' ? `file not found: ${args.filePath}` : `cannot read file: ${error.message}`);
    }
    if (content.slice(0, 8000).includes('\0')) {
      return fail(`binary file, refusing to read: ${args.filePath}`);
    }
    const lines = content.split('\n');
    const selected = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = selected.map((line, index) => {
      const text = line.length > READ_MAX_LINE_CHARS ? `${line.slice(0, READ_MAX_LINE_CHARS)}…[truncated]` : line;
      return `${offset + index}│${text}`;
    });
    const suffix = offset - 1 + limit < lines.length ? `\n…[${lines.length - (offset - 1 + limit)} more lines]` : '';
    return { output: numbered.join('\n') + suffix };
  };

  const write = async (args, context) => {
    let filePath;
    try {
      filePath = resolveInside(path, context.directory, args?.filePath);
    } catch (error) {
      return fail(error.message);
    }
    if (typeof args?.content !== 'string') {
      return fail('content is required');
    }
    try {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await fsPromises.writeFile(filePath, args.content, 'utf8');
    } catch (error) {
      return fail(`cannot write file: ${error.message}`);
    }
    return { output: `Wrote ${args.content.split('\n').length} lines to ${args.filePath}`, title: `Write ${args.filePath}` };
  };

  const edit = async (args, context) => {
    let filePath;
    try {
      filePath = resolveInside(path, context.directory, args?.filePath);
    } catch (error) {
      return fail(error.message);
    }
    if (typeof args?.oldText !== 'string' || args.oldText.length === 0) {
      return fail('oldText is required');
    }
    if (typeof args?.newText !== 'string') {
      return fail('newText is required');
    }
    let content;
    try {
      content = await fsPromises.readFile(filePath, 'utf8');
    } catch (error) {
      return fail(error.code === 'ENOENT' ? `file not found: ${args.filePath}` : `cannot read file: ${error.message}`);
    }
    const occurrences = content.split(args.oldText).length - 1;
    if (occurrences === 0) {
      return fail('oldText not found in file');
    }
    if (occurrences > 1) {
      return fail(`oldText matches ${occurrences} locations; include more context to make it unique`);
    }
    await fsPromises.writeFile(filePath, content.replace(args.oldText, args.newText), 'utf8');
    return { output: `Edited ${args.filePath}`, title: `Edit ${args.filePath}` };
  };

  const walkFiles = async (root, results) => {
    let dirents;
    try {
      dirents = await fsPromises.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (results.length >= GLOB_MAX_RESULTS) {
        return;
      }
      const name = dirent.name;
      if (name.startsWith('.') && name !== '.') {
        continue;
      }
      const full = path.join(root, name);
      if (dirent.isDirectory()) {
        if (SKIP_DIRS.has(name)) {
          continue;
        }
        await walkFiles(full, results);
      } else if (dirent.isFile()) {
        results.push(full);
      }
    }
  };

  const glob = async (args, context) => {
    if (typeof args?.pattern !== 'string' || args.pattern.length === 0) {
      return fail('pattern is required');
    }
    let root;
    try {
      root = resolveInside(path, context.directory, args?.path || '.');
    } catch (error) {
      return fail(error.message);
    }
    const matcher = globToRegExp(args.pattern);
    const files = [];
    await walkFiles(root, files);
    const matches = files
      .map((file) => path.relative(context.directory, file))
      .filter((relative) => matcher.test(relative) || matcher.test(relative.split(path.sep).pop()))
      .slice(0, GLOB_MAX_RESULTS);
    if (matches.length === 0) {
      return { output: 'No files match.' };
    }
    return { output: matches.join('\n') };
  };

  const grep = async (args, context) => {
    if (typeof args?.pattern !== 'string' || args.pattern.length === 0) {
      return fail('pattern is required');
    }
    let expression;
    try {
      expression = new RegExp(args.pattern);
    } catch {
      return fail(`invalid regular expression: ${args.pattern}`);
    }
    let root;
    try {
      root = resolveInside(path, context.directory, args?.path || '.');
    } catch (error) {
      return fail(error.message);
    }
    const include = typeof args?.include === 'string' && args.include.length > 0 ? globToRegExp(args.include) : null;
    const files = [];
    await walkFiles(root, files);
    const matches = [];
    for (const file of files) {
      if (matches.length >= GREP_MAX_MATCHES) {
        break;
      }
      const relative = path.relative(context.directory, file);
      if (include && !include.test(relative) && !include.test(relative.split(path.sep).pop())) {
        continue;
      }
      let content;
      try {
        content = await fsPromises.readFile(file, 'utf8');
      } catch {
        continue;
      }
      if (content.slice(0, 8000).includes('\0')) {
        continue;
      }
      const lines = content.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= GREP_MAX_MATCHES) {
          break;
        }
        if (!expression.test(lines[index])) {
          continue;
        }
        const text = lines[index].length > GREP_MAX_LINE_CHARS
          ? `${lines[index].slice(0, GREP_MAX_LINE_CHARS)}…[truncated]`
          : lines[index];
        matches.push(`${relative}:${index + 1}:${text}`);
      }
    }
    if (matches.length === 0) {
      return { output: 'No matches.' };
    }
    const suffix = matches.length >= GREP_MAX_MATCHES ? `\n…[truncated at ${GREP_MAX_MATCHES} matches]` : '';
    return { output: matches.join('\n') + suffix };
  };

  const bash = async (args, context) => {
    if (typeof args?.command !== 'string' || args.command.trim().length === 0) {
      return fail('command is required');
    }
    const timeoutMs = Number.isSafeInteger(args?.timeoutMs) && args.timeoutMs > 0
      ? Math.min(args.timeoutMs, BASH_MAX_TIMEOUT_MS)
      : BASH_DEFAULT_TIMEOUT_MS;
    const isWindows = os.platform() === 'win32';
    return new Promise((resolve) => {
      const child = spawnImpl(isWindows ? 'cmd.exe' : 'sh', isWindows ? ['/d', '/s', '/c', args.command] : ['-c', args.command], {
        cwd: context.directory,
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '';
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
        }
        finish({ output: `${truncateOutput(output)}\nError: command timed out after ${timeoutMs}ms`, isError: true });
      }, timeoutMs);
      if (timer.unref) {
        timer.unref();
      }
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data) => {
        output += data.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        finish(fail(`cannot run command: ${error.message}`));
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const truncated = truncateOutput(output);
        if (code === 0) {
          finish({ output: truncated.length > 0 ? truncated : '(no output)' });
        } else {
          finish({ output: `${truncated}\nError: exit ${code ?? signal}`, isError: true });
        }
      });
      if (context.signal) {
        if (context.signal.aborted) {
          try {
            child.kill('SIGKILL');
          } catch {
          }
        } else {
          context.signal.addEventListener('abort', () => {
            try {
              child.kill('SIGKILL');
            } catch {
            }
          }, { once: true });
        }
      }
    });
  };

  const truncateOutput = (output) => {
    if (output.length <= BASH_MAX_OUTPUT_CHARS) {
      return output;
    }
    return `…[truncated, showing last ${BASH_MAX_OUTPUT_CHARS} chars]\n${output.slice(-BASH_MAX_OUTPUT_CHARS)}`;
  };

  const definitions = [
    {
      name: 'read',
      description: 'Read a file with line numbers. Use offset/limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relative to the session directory' },
          offset: { type: 'integer', description: 'First line (1-based)' },
          limit: { type: 'integer', description: 'Max lines to read' },
        },
        required: ['filePath'],
      },
      execute: read,
    },
    {
      name: 'write',
      description: 'Create or overwrite a file with the given content.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relative to the session directory' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['filePath', 'content'],
      },
      execute: write,
    },
    {
      name: 'edit',
      description: 'Replace exactly one occurrence of oldText with newText in a file.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relative to the session directory' },
          oldText: { type: 'string', description: 'Text to replace (must be unique in the file)' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['filePath', 'oldText', 'newText'],
      },
      execute: edit,
    },
    {
      name: 'glob',
      description: 'Find files by glob pattern (*, **, ?). Skips node_modules, .git, build outputs.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern, e.g. **/*.js' },
          path: { type: 'string', description: 'Subdirectory to search' },
        },
        required: ['pattern'],
      },
      execute: glob,
    },
    {
      name: 'grep',
      description: 'Search file contents with a regular expression. Skips binaries.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'JavaScript RegExp source' },
          path: { type: 'string', description: 'Subdirectory to search' },
          include: { type: 'string', description: 'Glob filter for file names' },
        },
        required: ['pattern'],
      },
      execute: grep,
    },
    {
      name: 'bash',
      description: 'Run a shell command in the session directory and capture output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command' },
          timeoutMs: { type: 'integer', description: 'Timeout in milliseconds' },
        },
        required: ['command'],
      },
      execute: bash,
    },
  ];

  const execute = async (name, args, context) => {
    const tool = definitions.find((entry) => entry.name === name);
    if (!tool) {
      return fail(`unknown tool: ${name}`);
    }
    if (!isRecord(context) || typeof context.directory !== 'string') {
      return fail('tool execution requires a session directory');
    }
    try {
      return await tool.execute(isRecord(args) ? args : {}, context);
    } catch (error) {
      return fail(error?.message ?? String(error));
    }
  };

  return {
    definitions: definitions.map(({ name, description, parameters }) => ({ name, description, parameters })),
    execute,
  };
};

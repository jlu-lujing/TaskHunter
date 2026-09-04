import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, readdir, readlink, rename, unlink, writeFile, stat, readdirSync } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { createAgentTools } from './tools.js';

const fsPromises = { mkdir, readFile, readdir, rename, unlink, writeFile, stat };

let directory = null;

afterEach(() => {
  if (directory) {
    rmSync(directory, { recursive: true, force: true });
    directory = null;
  }
});

const makeTools = () => {
  directory = mkdtempSync(path.join(tmpdir(), 'taskhunter-agent-tools-'));
  return { tools: createAgentTools({ fsPromises, path, os }), directory };
};

const context = (directory) => ({ sessionID: 'bse_1', directory });

describe('agent tools', () => {
  it('exposes six function definitions with JSON schemas', () => {
    const { tools } = makeTools();
    const names = tools.definitions.map((definition) => definition.name).sort();
    expect(names).toEqual(['bash', 'edit', 'glob', 'grep', 'read', 'write']);
    for (const definition of tools.definitions) {
      expect(definition.parameters.type).toBe('object');
    }
  });

  it('reads files with line numbers and paging', async () => {
    const { tools, directory } = makeTools();
    await writeFile(path.join(directory, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');
    const full = await tools.execute('read', { filePath: 'a.txt' }, context(directory));
    expect(full.isError).toBeUndefined();
    expect(full.output).toContain('1│one');
    const page = await tools.execute('read', { filePath: 'a.txt', offset: 2, limit: 1 }, context(directory));
    expect(page.output).toContain('2│two');
    expect(page.output).not.toContain('three');
  });

  it('refuses paths outside the session directory', async () => {
    const { tools, directory } = makeTools();
    const result = await tools.execute('read', { filePath: '../outside.txt' }, context(directory));
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/escapes/i);
  });

  it('writes and edits files', async () => {
    const { tools, directory } = makeTools();
    await tools.execute('write', { filePath: 'sub/b.txt', content: 'hello world\n' }, context(directory));
    expect(await readFile(path.join(directory, 'sub', 'b.txt'), 'utf8')).toBe('hello world\n');

    const edited = await tools.execute('edit', { filePath: 'sub/b.txt', oldText: 'world', newText: 'there' }, context(directory));
    expect(edited.isError).toBeUndefined();
    expect(await readFile(path.join(directory, 'sub', 'b.txt'), 'utf8')).toBe('hello there\n');

    const missing = await tools.execute('edit', { filePath: 'sub/b.txt', oldText: 'nope', newText: 'x' }, context(directory));
    expect(missing.isError).toBe(true);
  });

  it('requires unique edit matches', async () => {
    const { tools, directory } = makeTools();
    await writeFile(path.join(directory, 'c.txt'), 'x=1\nx=1\n', 'utf8');
    const result = await tools.execute('edit', { filePath: 'c.txt', oldText: 'x=1', newText: 'x=2' }, context(directory));
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/2 locations/);
  });

  it('globs files while skipping ignored directories', async () => {
    const { tools, directory } = makeTools();
    await mkdir(path.join(directory, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(directory, 'node_modules', 'pkg', 'index.js'), 'x', 'utf8');
    await writeFile(path.join(directory, 'src.js'), 'y', 'utf8');
    const result = await tools.execute('glob', { pattern: '**/*.js' }, context(directory));
    expect(result.output).toContain('src.js');
    expect(result.output).not.toContain('node_modules');
  });

  it('greps contents with match caps', async () => {
    const { tools, directory } = makeTools();
    await writeFile(path.join(directory, 'd.txt'), 'alpha\nbeta alpha\ngamma\n', 'utf8');
    const result = await tools.execute('grep', { pattern: 'alpha' }, context(directory));
    expect(result.output).toContain('d.txt:1:alpha');
    expect(result.output).toContain('d.txt:2:beta alpha');
    const bad = await tools.execute('grep', { pattern: '([' }, context(directory));
    expect(bad.isError).toBe(true);
  });

  it('runs bash and captures output', async () => {
    const { tools, directory } = makeTools();
    const ok = await tools.execute('bash', { command: `${process.execPath} -e "process.stdout.write('hi')"` }, context(directory));
    expect(ok.isError).toBeUndefined();
    expect(ok.output).toBe('hi');
    const failing = await tools.execute('bash', { command: `${process.execPath} -e "process.exit(3)"` }, context(directory));
    expect(failing.isError).toBe(true);
    expect(failing.output).toMatch(/exit 3/);
  });

  it('reports unknown tools and missing context', async () => {
    const { tools, directory } = makeTools();
    expect((await tools.execute('nope', {}, context(directory))).isError).toBe(true);
    expect((await tools.execute('read', { filePath: 'a.txt' }, {})).isError).toBe(true);
  });

  it('rejects binary reads', async () => {
    const { tools, directory } = makeTools();
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(path.join(directory, 'bin.dat'), Buffer.from([0, 1, 2, 3]));
    const result = await tools.execute('read', { filePath: 'bin.dat' }, context(directory));
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/binary/i);
  });

  // Silence unused-import lint for readdirSync/readlink kept as API surface
  // documentation for future directory-aware tools.
  void readdirSync;
  void readlink;
});

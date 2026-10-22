import { describe, expect, test } from 'bun:test';
import { parseProjects } from './parsers';

describe('parseProjects', () => {
  test('keeps per-project model defaults across a settings round trip', () => {
    const projects = [
      { path: '/repo/app', label: 'App', defaultModel: 'openai/gpt-5.6', defaultVariant: 'low' },
      { path: '/repo/lib', defaultModel: '  ', defaultVariant: 42 },
    ];
    const parsed = parseProjects(projects, { projects });

    expect(parsed?.map((project) => [project.path, project.defaultModel, project.defaultVariant])).toEqual([
      ['/repo/app', 'openai/gpt-5.6', 'low'],
      ['/repo/lib', undefined, undefined],
    ]);
  });
});

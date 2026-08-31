import { describe, expect, test } from 'bun:test';
import {
  BOARD_STATUSES,
  filterTasksByProject,
  groupTasksByStatus,
  nextStatus,
  previousStatus,
  type BoardTask,
} from './boardModel';

const task = (id: string, status: BoardTask['status'], extra: Partial<BoardTask> = {}): BoardTask => ({
  id,
  projectId: null,
  title: id,
  description: '',
  status,
  labels: [],
  sessionIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('agent pipeline columns', () => {
  test('pipeline order runs backlog to done with attention last', () => {
    expect(BOARD_STATUSES).toEqual([
      'backlog', 'planning', 'queued', 'running', 'checking', 'review', 'merging', 'done', 'blocked',
    ]);
  });

  test('manual steps only cross human-owned gates', () => {
    expect(nextStatus('backlog')).toBe('planning');
    expect(nextStatus('review')).toBe('done');
    // agent-owned gates need actions, not arrows
    expect(nextStatus('planning')).toBeNull();
    expect(nextStatus('queued')).toBeNull();
    expect(nextStatus('running')).toBeNull();
    expect(nextStatus('checking')).toBeNull();
    expect(nextStatus('merging')).toBeNull();
    expect(nextStatus('done')).toBeNull();
    expect(nextStatus('blocked')).toBeNull();
    expect(previousStatus('backlog')).toBeNull();
    expect(previousStatus('review')).toBeNull();
    expect(previousStatus('blocked')).toBeNull();
  });
});

describe('board grouping and filtering', () => {
  test('groups every column and orders newest-touched first', () => {
    const groups = groupTasksByStatus([
      task('old', 'queued', { updatedAt: 5 }),
      task('new', 'queued', { updatedAt: 9 }),
      task('other', 'checking'),
    ]);
    expect(BOARD_STATUSES.every((status) => Array.isArray(groups.get(status)))).toBe(true);
    expect(groups.get('queued')?.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(groups.get('checking')?.map((entry) => entry.id)).toEqual(['other']);
    expect(groups.get('backlog')).toEqual([]);
  });

  test('filters by project with null meaning all', () => {
    const tasks = [task('a', 'backlog', { projectId: 'p1' }), task('b', 'backlog', { projectId: null })];
    expect(filterTasksByProject(tasks, 'p1').map((entry) => entry.id)).toEqual(['a']);
    expect(filterTasksByProject(tasks, null)).toHaveLength(2);
  });
});

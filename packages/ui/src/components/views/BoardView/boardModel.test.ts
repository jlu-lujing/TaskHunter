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

describe('board status flow', () => {
  test('advances one column and stops at the last', () => {
    expect(nextStatus('backlog')).toBe('ready');
    expect(nextStatus('review')).toBe('done');
    expect(nextStatus('done')).toBeNull();
    expect(nextStatus('blocked')).toBeNull();
  });

  test('blocked cards hide step arrows (retry happens via the editor)', () => {
    expect(previousStatus('blocked')).toBeNull();
    expect(nextStatus('done')).toBeNull();
  });

  test('moves back one column and stops at the first', () => {
    expect(previousStatus('ready')).toBe('backlog');
    expect(previousStatus('backlog')).toBeNull();
  });
});

describe('board grouping and filtering', () => {
  test('groups every status column and orders newest-touched first', () => {
    const groups = groupTasksByStatus([
      task('old', 'ready', { updatedAt: 5 }),
      task('new', 'ready', { updatedAt: 9 }),
      task('other', 'review'),
    ]);
    expect(BOARD_STATUSES.every((status) => Array.isArray(groups.get(status)))).toBe(true);
    expect(groups.get('ready')?.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(groups.get('review')?.map((entry) => entry.id)).toEqual(['other']);
    expect(groups.get('backlog')).toEqual([]);
  });

  test('filters by project with null meaning all', () => {
    const tasks = [task('a', 'backlog', { projectId: 'p1' }), task('b', 'backlog', { projectId: null })];
    expect(filterTasksByProject(tasks, 'p1').map((entry) => entry.id)).toEqual(['a']);
    expect(filterTasksByProject(tasks, null)).toHaveLength(2);
  });
});

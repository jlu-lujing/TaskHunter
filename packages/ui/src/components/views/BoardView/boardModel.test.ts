import { describe, expect, test } from 'bun:test';
import {
  BOARD_COLUMNS,
  BOARD_STATUSES,
  badgeStatusFor,
  boardColumnOf,
  filterTasksByProject,
  groupTasksByColumn,
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
  test('renders five human columns and orders newest-touched first', () => {
    expect(BOARD_COLUMNS.map((column) => column.id)).toEqual([
      'backlog', 'inProgress', 'review', 'done', 'blocked',
    ]);
    const groups = groupTasksByColumn([
      task('old', 'queued', { updatedAt: 5 }),
      task('new', 'running', { updatedAt: 9 }),
      task('other', 'checking'),
    ]);
    expect([...groups.keys()]).toEqual(BOARD_COLUMNS.map((column) => column.id));
    expect(groups.get('inProgress')?.map((entry) => entry.id)).toEqual(['new', 'old', 'other']);
    expect(groups.get('backlog')).toEqual([]);
  });

  test('every status maps to exactly one column', () => {
    for (const status of BOARD_STATUSES) {
      expect(BOARD_COLUMNS.filter((column) => column.statuses.includes(status))).toHaveLength(1);
      expect(boardColumnOf(status).statuses).toContain(status);
    }
  });

  test('agent stages badge their exact status, human columns do not', () => {
    expect(badgeStatusFor('planning')).toBe('planning');
    expect(badgeStatusFor('queued')).toBe('queued');
    expect(badgeStatusFor('running')).toBe('running');
    expect(badgeStatusFor('checking')).toBe('checking');
    expect(badgeStatusFor('merging')).toBe('merging');
    expect(badgeStatusFor('backlog')).toBeNull();
    expect(badgeStatusFor('review')).toBeNull();
    expect(badgeStatusFor('done')).toBeNull();
    expect(badgeStatusFor('blocked')).toBeNull();
  });

  test('filters by project with null meaning all', () => {
    const tasks = [task('a', 'backlog', { projectId: 'p1' }), task('b', 'backlog', { projectId: null })];
    expect(filterTasksByProject(tasks, 'p1').map((entry) => entry.id)).toEqual(['a']);
    expect(filterTasksByProject(tasks, null)).toHaveLength(2);
  });
});

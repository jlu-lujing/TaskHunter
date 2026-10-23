import { describe, expect, test } from 'bun:test';
import { boardTargetOfUrl, isSameRepositoryItemLink } from './openOnBoard';

describe('boardTargetOfUrl', () => {
  test('names the board tab a link belongs on', () => {
    expect(boardTargetOfUrl('https://github.com/openchamber/openchamber/pull/4500')).toEqual({ source: 'repository', kind: 'pull' });
    expect(boardTargetOfUrl('https://github.com/openchamber/openchamber/issues/4483')).toEqual({ source: 'repository', kind: 'issue' });
    expect(boardTargetOfUrl('https://gitlab.com/group/sub/app/-/merge_requests/7')).toEqual({ source: 'repository', kind: 'pull' });
    expect(boardTargetOfUrl('https://gitlab.com/group/sub/app/-/issues/3')).toEqual({ source: 'repository', kind: 'issue' });
    expect(boardTargetOfUrl('https://linear.app/openchamber/issue/ope-282/some-title')).toEqual({ source: 'linear', identifier: 'OPE-282' });
  });

  test('leaves anything else to the browser', () => {
    expect(boardTargetOfUrl('#12')).toBeNull();
    expect(boardTargetOfUrl('https://example.com/tickets/12')).toBeNull();
    expect(boardTargetOfUrl('https://github.com/openchamber/openchamber')).toBeNull();
  });
});

describe('isSameRepositoryItemLink', () => {
  test('matches the item a link names, whatever page of it the link opens', () => {
    const pull = 'https://github.com/BendingSpoons/athena/pull/2553';
    expect(isSameRepositoryItemLink(pull, 'https://github.com/bendingspoons/athena/pull/2553/files')).toBe(true);
    expect(isSameRepositoryItemLink(pull, 'https://github.com/BendingSpoons/athena/issues/2553')).toBe(true);
    expect(isSameRepositoryItemLink(pull, 'https://github.com/BendingSpoons/athena/pull/2566')).toBe(false);
    expect(isSameRepositoryItemLink(pull, 'https://github.com/other/athena/pull/2553')).toBe(false);
  });

  test('tells GitLab issues and merge requests apart', () => {
    const request = 'https://gitlab.com/group/app/-/merge_requests/7';
    expect(isSameRepositoryItemLink(request, 'https://gitlab.com/group/app/-/merge_requests/7/diffs')).toBe(true);
    expect(isSameRepositoryItemLink(request, 'https://gitlab.com/group/app/-/issues/7')).toBe(false);
    expect(isSameRepositoryItemLink('#7', '#7')).toBe(false);
  });
});

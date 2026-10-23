import { describe, expect, test } from 'bun:test';

import { orderMobileWorkspaceTabs, shownMobileWorkspaceTabs, stripMobileWorkspaceTabs } from './mobileWorkspaceTabs';

describe('mobile workspace tabs', () => {
  test('a saved order keeps its tabs first and appends tabs it does not name', () => {
    expect(orderMobileWorkspaceTabs(['terminal', 'gone', 'changes', 'terminal'])).toEqual(['terminal', 'changes', 'files', 'notes', 'mcp']);
    expect(orderMobileWorkspaceTabs([])).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp']);
  });

  test('hidden tabs leave the strip, but never all of them', () => {
    expect(shownMobileWorkspaceTabs(['files'], ['changes', 'mcp'])).toEqual(['files', 'terminal', 'notes']);
    expect(shownMobileWorkspaceTabs([], ['changes', 'files', 'terminal', 'notes', 'mcp'])).toEqual(['changes', 'files', 'terminal', 'notes', 'mcp']);
  });

  test('a hidden tab something opened stays in the strip, in its place, while it is open', () => {
    expect(stripMobileWorkspaceTabs([], ['files', 'terminal'], 'files')).toEqual(['changes', 'files', 'notes', 'mcp']);
    expect(stripMobileWorkspaceTabs([], ['files', 'terminal'], 'notes')).toEqual(['changes', 'notes', 'mcp']);
  });
});

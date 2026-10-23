import { beforeEach, describe, expect, test } from 'bun:test';

import { useUIStore } from './useUIStore';

describe('useUIStore mobile workspace tabs', () => {
  beforeEach(() => {
    useUIStore.setState({ mobileWorkspaceTabOrder: [], mobileWorkspaceHiddenTabs: [] });
  });

  test('hides and shows tabs, but never the last one shown', () => {
    const { setMobileWorkspaceTabVisible } = useUIStore.getState();
    for (const tab of ['changes', 'files', 'terminal', 'notes'] as const) setMobileWorkspaceTabVisible(tab, false);
    expect(useUIStore.getState().mobileWorkspaceHiddenTabs).toEqual(['changes', 'files', 'terminal', 'notes']);

    setMobileWorkspaceTabVisible('mcp', false);
    expect(useUIStore.getState().mobileWorkspaceHiddenTabs).toEqual(['changes', 'files', 'terminal', 'notes']);

    setMobileWorkspaceTabVisible('files', true);
    expect(useUIStore.getState().mobileWorkspaceHiddenTabs).toEqual(['changes', 'terminal', 'notes']);
  });

  test('stores a full order of known tabs', () => {
    useUIStore.getState().setMobileWorkspaceTabOrder(['mcp', 'unknown', 'mcp', 'files']);
    expect(useUIStore.getState().mobileWorkspaceTabOrder).toEqual(['mcp', 'files', 'changes', 'terminal', 'notes']);
  });
});

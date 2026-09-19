import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';
import { navigateToLatestUnreadSession } from './sessionUnreadNavigation';
import { useNotificationStore, type Notification } from '@/sync/notification-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';

const session = (id: string): Session => ({
  id,
  title: id,
  directory: '/repo',
  projectID: 'p1',
  version: '1',
  time: { created: 1, updated: 1 },
} as Session);

const notification = (
  sessionId: string,
  ageMs: number,
  viewed = false,
  type: 'turn-complete' | 'error' = 'turn-complete',
): Notification => ({ directory: '/repo', session: sessionId, time: Date.now() - ageMs, viewed, type });

// Append through the store's own path so the unseen index matches the list.
const setUnread = (list: Notification[]) => {
  useNotificationStore.setState({
    list: [],
    index: {
      session: { unseenCount: {}, unseenHasError: {} },
      project: { unseenCount: {}, unseenHasError: {} },
    },
  });
  list.forEach((entry) => useNotificationStore.getState().append(entry));
};

describe('navigateToLatestUnreadSession', () => {
  test('jumps to the session with the newest unviewed notification', () => {
    useGlobalSessionsStore.setState({ activeSessions: [session('s1'), session('s2'), session('s3')] });
    useSessionUIStore.setState({ currentSessionId: 's1' });
    setUnread([
      notification('s2', 200),
      notification('s3', 100),
    ]);

    expect(navigateToLatestUnreadSession()).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s3');
  });

  test('opening the session marks it viewed, so the next press lands on the older one', () => {
    // Continues from the previous test: s3's viewed flag was set by opening it.
    expect(navigateToLatestUnreadSession()).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s2');
    expect(navigateToLatestUnreadSession()).toBe(false);
  });

  test('error notifications count as unread completions', () => {
    useSessionUIStore.setState({ currentSessionId: 's1' });
    setUnread([notification('s3', 300, false, 'error')]);

    expect(navigateToLatestUnreadSession()).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s3');
  });

  test('viewed notifications and the currently open session are skipped', () => {
    useSessionUIStore.setState({ currentSessionId: 's2' });
    setUnread([
      notification('s2', 400),
      notification('s3', 350, true),
    ]);

    expect(navigateToLatestUnreadSession()).toBe(false);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s2');
  });

  test('unread notifications for sessions no longer loaded are skipped', () => {
    useSessionUIStore.setState({ currentSessionId: 's1' });
    useGlobalSessionsStore.setState({ activeSessions: [session('s1'), session('s2')] });
    setUnread([
      notification('s2', 600),
      notification('gone', 500),
    ]);

    expect(navigateToLatestUnreadSession()).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s2');
  });
});

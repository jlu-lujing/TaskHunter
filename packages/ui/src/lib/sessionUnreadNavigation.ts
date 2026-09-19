import { useNotificationStore } from '@/sync/notification-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

// Jumps to the most recently finished session the user has not looked at — the
// one-a-glance gesture for a remote control: a turn completed or errored while
// attention was elsewhere, and one press lands there. "Unread" is the same
// signal the sidebar badge uses: an unviewed turn-complete or error
// notification, so both outcomes count. Opening the session marks it viewed,
// which clears its badge and moves the next press on to the next one.
//
// Newest-first by notification time, not session order: the point is the last
// thing that finished, which is where the unattended work landed most recently.

/**
 * Switches to the session with the newest unviewed turn-complete/error
 * notification. Returns false when nothing is unread or that session is no
 * longer in the loaded list.
 */
export const navigateToLatestUnreadSession = (): boolean => {
  const notifications = useNotificationStore.getState().list;
  const sessionsById = new Map(
    useGlobalSessionsStore.getState().activeSessions.map((session) => [session.id, session] as const),
  );
  const currentSessionId = useSessionUIStore.getState().currentSessionId;

  for (let index = notifications.length - 1; index >= 0; index -= 1) {
    const notification = notifications[index];
    if (notification.viewed || !notification.session) continue;
    // A turn can finish in the session on screen; it is seen, not unread.
    if (notification.session === currentSessionId) continue;
    const session = sessionsById.get(notification.session);
    if (!session) continue;
    useSessionUIStore.getState().setCurrentSession(session.id, resolveGlobalSessionDirectory(session));
    return true;
  }
  return false;
};

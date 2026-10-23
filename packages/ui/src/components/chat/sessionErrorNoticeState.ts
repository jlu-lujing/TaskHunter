import type { Message } from '@/lib/opencode/model';

export type LastMessageState = {
  role: Message['role'];
  timestamp: number;
  hasError: boolean;
} | null;

/**
 * A store message as SessionErrorNotice reads it.
 *
 * Only an assistant message finishes a turn, so only its `time.completed`
 * counts. Every other role — a prompt, or any of v2's plumbing records — is
 * timed by its creation. Reading a non-assistant record's time as a completion
 * made every fresh send look unanswered since the epoch and flashed the
 * no-reply notice whenever the server acknowledged slower than a frame.
 */
export const readLastMessageState = (last: Message | null | undefined): LastMessageState => {
  if (!last) return null;
  if (last.role === 'assistant') {
    const completed = last.time.completed ?? 0;
    return {
      role: last.role,
      timestamp: completed > 0 ? completed : last.time.created,
      hasError: Boolean(last.error),
    };
  }
  return { role: last.role, timestamp: last.time.created, hasError: false };
};

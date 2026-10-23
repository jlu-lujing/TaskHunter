import { describe, expect, test } from 'bun:test';
import type { Message } from '@/lib/opencode/model';
import { readLastMessageState } from './sessionErrorNoticeState';

// A user message never finishes a turn, so a stray `completed` on one — older
// optimistic sends stamped `completed: 0` — must be ignored.
const optimisticUserMessage = {
  id: 'msg_1',
  sessionID: 'ses_1',
  role: 'user',
  time: { created: 1_000, completed: 0 },
} as Message;

const assistantMessage = (time: { created: number; completed?: number }): Message => ({
  id: 'msg_2',
  sessionID: 'ses_1',
  role: 'assistant',
  modelID: 'model',
  providerID: 'provider',
  agent: 'build',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time,
});

describe('readLastMessageState', () => {
  test('a stray completed: 0 on a user message is ignored in favour of created', () => {
    expect(readLastMessageState(optimisticUserMessage)).toEqual({ role: 'user', timestamp: 1_000, hasError: false });
  });

  test('an unfinished assistant message uses created, a finished one uses completed', () => {
    expect(readLastMessageState(assistantMessage({ created: 1_000 }))?.timestamp).toBe(1_000);
    expect(readLastMessageState(assistantMessage({ created: 1_000, completed: 2_000 }))?.timestamp).toBe(2_000);
  });

  test('no message yields no state', () => {
    expect(readLastMessageState(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { createAgentEventBus } from './events.js';
import { AgentEventType } from './types.js';

describe('agent event bus', () => {
  it('publishes OpenCode-shaped payloads to subscribers', () => {
    const bus = createAgentEventBus();
    const seen = [];
    const unsubscribe = bus.subscribe((entry) => {
      seen.push(entry);
    });
    const entry = bus.publish(AgentEventType.SESSION_STATUS, { sessionID: 'bse_1', status: { type: 'busy' } }, '/proj');

    expect(seen).toHaveLength(1);
    expect(entry.payload).toEqual({ type: 'session.status', properties: { sessionID: 'bse_1', status: { type: 'busy' } } });
    expect(entry.envelope.directory).toBe('/proj');
    expect(typeof entry.envelope.eventId).toBe('string');

    unsubscribe();
    bus.publish(AgentEventType.SESSION_IDLE, { sessionID: 'bse_1' }, '/proj');
    expect(seen).toHaveLength(1);
  });

  it('defaults missing directories to global', () => {
    const bus = createAgentEventBus();
    const entry = bus.publish(AgentEventType.SESSION_IDLE, { sessionID: 'bse_1' });
    expect(entry.envelope.directory).toBe('global');
  });

  it('rejects invalid publish inputs', () => {
    const bus = createAgentEventBus();
    expect(() => bus.publish('', {}, '/proj')).toThrow();
    expect(() => bus.publish(AgentEventType.SESSION_IDLE, null, '/proj')).toThrow();
    expect(() => bus.subscribe(null)).toThrow();
  });

  it('replays entries after a known event id with directory filtering', () => {
    const bus = createAgentEventBus();
    const first = bus.publish(AgentEventType.SESSION_STATUS, { sessionID: 'a', status: { type: 'busy' } }, '/one');
    bus.publish(AgentEventType.SESSION_STATUS, { sessionID: 'b', status: { type: 'busy' } }, '/two');
    bus.publish(AgentEventType.SESSION_IDLE, { sessionID: 'a' }, '/one');

    const after = bus.replayAfter(first.envelope.eventId);
    expect(after).toHaveLength(2);

    const filtered = bus.replayAfter(first.envelope.eventId, '/one');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].payload.type).toBe('session.idle');
  });

  it('replays nothing for unknown or missing event ids', () => {
    const bus = createAgentEventBus();
    bus.publish(AgentEventType.SESSION_IDLE, { sessionID: 'a' }, '/one');
    expect(bus.replayAfter('evt_missing')).toEqual([]);
    expect(bus.replayAfter('')).toEqual([]);
  });

  it('bounds the replay ring', () => {
    const bus = createAgentEventBus({ replayLimit: 3 });
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(bus.publish(AgentEventType.SESSION_IDLE, { sessionID: `s${i}` }, '/d').envelope.eventId);
    }
    // First two entries evicted; replaying after the oldest retained entry
    // yields the two newer ones.
    expect(bus.replayAfter(ids[0])).toEqual([]);
    expect(bus.replayAfter(ids[1])).toEqual([]);
    expect(bus.replayAfter(ids[2])).toHaveLength(2);
  });
});

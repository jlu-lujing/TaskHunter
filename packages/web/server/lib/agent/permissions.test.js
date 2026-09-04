import { describe, expect, it } from 'vitest';

import { createAgentEventBus } from './events.js';
import { createPermissionRegistry, PermissionReply } from './permissions.js';
import { AgentEventType } from './types.js';

const makeRegistry = () => {
  const events = createAgentEventBus();
  const published = [];
  const unsubscribe = events.subscribe((entry) => {
    published.push(entry.payload);
  });
  const registry = createPermissionRegistry({ events });
  return { registry, published, unsubscribe };
};

describe('permission registry', () => {
  it('blocks ask until a reply arrives and emits both events', async () => {
    const { registry, published } = makeRegistry();
    const pending = registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash', patterns: ['bash'] });

    expect(published).toHaveLength(1);
    expect(published[0].type).toBe(AgentEventType.PERMISSION_ASKED);
    expect(published[0].properties.permission).toBe('bash');

    const requestId = published[0].properties.id;
    expect(registry.reply(requestId, { reply: PermissionReply.ONCE })).toBe(true);
    await expect(pending).resolves.toBe(PermissionReply.ONCE);

    expect(published).toHaveLength(2);
    expect(published[1]).toEqual({
      type: AgentEventType.PERMISSION_REPLIED,
      properties: { sessionID: 'bse_1', requestID: requestId, reply: 'once' },
    });
  });

  it('rejects the waiter on reject replies', async () => {
    const { registry, published } = makeRegistry();
    const pending = registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash' });
    const requestId = published[0].properties.id;
    registry.reply(requestId, { reply: PermissionReply.REJECT });
    await expect(pending).rejects.toThrow(/rejected/i);
  });

  it('remembers always replies per session', async () => {
    const { registry, published } = makeRegistry();
    const first = registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash', patterns: ['bash:git *'] });
    registry.reply(published[0].properties.id, { reply: PermissionReply.ALWAYS });
    await expect(first).resolves.toBe(PermissionReply.ALWAYS);

    // Same pattern resolves immediately without publishing a new ask.
    await expect(
      registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash', patterns: ['bash:git *'] }),
    ).resolves.toBe(PermissionReply.ALWAYS);
    expect(published.filter((payload) => payload.type === AgentEventType.PERMISSION_ASKED)).toHaveLength(1);

    // Other sessions are unaffected.
    const other = registry.ask({ sessionID: 'bse_2', directory: '/proj', permission: 'bash', patterns: ['bash:git *'] });
    expect(published.filter((payload) => payload.type === AgentEventType.PERMISSION_ASKED)).toHaveLength(2);
    registry.reply(published[published.length - 1].properties.id, { reply: PermissionReply.ONCE });
    await expect(other).resolves.toBe(PermissionReply.ONCE);
  });

  it('lists pending requests with directory filtering', async () => {
    const { registry } = makeRegistry();
    registry.ask({ sessionID: 'bse_1', directory: '/one', permission: 'bash' });
    registry.ask({ sessionID: 'bse_2', directory: '/two', permission: 'read' });

    expect(registry.list()).toHaveLength(2);
    expect(registry.list({ directory: '/one' })).toHaveLength(1);
  });

  it('cancels pending session requests on cancelSession', async () => {
    const { registry } = makeRegistry();
    const pending = registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash' });
    const assertion = expect(pending).rejects.toThrow(/abort/i);
    expect(registry.cancelSession('bse_1')).toBe(1);
    await assertion;
    expect(registry.list()).toHaveLength(0);
  });

  it('aborts a single ask on signal', async () => {
    const { registry } = makeRegistry();
    const controller = new AbortController();
    const pending = registry.ask({ sessionID: 'bse_1', directory: '/proj', permission: 'bash', signal: controller.signal });
    const assertion = expect(pending).rejects.toThrow(/abort/i);
    controller.abort();
    await assertion;
  });

  it('returns false for unknown reply ids and rejects bad replies', () => {
    const { registry } = makeRegistry();
    expect(registry.reply('prm_missing', { reply: PermissionReply.ONCE })).toBe(false);
    expect(() => registry.reply('prm_missing', { reply: 'sometimes' })).toThrow();
  });

  it('rejects invalid ask inputs', async () => {
    const { registry } = makeRegistry();
    await expect(registry.ask({ sessionID: '', permission: 'bash' })).rejects.toThrow();
    await expect(registry.ask({ sessionID: 'bse_1', permission: '' })).rejects.toThrow();
  });
});

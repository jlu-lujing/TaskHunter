import { describe, expect, it, vi } from 'vitest';
import { applyForkInheritance, sourceOwnedLinksPatch } from './fork-inheritance.js';

const goal = (objectiveFile) => ({ id: 'goal_1', objective: objectiveFile ? '' : 'Ship it', objectiveFile, status: 'paused' });

const harness = (metadata, overrides = {}) => {
  const deps = {
    readObjective: vi.fn(async () => 'Objective from file'),
    writeObjective: vi.fn(async () => undefined),
    writeMetadata: vi.fn(async () => undefined),
    ...overrides,
  };
  const run = () => applyForkInheritance({ sourceSessionID: 'ses_source', fork: { id: 'ses_fork', metadata }, ...deps });
  return { deps, run };
};

describe('sourceOwnedLinksPatch', () => {
  it('pauses an active goal so the fork does not pursue it in parallel', () => {
    expect(sourceOwnedLinksPatch({ taskhunter: { goal: { id: 'g', status: 'active' } } }))
      .toEqual({ goal: { status: 'paused', statusReason: 'paused in fork' } });
    expect(sourceOwnedLinksPatch({ taskhunter: { goal: { id: 'g', status: 'complete' } } })).toBeNull();
  });

  it('removes the btw and review links but keeps the goal', () => {
    expect(sourceOwnedLinksPatch({ taskhunter: { goal: goal(false), btwSessionID: 'b', reviewSessionID: 'r' } }))
      .toEqual({ btwSessionID: null, reviewSessionID: null });
  });

  it('removes the btw marker of a btw source, keeps a review marker', () => {
    expect(sourceOwnedLinksPatch({ taskhunter: { kind: 'btw', originalSessionID: 'p', btwBoundaryMessageID: 'm' } }))
      .toEqual({ kind: null, originalSessionID: null, btwBoundaryMessageID: null });
    expect(sourceOwnedLinksPatch({ taskhunter: { kind: 'review', originalSessionID: 'p' } })).toBeNull();
    // A fork of a scheduled run is the user's own work again.
    expect(sourceOwnedLinksPatch({ taskhunter: { kind: 'scheduled' } })).toEqual({ kind: null });
    expect(sourceOwnedLinksPatch(undefined)).toBeNull();
  });
});

describe('applyForkInheritance', () => {
  it('does nothing for an inline goal without source links', async () => {
    const h = harness({ taskhunter: { goal: goal(false) } });
    await h.run();
    expect(h.deps.readObjective).not.toHaveBeenCalled();
    expect(h.deps.writeMetadata).not.toHaveBeenCalled();
  });

  it('copies a file-backed objective and strips source links', async () => {
    const h = harness({ taskhunter: { goal: goal(true), btwSessionID: 'b' } });
    await h.run();
    expect(h.deps.readObjective).toHaveBeenCalledWith('ses_source');
    expect(h.deps.writeObjective).toHaveBeenCalledWith('ses_fork', 'Objective from file');
    expect(h.deps.writeMetadata).toHaveBeenCalledWith('ses_fork', { taskhunter: { btwSessionID: null } });
  });

  it('inlines the objective when the file copy fails', async () => {
    const h = harness({ taskhunter: { goal: goal(true) } }, {
      writeObjective: vi.fn(async () => { throw new Error('disk full'); }),
    });
    await h.run();
    expect(h.deps.writeMetadata).toHaveBeenCalledWith('ses_fork', {
      taskhunter: { goal: { objective: 'Objective from file', objectiveFile: false } },
    });
  });

  it('swallows a metadata write failure', async () => {
    const h = harness({ taskhunter: { reviewSessionID: 'r' } }, {
      writeMetadata: vi.fn(async () => { throw new Error('offline'); }),
    });
    await expect(h.run()).resolves.toBeUndefined();
  });
});

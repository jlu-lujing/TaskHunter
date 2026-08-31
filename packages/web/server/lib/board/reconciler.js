const ACTIVE_SESSION_TYPES = new Set(['busy', 'retry']);
const DEFAULT_IDLE_GRACE_MS = 5 * 60_000;

/**
 * Board reconciler: the live channel between sessions/PRs and the board.
 * One pass — all dependencies injectable for tests —
 *  1. heartbeats claims whose session is still working (lease = watchdog),
 *  2. promotes cards whose session went idle past the grace to Review,
 *  3. refreshes PR/mergeability facts for dispatched and review cards,
 *  4. auto-queues green-review cards once GitHub says the PR is clean,
 *  5. drives the serial merge queue: one merge at a time, conflicts rebase
 *     up to mergeRetries, then the card goes blocked.
 */
export const createBoardReconciler = ({
  service,
  resolveProject,
  fetchSessionStatuses,
  fetchSession,
  resolvePr = async () => null,
  mergePr = async () => { throw new Error('merge not configured'); },
  updateBranch = async () => { throw new Error('update-branch not configured'); },
  now = () => Date.now(),
  idleGraceMs = DEFAULT_IDLE_GRACE_MS,
  log = console,
} = {}) => {
  if (!service) throw new Error('reconciler requires board service');

  let inflight = false;
  const mergeLock = { running: false };

  const normalizePr = (raw, repo = null) => {
    if (!raw || !raw.number) return null;
    return {
      number: raw.number,
      owner: repo?.owner ?? raw.base?.repo?.owner?.login ?? null,
      repo: repo?.repo ?? repo?.name ?? raw.base?.repo?.name ?? null,
      url: raw.html_url ?? null,
      state: raw.merged ? 'merged' : (raw.state ?? 'open'),
      merged: raw.merged === true,
      draft: raw.draft === true,
      mergeable: typeof raw.mergeable === 'boolean' ? raw.mergeable : null,
      checks: typeof raw.mergeable_state === 'string' ? raw.mergeable_state : 'unknown',
      headSha: raw.head?.sha ?? null,
    };
  };

  const settleReviewFromSession = async (task, project, timestamp) => {
    if (!fetchSession) return;
    const info = await fetchSession(task.lease.sessionId, task.lease.sessionDirectory ?? project.path).catch(() => null);
    const updated = Number(info?.time?.updated ?? info?.time?.created ?? 0);
    if (updated > 0 && timestamp - updated > idleGraceMs) {
      service.promoteToReview(task.id);
    }
  };

  const driveQueueItem = async (task, project, config) => {
    const queue = task.queue;
    const pr = task.pr;
    if (pr?.merged || pr?.state === 'merged') {
      service.markMerged(task.id);
      return;
    }
    if (!pr?.number || pr.state === 'closed') {
      service.blockTask(task.id, pr?.state === 'closed' ? 'pull request was closed' : 'pull request disappeared while queued');
      return;
    }
    if (pr.mergeable === null || pr.mergeable === undefined) return; // GitHub still computing
    const mergeRetries = config.mergeRetries ?? 2;

    if (pr.checks === 'dirty' || pr.checks === 'behind') {
      if ((queue.rebaseAttempts ?? 0) >= mergeRetries) {
        service.blockTask(task.id, `merge conflict after ${queue.rebaseAttempts ?? 0} rebase attempts`);
        return;
      }
      try {
        await updateBranch({ owner: pr.owner, repo: pr.repo, number: pr.number });
        service.setQueue(task.id, { ...queue, state: 'rebasing', rebaseAttempts: (queue.rebaseAttempts ?? 0) + 1 });
      } catch (error) {
        log.warn('[Board] update-branch failed:', error?.message ?? error);
      }
      return;
    }

    if (pr.mergeable && (pr.checks === 'clean' || pr.checks === 'unknown' && queue.state === 'merging')) {
      service.setQueue(task.id, { ...queue, state: 'merging' });
      try {
        await mergePr({ owner: pr.owner, repo: pr.repo, number: pr.number, sha: pr.headSha });
        service.markMerged(task.id);
      } catch (error) {
        if (error?.status === 405) {
          // Base moved between polling ticks: rebase and re-queue.
          try {
            await updateBranch({ owner: pr.owner, repo: pr.repo, number: pr.number });
            service.setQueue(task.id, { ...queue, state: 'rebasing', rebaseAttempts: (queue.rebaseAttempts ?? 0) + 1 });
          } catch (rebaseError) {
            log.warn('[Board] rebase-after-merge-conflict failed:', rebaseError?.message ?? rebaseError);
          }
        } else {
          // Transient API/network failure: fall back to queued, retried next tick.
          service.setQueue(task.id, { ...queue, state: 'queued' });
          log.warn('[Board] merge failed, will retry:', error?.message ?? error);
        }
      }
    }
  };

  const reconcilePass = async () => {
    if (inflight) return { skipped: true };
    inflight = true;
    try {
      const timestamp = now();
      const doc = service.loadDoc();
      const config = doc.config;
      const projects = new Map();
      const resolve = async (projectId) => {
        if (!projects.has(projectId)) {
          try {
            projects.set(projectId, await resolveProject(projectId));
          } catch {
            projects.set(projectId, null);
          }
        }
        return projects.get(projectId);
      };

      const statusCache = new Map();
      const statusesFor = async (directory) => {
        if (!statusCache.has(directory)) {
          statusCache.set(directory, await fetchSessionStatuses(directory).catch(() => null));
        }
        return statusCache.get(directory);
      };

      for (const task of doc.tasks) {
        if (task.status === 'in_progress' && task.lease?.sessionId) {
          const project = await resolve(task.projectId);
          if (!project) continue;
          // Board sessions run in worktrees; their status lives under the
          // session's own directory, not the project checkout.
          const statuses = await statusesFor(task.lease.sessionDirectory ?? project.path);
          const status = statuses?.[task.lease.sessionId];
          if (ACTIVE_SESSION_TYPES.has(status?.type)) {
            service.refreshLease(task.id, service.DEFAULT_LEASE_TTL_MS);
          } else if (status?.type === 'idle') {
            await settleReviewFromSession(task, project, timestamp);
          }
        }
      }

      // PR facts for anything that has a dispatch branch.
      for (const task of doc.tasks) {
        if (!task.branch || !['in_progress', 'review'].includes(task.status)) continue;
        if (task.pr?.merged) continue;
        const project = await resolve(task.projectId);
        if (!project) continue;
        const resolved = await resolvePr(project, task.branch).catch(() => null);
        const pr = resolved?.pr ? normalizePr(resolved.pr, resolved.repo) : null;
        if (pr && JSON.stringify(pr) !== JSON.stringify(task.pr)) {
          service.setPr(task.id, pr);
          task.pr = pr;
        }
      }

      // Green-review auto-queue, then drive queued items serially.
      for (const task of doc.tasks) {
        if (task.status !== 'review') continue;
        if (!task.queue && task.evaluation?.plan?.review === 'green'
          && task.pr?.number && !task.pr.draft && task.pr.mergeable === true && task.pr.checks === 'clean') {
          service.setQueue(task.id, { state: 'queued', enqueuedAt: timestamp, rebaseAttempts: 0 });
          task.queue = { state: 'queued' };
        }
      }

      if (!mergeLock.running) {
        const queued = doc.tasks
          .filter((task) => task.status === 'review' && task.queue)
          .sort((a, b) => (a.queue.enqueuedAt ?? 0) - (b.queue.enqueuedAt ?? 0));
        const next = queued[0];
        if (next) {
          mergeLock.running = true;
          try {
            const project = await resolve(next.projectId);
            if (project) await driveQueueItem(next, project, config);
          } finally {
            mergeLock.running = false;
          }
        }
      }

      return { ok: true };
    } finally {
      inflight = false;
    }
  };

  const startReconcileLoop = ({ intervalMs = 30_000, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval } = {}) => {
    const timer = setIntervalImpl(() => {
      reconcilePass().catch((error) => log.error('[Board] reconcile pass failed:', error));
    }, intervalMs);
    timer.unref?.();
    return () => clearIntervalImpl(timer);
  };

  return { reconcilePass, startReconcileLoop };
};

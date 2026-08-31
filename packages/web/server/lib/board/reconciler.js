const ACTIVE_SESSION_TYPES = new Set(['busy', 'retry']);
const DEFAULT_IDLE_GRACE_MS = 2 * 60_000;

/**
 * Board reconciler: the live channel that drives the agent pipeline.
 * Each pass (all dependencies injectable for tests):
 *  1. fills free slots from the queue (dispatch),
 *  2. heartbeats running claims whose worker session is still active,
 *  3. hands idle workers' cards to the delivery checker,
 *  4. re-activates cards whose session picked work back up, rebases
 *     conflicted PRs under check, and asks the checker to judge deliveries,
 *  5. refreshes PR/mergeability facts,
 *  6. drives the serial merge queue (one merge in flight).
 */
export const createBoardReconciler = ({
  service,
  resolveProject,
  fetchSessionStatuses,
  fetchSession,
  resolvePr = async () => null,
  dispatchPass = async () => ({ dispatched: [] }),
  checker = null,
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

  const statusFor = (statuses, task) => {
    if (!statuses || !task.sessionRef) return null;
    return statuses[task.sessionRef] ?? null;
  };

  const idlePastGrace = async (task, directory, timestamp) => {
    if (!fetchSession) return false;
    const info = await fetchSession(task.sessionRef, directory).catch(() => null);
    const updated = Number(info?.time?.updated ?? info?.time?.created ?? 0);
    return updated > 0 && timestamp - updated > idleGraceMs;
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
          statusCache.set(directory, await fetchSessionStatuses?.(directory).catch(() => null) ?? null);
        }
        return statusCache.get(directory);
      };

      // 1. Scheduler: queued cards into free slots.
      await dispatchPass();

      // 2/3/4. Running + checking transitions ride the live session channel.
      // Board sessions run in worktrees; status lives under the session's own
      // directory, so query that (sessionDirectoryRef) not the project checkout.
      const latest = service.loadDoc();
      for (const task of latest.tasks) {
        const project = await resolve(task.projectId);
        if (!project) continue;
        const directory = task.sessionDirectoryRef ?? project.path;

        if (task.status === 'running' && task.sessionRef) {
          const statuses = await statusesFor(directory);
          const status = statusFor(statuses, task);
          if (ACTIVE_SESSION_TYPES.has(status?.type)) {
            service.refreshLease(task.id, service.DEFAULT_LEASE_TTL_MS);
          } else if (status?.type === 'idle' && await idlePastGrace(task, directory, timestamp)) {
            service.enterChecking(task.id);
            task.status = 'checking';
          } else {
            continue;
          }
        }

        if (task.status === 'checking') {
          const statuses = await statusesFor(directory);
          const status = statusFor(statuses, task);
          if (ACTIVE_SESSION_TYPES.has(status?.type)) {
            // Self-heal feedback (or the human) woke the worker up again.
            service.backToRunning(task.id);
            continue;
          }
          if (!checker) continue;
          const current = latest.tasks.find((entry) => entry.id === task.id);
          if (!current) continue;
          if (current.pr?.number && !current.pr.merged && current.pr.mergeable === false
            && ['behind', 'dirty'].includes(current.pr.checks)) {
            await checker.attemptRebase(current).catch((error) => log.warn('[Board] checker rebase pass failed:', error?.message ?? error));
            continue;
          }
          try {
            await checker.checkTask(current, project, config);
          } catch (error) {
            log.warn('[Board] delivery check failed:', task.id, error?.message ?? error);
            service.setCheck(task.id, { stage: 'check-error', at: timestamp, error: String(error?.message ?? error).slice(0, 300) });
          }
        }
      }

      // 5. PR facts for anything that has a dispatch branch.
      const factDoc = service.loadDoc();
      for (const task of factDoc.tasks) {
        if (!task.branch || !['running', 'checking', 'review', 'merging'].includes(task.status)) continue;
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

      // 6. Merge queue: strictly one merge in flight, oldest first.
      if (!mergeLock.running) {
        const mergeDoc = service.loadDoc();
        const queued = mergeDoc.tasks
          .filter((task) => task.status === 'merging' && task.queue)
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

    if (pr.mergeable && (pr.checks === 'clean' || (pr.checks === 'unknown' && queue.state === 'merging'))) {
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
          // Transient API/network failure: retried next tick.
          service.setQueue(task.id, { ...queue, state: 'queued' });
          log.warn('[Board] merge failed, will retry:', error?.message ?? error);
        }
      }
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

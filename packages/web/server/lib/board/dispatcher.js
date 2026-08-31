import { TaskHunterControlError } from '../taskhunter-control/error.js';
import {
  BOARD_PROMPT_IDS,
  DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS,
  DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS,
  renderBoardTemplate,
} from './prompts.js';

const WORKTREE_PREFIX = 'board';

/**
 * Board dispatcher: claims ready cards server-side — capacity gate, forced
 * worktree session through the TaskHunter session service, lease bookkeeping
 * — and recycles dead claims. Session state / PR write-back hooks plug in
 * here in later phases.
 */
export const createBoardDispatcher = ({
  service,
  sessionService,
  readSettingsFromDiskMigrated,
  sanitizeProjects,
  readPromptOverride,
  now = () => Date.now(),
} = {}) => {
  if (!service) throw new Error('dispatcher requires board service');
  if (!sessionService) throw new Error('dispatcher requires session service');

  const OVERRIDE_MAX = 20_000;
  const resolveTemplate = async (promptId, fallback) => {
    if (!readPromptOverride) return fallback;
    try {
      const override = await readPromptOverride(promptId);
      if (override && override.trim().length > 0 && override.length <= OVERRIDE_MAX) return override;
    } catch (error) {
      console.warn('[Board] dispatch prompt override read failed, using default:', error?.message ?? error);
    }
    return fallback;
  };

  const buildPrompt = async (task, plan) => {
    const parts = [task.title];
    if (task.description) parts.push(task.description);
    if (task.labels.length > 0) parts.push(`Labels: ${task.labels.join(', ')}`);
    if (plan) {
      const promptId = plan.deliverable === 'pr' ? BOARD_PROMPT_IDS.dispatchPr : BOARD_PROMPT_IDS.dispatchReport;
      const template = await resolveTemplate(
        promptId,
        plan.deliverable === 'pr' ? DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS : DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS,
      );
      parts.push(renderBoardTemplate(template, { goal_definition: plan.goalDefinition }));
    }
    return parts.join('\n\n');
  };

  const resolveProject = async (projectId) => {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    const project = projects.find((entry) => entry.id === projectId) ?? null;
    if (!project) {
      throw new TaskHunterControlError('Task project is no longer configured', 409);
    }
    return project;
  };

  const claimTask = async (taskId) => {
    const { config } = await service.list();
    const doc = service.loadDoc();
    const task = doc.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new TaskHunterControlError(`Task not found: ${taskId}`, 404);
    if (task.status !== 'ready') {
      throw new TaskHunterControlError(`Task is not ready (status: ${task.status})`, 409);
    }
    if (!task.projectId) {
      throw new TaskHunterControlError('Task needs a project before it can start', 409);
    }
    if (service.activeCount() >= config.maxConcurrent) {
      throw new TaskHunterControlError(`Concurrency limit reached (${config.maxConcurrent})`, 409);
    }
    const project = await resolveProject(task.projectId);

    // Reserve first: a crashed/dispatched twin cannot double-spawn this task.
    service.claim(taskId, { leaseTtlMs: service.DEFAULT_LEASE_TTL_MS });

    const shortId = taskId.replace(/^t_/, '').slice(0, 8);
    const plan = task.evaluation && task.evaluation.status === 'done' ? task.evaluation.plan : null;
    // Board work always isolates in a worktree; main stays untouched.
    const createPayload = {
      directory: project.path,
      prompt: await buildPrompt(task, plan),
      title: task.title,
      worktree: {
        name: `${WORKTREE_PREFIX}-${shortId}`,
        branchName: `taskhunter/${WORKTREE_PREFIX}-${shortId}`,
      },
    };
    if (config.defaultModel) {
      createPayload.model = config.defaultModel;
    }
    // Report deliverables run as audited goal sessions; PR work stays a
    // normal session so the human/merge-queue review gate applies.
    if (plan && plan.deliverable === 'report') {
      createPayload.goal = true;
    }

    let created;
    try {
      created = await sessionService.create(createPayload);
    } catch (error) {
      try {
        service.abortClaim(taskId);
      } catch {
        // Preserve the original failure for the caller.
      }
      throw error;
    }

    const { task: linked } = service.linkSession(taskId, created.sessionId);
    const result = {
      task: linked,
      sessionId: created.sessionId,
      sessionDirectory: created.directory,
    };
    if (created.worktree) {
      result.worktree = created.worktree;
    }
    return result;
  };

  /**
   * One reclaim pass: cards whose lease died go back to ready (or blocked
   * past maxAttempts). Returns what moved so callers can notify.
   */
  const reclaimPass = () => service.releaseStaleClaims({ now: now() });

  const startReclaimLoop = ({ intervalMs = 30_000, setIntervalImpl = setInterval, clearIntervalImpl = clearInterval } = {}) => {
    const timer = setIntervalImpl(() => {
      try {
        reclaimPass();
      } catch (error) {
        console.error('[Board] reclaim pass failed:', error);
      }
    }, intervalMs);
    timer.unref?.();
    return () => clearIntervalImpl(timer);
  };

  return { claimTask, reclaimPass, startReclaimLoop };
};

import { generateSmallModelText } from '../small-model/index.js';
import { TaskHunterControlError } from '../taskhunter-control/error.js';

/**
 * Strict JSON schema for a launch plan. One-shot structured output — no
 * session, no tools; the judge sees only the card text.
 */
export const LAUNCH_PLAN_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['goalDefinition', 'deliverable', 'review', 'rationale'],
  properties: {
    goalDefinition: { type: 'string', description: 'Completion criteria an auditor judges against. Keep file paths, commands and identifiers verbatim. At most 1200 characters.' },
    deliverable: { type: 'string', enum: ['pr', 'report'] },
    review: { type: 'string', enum: ['human', 'green'] },
    rationale: { type: 'string', description: 'One short sentence explaining the judgement.' },
  },
});

const EVALUATOR_SYSTEM = [
  'You are the launch evaluator for a TaskHunter kanban board. From the task card alone (no repository access), produce the launch plan.',
  'goalDefinition: the completion criteria an auditor will judge the finished work against — end goals, what must exist and work, how each major part is verified. Omit implementation steps. Preserve file paths, commands, and identifiers verbatim. Stay under 1200 characters. Write it in the same language as the task.',
  "deliverable: 'pr' when the outcome is a code change to the project (implemented on a branch, opened as a pull request); 'report' when the outcome is investigation, analysis, or writing answered directly in the conversation.",
  "review: 'green' only for low-risk, mechanical changes that are safe to merge automatically once CI is green; otherwise 'human'.",
  'rationale: one short sentence in the task language.',
].join('\n');

const EVALUATION_TIMEOUT_MS = 120_000;
const GOAL_MAX = 1200;
const RATIONALE_MAX = 300;

const asTrimmed = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

/** Defensive validation: strict schema should already guarantee shape. */
const parseLaunchPlan = (raw) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TaskHunterControlError('Evaluator returned unparseable JSON', 502);
  }
  const goalDefinition = asTrimmed(parsed.goalDefinition);
  const rationale = asTrimmed(parsed.rationale);
  if (!goalDefinition || !rationale) {
    throw new TaskHunterControlError('Evaluator plan is missing required fields', 502);
  }
  if (!['pr', 'report'].includes(parsed.deliverable)) {
    throw new TaskHunterControlError(`Evaluator plan has invalid deliverable: ${parsed.deliverable}`, 502);
  }
  if (!['human', 'green'].includes(parsed.review)) {
    throw new TaskHunterControlError(`Evaluator plan has invalid review: ${parsed.review}`, 502);
  }
  return {
    goalDefinition: goalDefinition.slice(0, GOAL_MAX),
    deliverable: parsed.deliverable,
    review: parsed.review,
    rationale: rationale.slice(0, RATIONALE_MAX),
  };
};

/**
 * Board launch evaluator: turns a ready card into a launchPlan via one
 * structured LLM call. Runs on the board default model when configured,
 * otherwise falls back to the small-model resolution.
 */
export const createBoardEvaluator = ({
  service,
  generate = generateSmallModelText,
  now = () => Date.now(),
} = {}) => {
  if (!service) throw new Error('evaluator requires board service');

  const evaluateTask = async (taskId) => {
    const doc = service.loadDoc();
    const task = doc.tasks.find((entry) => entry.id === taskId);
    if (!task) throw new TaskHunterControlError(`Task not found: ${taskId}`, 404);

    service.startEvaluation(taskId);

    const { config } = await service.list();
    const cardText = [
      `Title: ${task.title}`,
      task.description ? `Description:\n${task.description}` : '',
      task.labels.length > 0 ? `Labels: ${task.labels.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');

    const generateOptions = {
      prompt: cardText,
      system: EVALUATOR_SYSTEM,
      responseSchema: LAUNCH_PLAN_SCHEMA,
      timeoutMs: EVALUATION_TIMEOUT_MS,
    };
    if (config.defaultModel) {
      generateOptions.model = config.defaultModel;
    }

    try {
      const generated = await generate(generateOptions);
      const plan = parseLaunchPlan(generated.text);
      plan.evaluatedBy = `${generated.providerID}/${generated.modelID}`;
      plan.evaluatedAt = now();
      const { task: done } = service.completeEvaluation(taskId, plan);
      return { task: done };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        service.failEvaluation(taskId, message);
      } catch {
        // Card moved out of the running state meanwhile; keep the original error.
      }
      throw error;
    }
  };

  return { evaluateTask };
};

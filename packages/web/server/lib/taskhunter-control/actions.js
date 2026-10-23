/**
 * Two capabilities, two tools.
 *
 * Controlling sessions and driving a page are different intents, and a single
 * tool description covering both is vaguer than either — which is how a model
 * ends up calling the wrong one. Separate tools also mean turning one off
 * removes it entirely, parameters included, rather than leaving its inputs
 * visible in a shared schema.
 */
export const TASKHUNTER_CONTROL_ACTION_DEFINITIONS = Object.freeze([
  { action: 'projects.list', title: 'List configured projects', description: 'No parameters' },
  { action: 'models.list', title: 'Show model preferences', description: 'Default, favorite and recent models; no parameters' },
  { action: 'models.search', title: 'Search models', description: 'The model catalog, favorites and recent models first; optional query, provider, all, limit, offset' },
  { action: 'session.list', title: 'List sessions', description: 'Optional limit, all, withStatus' },
  { action: 'session.create', title: 'Create a session', description: 'In this directory by default; prompt optional' },
  { action: 'session.send', title: 'Send a prompt', description: 'New prompt to sessionId' },
  { action: 'session.fork', title: 'Fork a session', description: 'Fork sessionId at messageId; prompt optional' },
  { action: 'session.status', title: 'Check session status', description: 'Status of sessionId' },
  { action: 'session.messages', title: 'Read session messages', description: 'Text messages and sessionStatus of sessionId' },
  { action: 'session.moveToWorktree', title: 'Move a session into a new worktree', description: 'Move sessionId (default: this session) and its carry files into a new worktree, made the way the New worktree dialog makes one; requires worktree. Nothing moves when carry cannot be applied; directory is ignored' },
  { action: 'session.link', title: 'Link a change or issue to a session', description: 'Add link to sessionId (default: this session); the same link again updates its title. Only the user removes links' },
  { action: 'schedule.status', title: 'Check scheduler status', description: 'No parameters', agentExposed: false },
  { action: 'schedule.list', title: 'List scheduled tasks', description: 'Tasks and scheduler status' },
  { action: 'schedule.create', title: 'Create a scheduled task', description: 'Requires name, prompt, one schedule selector, and model unless targetSessionId is set, which keeps that session\'s model' },
  { action: 'schedule.update', title: 'Change a scheduled task', description: 'Change taskId in place, keeping its id and run state; pass only what changes' },
  { action: 'schedule.run', title: 'Run a scheduled task', description: 'Run taskId now' },
  { action: 'schedule.delete', title: 'Delete a scheduled task', description: 'Delete taskId' },
  { action: 'schedule.toggle', title: 'Enable or disable a scheduled task', description: 'Requires taskId and disabled' },
  { action: 'file.open', title: 'Show a file to the user', description: 'Put path in front of the user\'s file panel, for a result worth seeing: a screenshot, report, CSV, recording, generated page' },
]);

const TASKHUNTER_CONTROL_ACTIONS = Object.freeze(
  TASKHUNTER_CONTROL_ACTION_DEFINITIONS.map(({ action }) => action),
);

const AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS = TASKHUNTER_CONTROL_ACTION_DEFINITIONS
  .filter(({ agentExposed }) => agentExposed !== false);
const isScheduleAction = ({ action }) => action.startsWith('schedule.');

/**
 * The control service runs sessions and scheduled tasks alike, for the CLI
 * too, but agents get them as two tools: scheduling is its own intent, carries
 * ten inputs of its own, and the user can switch it off without losing
 * session control.
 */
export const TASKHUNTER_AGENT_TOOL_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter((definition) => !isScheduleAction(definition)),
);

export const TASKHUNTER_AGENT_TOOL_ACTIONS = Object.freeze(
  TASKHUNTER_AGENT_TOOL_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const TASKHUNTER_SCHEDULE_ACTION_DEFINITIONS = Object.freeze(
  AGENT_EXPOSED_CONTROL_ACTION_DEFINITIONS.filter(isScheduleAction),
);

export const TASKHUNTER_SCHEDULE_ACTIONS = Object.freeze(
  TASKHUNTER_SCHEDULE_ACTION_DEFINITIONS.map(({ action }) => action),
);

export const TASKHUNTER_WEB_ACTION_DEFINITIONS = Object.freeze([
  { action: 'browser.open', title: 'Open a page in the browser panel', description: 'Load url; without tabId into a new background tab, whose tabId the result returns for later actions. drivable false means display-only: no further actions there' },
  { action: 'browser.snapshot', title: 'Read the open page', description: 'url, title, visible text, interactive elements with selectors, logged errors, and open tabs with their ids and who opened each; selector reads one part' },
  { action: 'browser.click', title: 'Click on the open page', description: 'By selector, or text for a link or button label' },
  { action: 'browser.type', title: 'Type into the open page', description: 'Type value into selector' },
  { action: 'browser.scroll', title: 'Scroll the open page', description: 'By direction, or to bring selector into view' },
  { action: 'browser.back', title: 'Go back in the browser panel', description: 'No parameters' },
  { action: 'browser.forward', title: 'Go forward in the browser panel', description: 'No parameters' },
  { action: 'browser.inspect', title: 'Read how an element renders', description: 'Computed styles of selector as rendered' },
  { action: 'browser.capture', title: 'Save a screenshot of the page', description: 'Save the visible panel as an image in the project; returns its path to cite in your answer' },
  { action: 'browser.resize', title: 'Change the page viewport', description: 'Lay the page out at viewport; fill uses the whole panel' },
  { action: 'browser.close', title: 'Close a browser tab', description: 'Close a tab this session opened; without tabId, its most recent one. Never a tab the user opened' },
]);

export const TASKHUNTER_WEB_ACTIONS = Object.freeze(
  TASKHUNTER_WEB_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Memory is its own tool for the same reason web is: remembering across
 * sessions is a distinct intent from controlling one, and a shared description
 * would blur both. It also has to switch off cleanly and completely, which a
 * shared schema cannot do.
 *
 * The session already carries an index of stored titles and says to read an
 * entry before acting on it (../session-knowledge/runtime.js), so memory.read
 * takes a title as the index spells it and memory.list is for a missing or
 * stale index.
 */
export const TASKHUNTER_MEMORY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'memory.read', title: 'Read a stored memory', description: 'Full text of one memory; requires title or memoryId' },
  { action: 'memory.list', title: 'List stored memories', description: 'Titles, when the session index is missing or stale' },
  { action: 'memory.save', title: 'Remember something', description: 'Requires title, body, scope. Saving the same thing updates it; memoryId rewrites that entry, to correct one or merge several into it' },
  { action: 'memory.delete', title: 'Forget a memory', description: 'For a memory that turned out wrong or obsolete; requires memoryId and scope' },
]);

export const TASKHUNTER_MEMORY_ACTIONS = Object.freeze(
  TASKHUNTER_MEMORY_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Board worker receipts — the worker's side of the kanban.
 *
 * The board already infers progress from session liveness, but inference fails
 * on the three outcomes the worker itself knows best: finished, nothing to do,
 * externally blocked. These actions let it say so instead of idling into a
 * guess. They execute only when the calling session is the one bound to a
 * working card, so they are kept out of `TASKHUNTER_ALL_ACTIONS`: the CLI has
 * no worker-session context and must not see them. They ride the control
 * tool's schema because they use the same callback.
 */
export const TASKHUNTER_BOARD_ACTION_DEFINITIONS = Object.freeze([
  { action: 'board.finish', title: 'Report the card delivered', description: 'Call when every goal criterion is met and the deliverable exists; the board starts the delivery check immediately. Only available in sessions started from the board' },
  { action: 'board.noop', title: 'Report no change needed', description: 'Call when you determined the card needs no work; reason required. The card goes to human review instead of a delivery check' },
  { action: 'board.blocked', title: 'Report being blocked', description: 'Call when something outside this session stops you; reason required. The card needs human attention' },
]);

export const TASKHUNTER_BOARD_ACTIONS = Object.freeze(
  TASKHUNTER_BOARD_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Project knowledge is its own tool: keeping the Notes, Todos and Plans the
 * user sees in the panel is a distinct intent from running sessions, and the
 * user switches it off on its own without losing session control. One small
 * vocabulary with `kind` keeps the bare verbs unambiguous, the way memory's are.
 * Plans are markdown files, so reading one and small edits use the agent's
 * own file tools on the path list gives.
 */
export const TASKHUNTER_KNOWLEDGE_ACTION_DEFINITIONS = Object.freeze([
  { action: 'knowledge.list', title: 'List project knowledge', description: 'Notes with text, todos with state, plans with their file paths. List before adding, to avoid duplicates' },
  { action: 'knowledge.save', title: 'Save project knowledge', description: 'Requires kind and body; with id it replaces. A plan body is the whole markdown, and the answer gives its path. A todo update may send only completed' },
  { action: 'knowledge.delete', title: 'Delete project knowledge', description: 'Requires kind and id' },
  { action: 'knowledge.show', title: 'Show a plan to the user', description: 'Open a plan for the user to read, comment on and send to a session; requires kind plan and id' },
]);

export const TASKHUNTER_KNOWLEDGE_ACTIONS = Object.freeze(
  TASKHUNTER_KNOWLEDGE_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Notify is its own tool so it can stay off by default and disappear
 * completely: an agent that can page the user is a choice the user makes.
 */
export const TASKHUNTER_NOTIFY_ACTION_DEFINITIONS = Object.freeze([
  { action: 'notify.send', title: 'Notify the user', description: 'Requires title' },
]);

export const TASKHUNTER_NOTIFY_ACTIONS = Object.freeze(
  TASKHUNTER_NOTIFY_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Render is its own tool: a page drawn into the chat is a distinct intent from
 * any of the others, and its long layout guidance should cost context only for
 * users who keep it on. The page itself travels in the call's input, which the
 * chat already stores and syncs, so the action only checks it.
 */
export const TASKHUNTER_RENDER_ACTION_DEFINITIONS = Object.freeze([
  { action: 'render.page', title: 'Show a page', description: 'Requires html and title' },
]);

export const TASKHUNTER_RENDER_ACTIONS = Object.freeze(
  TASKHUNTER_RENDER_ACTION_DEFINITIONS.map(({ action }) => action),
);

/**
 * Which actions each managed tool may ask for.
 *
 * The callback needs this because models routinely drop the namespace: asked
 * for `memory.read` from a tool already called `taskhunter_memory`, they send
 * `read`, since the tool's own name appears to have said "memory" already. The
 * name is unambiguous inside one tool's action set even when it is not across
 * all of them (`delete` belongs to both schedule and memory), so resolution
 * starts from the tool that asked.
 */
const ACTIONS_BY_TOOL = Object.freeze({
  // Board receipts ride the control tool: same callback, and only board
  // sessions pass the server-side session-directory gate anyway.
  taskhunter: Object.freeze([...TASKHUNTER_AGENT_TOOL_ACTIONS, ...TASKHUNTER_BOARD_ACTIONS]),
  taskhunter_schedule: TASKHUNTER_SCHEDULE_ACTIONS,
  taskhunter_web: TASKHUNTER_WEB_ACTIONS,
  taskhunter_memory: TASKHUNTER_MEMORY_ACTIONS,
  taskhunter_knowledge: TASKHUNTER_KNOWLEDGE_ACTIONS,
  taskhunter_notify: TASKHUNTER_NOTIFY_ACTIONS,
  taskhunter_render: TASKHUNTER_RENDER_ACTIONS,
});

const bareName = (action) => {
  const separator = action.indexOf('.');
  return separator === -1 ? action : action.slice(separator + 1);
};

const uniqueMatch = (candidates, requested) => {
  const matches = candidates.filter((candidate) => bareName(candidate) === requested);
  return matches.length === 1 ? matches[0] : null;
};

/**
 * The canonical action for what a tool asked, or the reason it could not be
 * resolved. The reason lists what the tool can actually do: an error that only
 * says "unsupported" leaves the model to guess again, which is how one wrong
 * name becomes three.
 */
export const resolveAgentToolAction = (requested, toolName) => {
  const value = typeof requested === 'string' ? requested.trim() : '';
  const scoped = ACTIONS_BY_TOOL[toolName] ?? null;
  const known = scoped ?? TASKHUNTER_ALL_ACTIONS;

  if (value && known.includes(value)) {
    return { action: value };
  }
  if (value) {
    const resolved = uniqueMatch(known, value)
      // A tool that did not identify itself still gets the benefit when the
      // bare name means only one thing across every action.
      ?? (scoped ? null : uniqueMatch(TASKHUNTER_ALL_ACTIONS, value));
    if (resolved) {
      return { action: resolved };
    }
  }

  return {
    error: `Unsupported TaskHunter action: ${value || 'missing'}. Use one of: ${known.join(', ')}`,
  };
};

/** Everything the callback route will dispatch, whichever tool asked. */
export const TASKHUNTER_ALL_ACTIONS = Object.freeze([
  ...TASKHUNTER_CONTROL_ACTIONS,
  ...TASKHUNTER_WEB_ACTIONS,
  ...TASKHUNTER_MEMORY_ACTIONS,
  ...TASKHUNTER_KNOWLEDGE_ACTIONS,
  ...TASKHUNTER_NOTIFY_ACTIONS,
  ...TASKHUNTER_RENDER_ACTIONS,
]);

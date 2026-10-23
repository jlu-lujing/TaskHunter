import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});

const DIRECTORY = '/workspace/project';

type ListedAgent = {
  id: string;
  name: string;
  displayName: string;
  mode: string;
  hidden: boolean;
  request: { settings: Record<string, never>; headers: Record<string, never>; body: Record<string, never> };
  permissions: unknown[];
};

let listedAgents: ListedAgent[] = [];
let agentConfigResponses = new Map<string, unknown>();
const consumedConfigLookups: string[] = [];

const pathnameOf = (url: string): string => {
  try {
    return new URL(url, 'http://localhost/').pathname;
  } catch {
    return url;
  }
};

const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const path = pathnameOf(url);
  if (path.startsWith('/api/config/agents/')) {
    const name = decodeURIComponent(path.slice('/api/config/agents/'.length));
    const payload = agentConfigResponses.get(name);
    if (payload === undefined) {
      return Response.json({ error: 'no mocked config-entity response' }, { status: 404 });
    }
    consumedConfigLookups.push(name);
    return Response.json(payload);
  }
  // The SDK's agent list request. The config-entity route above already
  // consumed its own path prefix, so the remaining /agent hit is the list.
  if (path === '/agent' || path.endsWith('/agent')) {
    return Response.json({ data: listedAgents });
  }
  // The store import chain probes location and sessions for system info;
  // well-shaped empty answers keep that background probing quiet.
  if (path.includes('/location')) {
    return Response.json({ directory: DIRECTORY, project: { directory: DIRECTORY } });
  }
  if (path.includes('/session')) {
    return Response.json({ data: [], pagination: {} });
  }
  return Response.json({ data: [] });
});

const { useAgentsStore, invalidateAgentsLoadCache, isAgentBuiltIn } = await import('@/stores/useAgentsStore');

const sdkAgent = (name: string, mode: 'primary' | 'subagent'): ListedAgent => ({
  id: name,
  name,
  displayName: name,
  mode,
  hidden: false,
  request: { settings: {}, headers: {}, body: {} },
  permissions: [],
});

beforeEach(() => {
  listedAgents = [];
  agentConfigResponses = new Map();
  consumedConfigLookups.length = 0;
  invalidateAgentsLoadCache(DIRECTORY);
  useAgentsStore.setState({ agents: [], agentsByDirectory: {}, isLoading: false });
});

afterAll(() => {
  fetchSpy.mockRestore();
  browser.close();
});

describe('useAgentsStore built-in classification', () => {
  test('an agent with no md or json source is classified as built-in', async () => {
    listedAgents = [sdkAgent('build', 'primary'), sdkAgent('deploy', 'subagent')];
    agentConfigResponses.set('build', {
      name: 'build',
      scope: null,
      sources: { md: { exists: false }, json: { exists: false } },
      isBuiltIn: true,
    });
    agentConfigResponses.set('deploy', {
      name: 'deploy',
      scope: 'user',
      sources: { md: { exists: true, scope: 'user', path: '/home/u/.config/opencode/agents/deploy.md' } },
      isBuiltIn: false,
    });

    await useAgentsStore.getState().loadAgents(DIRECTORY);

    const agents = useAgentsStore.getState().agentsByDirectory[DIRECTORY] ?? [];
    const build = agents.find((agent) => agent.name === 'build');
    const deploy = agents.find((agent) => agent.name === 'deploy');

    expect(consumedConfigLookups).toEqual(['build', 'deploy']);
    expect(build && isAgentBuiltIn(build)).toBe(true);
    expect(deploy && isAgentBuiltIn(deploy)).toBe(false);
  });

  test('an agent defined in a config file stays custom', async () => {
    listedAgents = [sdkAgent('deploy', 'subagent')];
    agentConfigResponses.set('deploy', {
      name: 'deploy',
      scope: 'user',
      sources: { md: { exists: true, scope: 'user', path: '/home/u/.config/opencode/agents/deploy.md' } },
    });

    await useAgentsStore.getState().loadAgents(DIRECTORY);

    const agents = useAgentsStore.getState().agentsByDirectory[DIRECTORY] ?? [];
    const deploy = agents.find((agent) => agent.name === 'deploy');

    expect(consumedConfigLookups).toEqual(['deploy']);
    expect(deploy && isAgentBuiltIn(deploy)).toBe(false);
  });

  test('a config-entity response without isBuiltIn keeps the agent custom', async () => {
    listedAgents = [sdkAgent('build', 'primary')];
    agentConfigResponses.set('build', {
      name: 'build',
      scope: null,
      sources: { md: { exists: false }, json: { exists: false } },
    });

    await useAgentsStore.getState().loadAgents(DIRECTORY);

    const agents = useAgentsStore.getState().agentsByDirectory[DIRECTORY] ?? [];
    const build = agents.find((agent) => agent.name === 'build');

    expect(consumedConfigLookups).toEqual(['build']);
    expect(build && isAgentBuiltIn(build)).toBe(false);
  });
});

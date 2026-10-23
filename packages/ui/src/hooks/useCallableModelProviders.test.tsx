import { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

test('asks again when the provider catalog changes and keeps the answer when a request fails', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = {
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node,
    Event: dom.Event, CustomEvent: dom.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const answers: Response[] = [];
  let smallModelRequests = 0;
  globalThis.fetch = Object.assign((input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname !== '/api/small-model') return new Promise<Response>(() => {});
    smallModelRequests += 1;
    return Promise.resolve(answers.shift() ?? new Response('{}', { status: 500 }));
  }, originalFetch);
  const callable = (providerIds: string[]) => new Response(JSON.stringify({ authenticatedProviders: providerIds }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const { createRoot } = await import('react-dom/client');
  const { useConfigStore } = await import('@/stores/useConfigStore');
  const { useCallableModelProviders } = await import('./useCallableModelProviders');
  let providerIds: string[] | undefined;
  function Harness() {
    providerIds = useCallableModelProviders();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const replaceCatalog = (id: string) => act(async () => {
    useConfigStore.setState({ providers: [{ id, name: id, activation: 'auto', package: id, models: [] }] });
  });

  try {
    // OpenCode is still starting: the first answer is empty.
    answers.push(callable([]));
    await act(async () => { root.render(<Harness />); });
    expect(providerIds).toEqual([]);

    // The catalog arrives, and the picker learns about the provider.
    answers.push(callable(['openai']));
    await replaceCatalog('openai');
    expect(smallModelRequests).toBe(2);
    expect(providerIds).toEqual(['openai']);

    // A failed request is no evidence the provider went away.
    await replaceCatalog('openai-again');
    expect(smallModelRequests).toBe(3);
    expect(providerIds).toEqual(['openai']);
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * Loads the chat bubbles module graph with the app-wide singletons it touches
 * on import stubbed out, so a test can drive `ChatBubbles.prototype` methods
 * on a hand-built harness. Import this helper before anything from that graph:
 * its `vi.mock`s only reach the modules loaded after it.
 */

const moduleMocks = vi.hoisted(() => {
  const noop = vi.fn();
  return {
    apiManagerProxy: new Proxy({}, {get: () => noop}),
    sidebarLeft: new Proxy({}, {get: () => noop}),
    sidebarRight: new Proxy({}, {get: () => noop}),
    rootScope: {
      myId: 0,
      premium: false,
      managers: new Proxy({}, {get: () => ({})}),
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: noop,
      dispatchEventSingle: noop
    }
  };
});

vi.mock('@lib/apiManagerProxy', () => ({default: moduleMocks.apiManagerProxy}));
vi.mock('@components/sidebarLeft', () => ({default: moduleMocks.sidebarLeft}));
vi.mock('@components/sidebarRight', () => ({default: moduleMocks.sidebarRight}));
vi.mock('@lib/rootScope', () => ({default: moduleMocks.rootScope}));
vi.mock('@stores/contentSettings', () => ({
  default: () => ({
    sensitiveEnabled: () => false,
    sensitiveCanChange: () => false,
    needAgeVerification: () => false,
    ageVerified: () => false,
    ignoreRestrictionReasons: (): string[] => []
  })
}));
vi.mock('@stores/stars', () => ({default: () => () => 0}));

/**
 * Importing the whole bubbles graph costs far more than the default hook
 * budget once the rest of the suite is competing for the same CPU — give the
 * `beforeAll` that calls this one.
 */
export const LOAD_CHAT_BUBBLES_TIMEOUT = 60_000;

export async function loadChatBubbles() {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class WorkerMock {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    start() {}
    terminate() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.stubGlobal('Worker', WorkerMock);
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
  vi.stubGlobal('CSS', {supports: () => false, escape: (value: string) => value});
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

  const bubbles = await import('@components/chat/bubbles');
  const bubbleGroups = await import('@components/chat/bubbleGroups');
  return {bubbles, BubbleGroups: bubbleGroups.default};
}

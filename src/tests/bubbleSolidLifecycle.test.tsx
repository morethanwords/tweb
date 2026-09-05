import type {Message, PeerSettings} from '@layer';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import {render} from 'solid-js/web';
import ejectBubble from '@components/chat/bubbles/ejectBubble';
import {markMessageLinkEntity} from '@lib/richTextProcessor/filterDisabledEntities';

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

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let BubbleGroups: typeof import('@components/chat/bubbleGroups').default;
let cancelPendingHiddenLinksEvent: typeof import('@components/chat/bubbles').cancelPendingHiddenLinksEvent;
let disposeChatInnerMiddlewareAfterDetach: typeof import('@components/chat/bubbles').disposeChatInnerMiddlewareAfterDetach;
let isBubbleUiCurrent: typeof import('@components/chat/bubbles').isBubbleUiCurrent;
let isTestPeerNonContactRequestCurrent: typeof import('@components/chat/bubbles').isTestPeerNonContactRequestCurrent;
let retainMessageLinkPolicyOnCleanup: typeof import('@components/chat/bubbles').retainMessageLinkPolicyOnCleanup;
let setBubbleHiddenLinksPending: typeof import('@components/chat/bubbles').setBubbleHiddenLinksPending;
let shouldForceHideNonContactLinkTest: typeof import('@components/chat/bubbles').shouldForceHideNonContactLinkTest;

beforeAll(async() => {
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
  ({
    default: ChatBubbles,
    cancelPendingHiddenLinksEvent,
    disposeChatInnerMiddlewareAfterDetach,
    isBubbleUiCurrent,
    isTestPeerNonContactRequestCurrent,
    retainMessageLinkPolicyOnCleanup,
    setBubbleHiddenLinksPending,
    shouldForceHideNonContactLinkTest
  } = await import('@components/chat/bubbles'));
  BubbleGroups = (await import('@components/chat/bubbleGroups')).default;
  // Importing the whole bubbles graph costs far more than the default hook
  // budget once the rest of the suite is competing for the same CPU.
}, 60_000);

afterEach(() => {
  document.body.replaceChildren();
});

const peerId = 10 as PeerId;

function message(): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: 100,
    mid: 100,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    date: 1,
    message: 'replacement'
  };
}

function streamedMessage(text: string): Message.message {
  return {
    ...message(),
    pFlags: {currentlyTyping: true},
    message: text
  };
}

function markGuardedMessageLink(anchor: HTMLAnchorElement) {
  markMessageLinkEntity(anchor, {
    _: 'messageEntityUrl',
    offset: 0,
    length: 1
  });
}

function makeTargetedEvent(type: string, target: Element) {
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'target', {value: target});
  return event;
}

function expectRetainedLinkEventsAllowed(...anchors: HTMLAnchorElement[]) {
  for(const anchor of anchors) {
    for(const type of ['click', 'auxclick', 'contextmenu', 'dragstart']) {
      const event = makeTargetedEvent(type, anchor);
      expect(cancelPendingHiddenLinksEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
  }
}

test('keeps an old Solid bubble alive until the queued replacement is ejected', async() => {
  const chatInner = document.createElement('div');
  const oldBubble = document.createElement('div');
  const oldHost = document.createElement('div');
  const oldMiddlewareHelper = getMiddleware();
  oldBubble.middlewareHelper = oldMiddlewareHelper;
  oldBubble.append(oldHost);
  chatInner.append(oldBubble);
  document.body.append(chatInner);

  const disposeOld = render(() => <span data-old-text="">old streamed text</span>, oldHost);
  oldMiddlewareHelper.onDestroy(disposeOld);
  const stableTextRoot = oldHost.firstElementChild;

  const renderMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const bubbles: Record<string, HTMLElement> = {};
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn(), getItemByBubble: vi.fn()},
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => renderMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => '10_100',
    renderMessage: vi.fn(({bubble, message, reverse}) => Promise.resolve({
      bubble,
      message,
      reverse,
      promises: []
    })),
    renderMessagesQueue: vi.fn(),
    log: {error: vi.fn()}
  }) as any;

  await harness.safeRenderMessage({message: message(), bubble: oldBubble});

  expect(oldBubble.isConnected).toBe(true);
  expect(oldHost.firstElementChild).toBe(stableTextRoot);
  expect(oldHost.textContent).toBe('old streamed text');
  const replacementBubble = bubbles['10_100'];
  expect(harness.bubblesToReplace.get(replacementBubble).source).toBe(oldBubble);

  harness.commitBubbleReplacements(new Set([replacementBubble]), undefined, []);

  expect(oldBubble.isConnected).toBe(false);
  expect(oldHost.childNodes).toHaveLength(0);
  renderMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test.each(['rejected', 'cancelled'] as const)(
  'destroys an unmounted bubble child and rolls back a %s render',
  async(outcome) => {
    const chatInner = document.createElement('div');
    const oldBubble = document.createElement('div');
    const bubbles: Record<string, HTMLElement> = {'10_100': oldBubble};
    const realMiddlewareHelper = getMiddleware();
    const chatDestroyMiddlewareHelper = getMiddleware();
    const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
    const disposed = vi.fn();
    let renderedBubble: HTMLElement;
    let resolveRender: () => void;
    let queuedRender: Promise<unknown>;
    chatInner.append(oldBubble);
    document.body.append(chatInner);

    const bubbleGroups = {changeBubbleByBubble: vi.fn()};
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      renderingMessages: new Set<string>(),
      bubbles,
      skippedMids: new Set<string>(),
      bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      bubbleGroups,
      chat: {isBotforum: false, peerId},
      chatInner,
      chatInnerMiddlewareHelper,
      managers: {},
      getMiddleware: () => realMiddlewareHelper.get(),
      getBubble: (fullMid: string) => bubbles[fullMid],
      makeFullMid: () => '10_100',
      renderMessage: vi.fn(({bubble, message, reverse}) => {
        renderedBubble = bubble;
        bubble.middlewareHelper.onDestroy(disposed);
        if(outcome === 'rejected') return Promise.reject(new Error('render failed'));
        return new Promise<void>((resolve) => resolveRender = resolve).then(() => ({
          bubble,
          message,
          reverse,
          promises: [] as Promise<unknown>[]
        }));
      }),
      renderMessagesQueue: vi.fn((promise) => queuedRender = promise),
      log: {error: vi.fn()}
    }) as any;

    const safeRenderPromise = harness.safeRenderMessage({message: message(), bubble: oldBubble});
    if(outcome === 'cancelled') {
      realMiddlewareHelper.clean();
      expect(disposed).toHaveBeenCalledOnce();
      resolveRender();
    }
    await safeRenderPromise;

    expect(await queuedRender).toBeUndefined();
    expect(renderedBubble.isConnected).toBe(false);
    expect(disposed).toHaveBeenCalledOnce();
    expect(bubbles['10_100']).toBe(oldBubble);
    expect(harness.skippedMids.has('10_100')).toBe(false);
    expect(harness.bubblesToReplace.size).toBe(0);
    expect(bubbleGroups.changeBubbleByBubble).toHaveBeenLastCalledWith(renderedBubble, oldBubble);

    realMiddlewareHelper.destroy();
    chatDestroyMiddlewareHelper.destroy();
  }
);

test.each(['resolved', 'rejected'] as const)(
  'keeps the ultimate visible source across a chained replacement that is %s',
  async(outcome) => {
    const fullMid = '10_100';
    const firstMessage = message();
    const latestMessage = {...message(), date: 172_801, fromId: 20 as PeerId};
    const chatInner = document.createElement('div');
    const oldBubble = document.createElement('div');
    const oldMiddlewareHelper = getMiddleware();
    const oldDisposed = vi.fn();
    const oldText = document.createElement('span');
    oldText.textContent = 'visible source';
    oldBubble.dataset.peerId = '' + peerId;
    oldBubble.dataset.mid = '100';
    oldBubble.middlewareHelper = oldMiddlewareHelper;
    oldMiddlewareHelper.onDestroy(oldDisposed);
    oldBubble.append(oldText);
    chatInner.append(oldBubble);
    document.body.append(chatInner);

    const realMiddlewareHelper = getMiddleware();
    const chatDestroyMiddlewareHelper = getMiddleware();
    const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
    const bubbles: Record<string, HTMLElement> = {[fullMid]: oldBubble};
    const candidates: HTMLElement[] = [];
    const candidateDisposed = [vi.fn(), vi.fn()];
    const group = {items: [] as unknown[], mount: vi.fn()};
    const item: {bubble: HTMLElement, group: typeof group, mounted: boolean} = {
      bubble: oldBubble,
      group,
      mounted: true
    };
    const batchGroups: typeof group[] = [];
    const repositionMessageBubble = vi.fn((_bubble: HTMLElement, nextMessage: Message.message, mount?: boolean) => {
      expect(mount).toBe(outcome === 'resolved' ? false : undefined);
      expect(nextMessage).toBe(latestMessage);
      item.group = group;
      item.mounted = false;
      return [group];
    });
    const bubbleGroups = {
      changeBubbleByBubble: vi.fn((from: HTMLElement, to: HTMLElement) => {
        if(item.bubble === from) item.bubble = to;
      }),
      getItemByBubble: (bubble: HTMLElement) => item.bubble === bubble ? item : undefined
    };
    let attempt = 0;
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      renderingMessages: new Set<string>(),
      bubbles,
      skippedMids: new Set<string>(),
      bubblesToReplace: new Map(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      bubbleGroups,
      chat: {isBotforum: false, peerId},
      chatInner,
      chatInnerMiddlewareHelper,
      managers: {},
      getMiddleware: () => realMiddlewareHelper.get(),
      getBubble: (currentFullMid: string) => bubbles[currentFullMid],
      makeFullMid: () => fullMid,
      renderMessage: vi.fn(({bubble, message, reverse}) => {
        const index = attempt++;
        candidates.push(bubble);
        bubble.middlewareHelper.onDestroy(candidateDisposed[index]);
        if(index === 1 && outcome === 'rejected') {
          return Promise.reject(new Error('latest replacement failed'));
        }
        return Promise.resolve({bubble, message, reverse, promises: [] as Promise<unknown>[]});
      }),
      renderMessagesQueue: vi.fn(),
      reconcilePendingStreamedMessageUpdate: vi.fn(),
      createScrollSaver: () => ({save: vi.fn(), restore: vi.fn()}),
      repositionMessageBubble,
      updateSolidMessageBodyIdentity: vi.fn(),
      log: {error: vi.fn()}
    }) as any;

    const firstResult = await harness.safeRenderMessage({message: firstMessage, bubble: oldBubble});
    const firstCandidate = firstResult.bubble as HTMLElement;
    harness.bubblesToReplace.get(firstCandidate).regroupMessage = firstMessage;

    const latestResult = await harness.safeRenderMessage({message: latestMessage, bubble: firstCandidate});
    const latestCandidate = candidates[1];

    expect(candidateDisposed[0]).toHaveBeenCalledOnce();
    expect(oldBubble.isConnected).toBe(true);
    expect(oldText.isConnected).toBe(true);
    expect(harness.bubblesToReplace.has(firstCandidate)).toBe(false);

    // A stale earlier batch must not commit the source on behalf of the newer candidate.
    harness.commitBubbleReplacements(new Set([firstCandidate]), undefined, batchGroups);
    expect(oldBubble.isConnected).toBe(true);
    expect(oldDisposed).not.toHaveBeenCalled();

    if(outcome === 'rejected') {
      expect(latestResult).toBeUndefined();
      expect(bubbles[fullMid]).toBe(oldBubble);
      expect(item.bubble).toBe(oldBubble);
      expect(latestCandidate.isConnected).toBe(false);
      expect(candidateDisposed[1]).toHaveBeenCalledOnce();
      expect(harness.bubblesToReplace.size).toBe(0);
      expect(repositionMessageBubble).toHaveBeenCalledOnce();
      expect(harness.updateSolidMessageBodyIdentity).toHaveBeenCalledWith(
        oldBubble,
        latestMessage,
        100,
        true
      );
      ejectBubble(oldBubble);
    } else {
      expect(latestResult.bubble).toBe(latestCandidate);
      const transaction = harness.bubblesToReplace.get(latestCandidate);
      expect(transaction.source).toBe(oldBubble);
      expect(transaction.regroupMessage).toBe(latestMessage);

      harness.commitBubbleReplacements(new Set([latestCandidate]), undefined, batchGroups);
      expect(oldBubble.isConnected).toBe(false);
      expect(oldDisposed).toHaveBeenCalledOnce();
      expect(repositionMessageBubble).toHaveBeenCalledOnce();
      expect(batchGroups).toEqual([group]);
      expect(harness.bubblesToReplace.size).toBe(0);
      latestCandidate.remove();
      latestCandidate.middlewareHelper.destroy();
    }

    realMiddlewareHelper.destroy();
    chatDestroyMiddlewareHelper.destroy();
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(candidateDisposed[0]).toHaveBeenCalledOnce();
    expect(candidateDisposed[1]).toHaveBeenCalledOnce();
  }
);

test.each(['resolved', 'rejected'] as const)(
  'tears down the visible source and staging candidate when a replacement is deleted then %s',
  async(outcome) => {
    const fullMid = '10_100';
    const chatInner = document.createElement('div');
    const oldBubble = document.createElement('div');
    const oldMiddlewareHelper = getMiddleware();
    const oldDisposed = vi.fn();
    oldBubble.dataset.peerId = '' + peerId;
    oldBubble.dataset.mid = '100';
    oldBubble.middlewareHelper = oldMiddlewareHelper;
    oldMiddlewareHelper.onDestroy(oldDisposed);
    chatInner.append(oldBubble);
    document.body.append(chatInner);

    const realMiddlewareHelper = getMiddleware();
    const chatDestroyMiddlewareHelper = getMiddleware();
    const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
    const bubbles: Record<string, HTMLElement> = {[fullMid]: oldBubble};
    const candidateDisposed = vi.fn();
    let candidate: HTMLElement;
    let resolveRender: (value: unknown) => void;
    let rejectRender: (error: Error) => void;
    let itemBubble: HTMLElement = oldBubble;
    const bubbleGroups = {
      changeBubbleByBubble: vi.fn((from: HTMLElement, to: HTMLElement) => {
        if(itemBubble === from) itemBubble = to;
      }),
      removeAndUnmountBubble: vi.fn((bubble: HTMLElement) => {
        if(itemBubble === bubble) itemBubble = undefined;
        bubble.remove();
      })
    };
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      renderingMessages: new Set<string>(),
      bubbles,
      skippedMids: new Set<string>(),
      bubblesToReplace: new Map(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      bubbleGroups,
      chat: {isBotforum: false, peerId},
      chatInner,
      chatInnerMiddlewareHelper,
      managers: {},
      observer: undefined,
      firstUnreadBubble: undefined,
      getMiddleware: () => realMiddlewareHelper.get(),
      getBubble: (currentFullMid: string) => bubbles[currentFullMid],
      makeFullMid: () => fullMid,
      renderMessage: vi.fn(({bubble, message, reverse}) => {
        candidate = bubble;
        bubble.middlewareHelper.onDestroy(candidateDisposed);
        return new Promise((resolve, reject) => {
          resolveRender = () => resolve({bubble, message, reverse, promises: [] as Promise<unknown>[]});
          rejectRender = reject;
        });
      }),
      renderMessagesQueue: vi.fn(),
      reconcilePendingStreamedMessageUpdate: vi.fn(),
      log: {error: vi.fn()}
    }) as any;

    const renderPromise = harness.safeRenderMessage({message: message(), bubble: oldBubble});
    harness.destroyBubble(candidate, false, fullMid);

    expect(bubbles[fullMid]).toBeUndefined();
    expect(harness.bubblesToReplace.size).toBe(0);
    expect(oldBubble.isConnected).toBe(false);
    expect(candidate.isConnected).toBe(false);
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(candidateDisposed).toHaveBeenCalledOnce();
    expect(itemBubble).toBeUndefined();

    if(outcome === 'resolved') resolveRender(undefined);
    else rejectRender(new Error('late deleted render failure'));
    await renderPromise;

    expect(bubbles[fullMid]).toBeUndefined();
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(candidateDisposed).toHaveBeenCalledOnce();
    expect(harness.bubblesToReplace.size).toBe(0);

    realMiddlewareHelper.destroy();
    chatDestroyMiddlewareHelper.destroy();
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(candidateDisposed).toHaveBeenCalledOnce();
  }
);

test.each([
  {name: 'direct candidate ownership', renderFinalIdentity: false},
  {name: 'structural final with a visible temp-id source', renderFinalIdentity: true}
])('rekeys the live source across $name when cancelled staging later rejects', async({renderFinalIdentity}) => {
  const tempId = 99;
  const tempFullMid = '10_99';
  const finalFullMid = '10_100';
  const tempMessage = {
    ...message(),
    id: tempId,
    mid: tempId
  };
  const chatInner = document.createElement('div');
  const oldBubble = document.createElement('div');
  const oldMiddlewareHelper = getMiddleware();
  const oldDisposed = vi.fn();
  const oldControllerNode = document.createElement('span');
  oldControllerNode.textContent = 'rendered by the live controller';
  oldBubble.dataset.peerId = '' + peerId;
  oldBubble.dataset.mid = '' + tempId;
  oldBubble.middlewareHelper = oldMiddlewareHelper;
  oldMiddlewareHelper.onDestroy(oldDisposed);
  oldBubble.append(oldControllerNode);
  chatInner.append(oldBubble);
  document.body.append(chatInner);

  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const candidateDisposed = vi.fn();
  const bubbles: Record<string, HTMLElement> = {[tempFullMid]: oldBubble};
  const serverMessage = message();
  let itemBubble: HTMLElement = oldBubble;
  let candidate: HTMLElement;
  let rejectRender: (error: Error) => void;
  let queuedRender: Promise<unknown>;
  const bubbleGroups = {
    changeBubbleByBubble: vi.fn((from: HTMLElement, to: HTMLElement) => {
      if(itemBubble === from) itemBubble = to;
    })
  };
  const scrollSaver = {save: vi.fn(), restore: vi.fn()};
  const repositionMessageBubble = vi.fn();
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups,
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: (currentMessage: Message.message) => `10_${currentMessage.mid}`,
    renderMessage: vi.fn(({bubble}) => {
      candidate = bubble;
      bubble.middlewareHelper.onDestroy(candidateDisposed);
      return new Promise((_, reject) => rejectRender = reject);
    }),
    renderMessagesQueue: vi.fn((promise) => queuedRender = promise),
    reconcilePendingStreamedMessageUpdate: vi.fn(),
    createScrollSaver: () => scrollSaver,
    repositionMessageBubble,
    updateSolidMessageBodyIdentity: vi.fn((bubble: HTMLElement, nextMessage: Message.message) => {
      expect(bubble).toBe(oldBubble);
      oldControllerNode.dataset.mid = '' + nextMessage.mid;
    }),
    log: {error: vi.fn()}
  }) as any;

  const renderPromise = harness.safeRenderMessage({
    message: renderFinalIdentity ? message() : tempMessage,
    bubble: oldBubble
  });
  expect(itemBubble).toBe(candidate);
  if(renderFinalIdentity) {
    expect(bubbles[tempFullMid]).toBe(oldBubble);
    expect(bubbles[finalFullMid]).toBe(candidate);
  } else {
    expect(bubbles[tempFullMid]).toBe(candidate);
  }

  // This is the synchronous ownership transfer performed by the real message_sent listener while
  // the replacement still awaits render work: cancel staging first, then rekey the returned live
  // source and its Solid controller.
  const replacement = harness.cancelPendingBubbleReplacement(
    renderFinalIdentity ? bubbles[tempFullMid] : candidate
  );
  const liveBubble = replacement.bubble;
  expect(replacement.cancelled).toBe(true);
  expect(liveBubble).toBe(oldBubble);
  delete bubbles[tempFullMid];
  bubbles[finalFullMid] = liveBubble;
  liveBubble.dataset.mid = '100';
  if(replacement.cancelled) {
    liveBubble.dataset.timestamp = '' + serverMessage.date;
    harness.repositionMessageBubblePreservingScroll(liveBubble, serverMessage);
  }
  harness.updateSolidMessageBodyIdentity(liveBubble, serverMessage, tempId);
  rejectRender(new Error('late replacement failure'));
  await renderPromise;

  expect(await queuedRender).toBeUndefined();
  expect(bubbles[tempFullMid]).toBeUndefined();
  expect(bubbles[finalFullMid]).toBe(oldBubble);
  expect(itemBubble).toBe(oldBubble);
  expect(oldBubble.isConnected).toBe(true);
  expect(oldControllerNode.isConnected).toBe(true);
  expect(oldControllerNode.dataset.mid).toBe('100');
  expect(oldBubble.dataset.timestamp).toBe('1');
  expect(oldDisposed).not.toHaveBeenCalled();
  expect(candidate.isConnected).toBe(false);
  expect(candidateDisposed).toHaveBeenCalledOnce();
  expect(repositionMessageBubble).toHaveBeenCalledOnce();
  expect(repositionMessageBubble).toHaveBeenCalledWith(oldBubble, serverMessage);
  expect(scrollSaver.save).toHaveBeenCalledOnce();
  expect(scrollSaver.restore).toHaveBeenCalledOnce();
  expect(harness.bubblesToReplace.size).toBe(0);
  expect(bubbleGroups.changeBubbleByBubble).toHaveBeenCalledTimes(2);
  expect(bubbleGroups.changeBubbleByBubble).toHaveBeenLastCalledWith(candidate, oldBubble);

  ejectBubble(oldBubble);
  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('fully regroups the live source when message_sent cancels a structural candidate before it settles', () => {
  const tempFullMid = '10_99';
  const finalFullMid = '10_100';
  const finalMessage = {...message(), date: 172_801, fromId: 20 as PeerId};
  const oldBubble = document.createElement('div');
  const candidate = document.createElement('div');
  const oldMiddlewareHelper = getMiddleware();
  const candidateMiddlewareHelper = getMiddleware();
  const candidateDisposed = vi.fn();
  oldBubble.dataset.peerId = candidate.dataset.peerId = '' + peerId;
  oldBubble.dataset.mid = '99';
  candidate.dataset.mid = '100';
  oldBubble.middlewareHelper = oldMiddlewareHelper;
  candidate.middlewareHelper = candidateMiddlewareHelper;
  candidateMiddlewareHelper.onDestroy(candidateDisposed);
  document.body.append(oldBubble);

  const bubbles: Record<string, HTMLElement> = {
    [tempFullMid]: oldBubble,
    [finalFullMid]: candidate
  };
  let itemBubble: HTMLElement = candidate;
  const bubbleGroups = {
    changeBubbleByBubble: vi.fn((from: HTMLElement, to: HTMLElement) => {
      if(itemBubble === from) itemBubble = to;
    })
  };
  const scrollSaver = {save: vi.fn(), restore: vi.fn()};
  const groupMetadata = {timestamp: 1, fromId: peerId, message: undefined as Message.message};
  const repositionMessageBubble = vi.fn((_bubble: HTMLElement, nextMessage: Message.message) => {
    groupMetadata.timestamp = nextMessage.date;
    groupMetadata.fromId = nextMessage.fromId;
    groupMetadata.message = nextMessage;
  });
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map([[candidate, {
      source: oldBubble,
      fullMid: finalFullMid,
      rollbackFullMidBubble: undefined,
      previousFullMidSkipped: false
    }]]),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups,
    getBubble: (fullMid: string) => bubbles[fullMid],
    createScrollSaver: () => scrollSaver,
    repositionMessageBubble
  }) as any;

  const replacement = harness.cancelPendingBubbleReplacement(bubbles[tempFullMid]);
  const liveBubble = replacement.bubble;
  delete bubbles[tempFullMid];
  bubbles[finalFullMid] = liveBubble;
  liveBubble.dataset.mid = '100';
  if(replacement.cancelled) {
    liveBubble.dataset.timestamp = '' + finalMessage.date;
    harness.repositionMessageBubblePreservingScroll(liveBubble, finalMessage);
  }

  expect(replacement.cancelled).toBe(true);
  expect(liveBubble).toBe(oldBubble);
  expect(bubbles[tempFullMid]).toBeUndefined();
  expect(bubbles[finalFullMid]).toBe(oldBubble);
  expect(itemBubble).toBe(oldBubble);
  expect(oldBubble.isConnected).toBe(true);
  expect(candidate.isConnected).toBe(false);
  expect(candidateDisposed).toHaveBeenCalledOnce();
  expect(repositionMessageBubble).toHaveBeenCalledOnce();
  expect(repositionMessageBubble).toHaveBeenCalledWith(oldBubble, finalMessage);
  expect(groupMetadata).toEqual({
    timestamp: finalMessage.date,
    fromId: finalMessage.fromId,
    message: finalMessage
  });
  expect(oldBubble.dataset.timestamp).toBe('172801');
  expect(scrollSaver.save).toHaveBeenCalledOnce();
  expect(scrollSaver.restore).toHaveBeenCalledOnce();
  expect(harness.bubblesToReplace.size).toBe(0);

  ejectBubble(oldBubble);
});

test('preserves an unsupported source shell and retries it after a cancelled replacement batch', async() => {
  const tempId = 99;
  const fullMid = '10_100';
  const finalMessage = {
    ...message(),
    reply_markup: {_: 'replyInlineMarkup', rows: []}
  } as Message.message;
  const bubble = document.createElement('div');
  bubble.dataset.peerId = '' + peerId;
  bubble.dataset.mid = '' + finalMessage.mid;
  const oldStructure = {kind: 'streaming-shell'};
  const entry = {
    bubble,
    controller: {update: vi.fn()},
    message: {...streamedMessage('draft'), mid: tempId},
    revision: 1,
    structure: oldStructure,
    ownsTime: false,
    refreshPolicy: vi.fn()
  };
  const entries = new Map([[tempId, entry]]);
  let resolveBatch: () => void;
  const queuePromise = new Promise<void>((resolve) => resolveBatch = resolve);
  const middlewareHelper = getMiddleware();
  const safeRenderMessage = vi.fn();
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    bubbles: {[fullMid]: bubble},
    solidMessageBodies: new Map([[bubble, entries]]),
    batchProcessor: {queuePromise},
    chat: {getMessageByPeer: () => finalMessage},
    getMiddleware: () => middlewareHelper.get(),
    getBubble: (currentFullMid: string) => currentFullMid === fullMid ? bubble : undefined,
    modifyBubble: (callback: () => void) => callback(),
    updateSolidMessageBodyContext: vi.fn(),
    safeRenderMessage
  }) as any;

  harness.updateSolidMessageBodyIdentity(bubble, finalMessage, tempId, true);
  harness.retryCancelledBubbleReplacement(bubble, finalMessage, fullMid);

  expect(entry.structure).toBe(oldStructure);
  expect(entries.get(tempId)).toBeUndefined();
  expect(entries.get(finalMessage.mid)).toBe(entry);
  expect(safeRenderMessage).not.toHaveBeenCalled();

  resolveBatch();
  await queuePromise;
  await Promise.resolve();
  expect(safeRenderMessage).toHaveBeenCalledOnce();
  expect(safeRenderMessage).toHaveBeenCalledWith({
    message: finalMessage,
    bubble,
    reverse: true
  });

  middlewareHelper.destroy();
});

test('finalizes and retries a structurally changed streamed message after replacement rejects', async() => {
  const tempId = 99;
  const tempFullMid = '10_99';
  const finalFullMid = '10_100';
  const tempMessage = {
    ...streamedMessage('draft'),
    id: tempId,
    mid: tempId
  };
  const finalMessage = message();
  const chatInner = document.createElement('div');
  const oldBubble = document.createElement('div');
  oldBubble.dataset.peerId = '' + peerId;
  oldBubble.dataset.mid = '' + tempId;
  chatInner.append(oldBubble);
  document.body.append(chatInner);

  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  oldBubble.middlewareHelper = chatInnerMiddlewareHelper.get().create();
  const oldStructure = {kind: 'streaming-shell'};
  let snapshot: {
    sourceRevision: number,
    phase: 'streaming' | 'finalizing',
    message: Message.message
  } = {
    sourceRevision: 1,
    phase: 'streaming',
    message: tempMessage
  };
  const controller = {
    getSnapshot: vi.fn(() => snapshot),
    finalize: vi.fn((nextMessage: Message.message, sourceRevision: number) => {
      snapshot = {
        sourceRevision,
        phase: 'finalizing',
        message: nextMessage
      };
      return true;
    })
  };
  const entry = {
    bubble: oldBubble,
    controller,
    message: tempMessage,
    revision: 1,
    structure: oldStructure,
    ownsTime: false,
    refreshPolicy: vi.fn()
  };
  const entries = new Map([[tempId, entry]]);
  const bubbles: Record<string, HTMLElement> = {[tempFullMid]: oldBubble};
  let renderAttempt = 0;
  const renderMessage = vi.fn(() => {
    ++renderAttempt;
    if(renderAttempt === 1) {
      expect(bubbles[tempFullMid]).toBe(oldBubble);
      expect(bubbles[finalFullMid]).not.toBe(oldBubble);
      expect(oldBubble.dataset.mid).toBe('99');
      expect(entries.get(tempId)).toBe(entry);
    } else {
      expect(bubbles[tempFullMid]).toBeUndefined();
      expect(bubbles[finalFullMid]).not.toBe(oldBubble);
      expect(oldBubble.dataset.mid).toBe('100');
      expect(entries.get(finalMessage.mid)).toBe(entry);
      expect(controller.getSnapshot().phase).toBe('finalizing');
    }
    return Promise.reject(new Error('structural render failed'));
  });
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn()},
    solidMessageBodies: new Map([[oldBubble, entries]]),
    contexts: new Map(),
    observer: undefined,
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => finalFullMid,
    renderMessage,
    renderMessagesQueue: vi.fn((promise: Promise<unknown>) => void promise),
    reconcilePendingStreamedMessageUpdate: vi.fn(),
    createScrollSaver: () => ({save: vi.fn(), restore: vi.fn()}),
    repositionMessageBubble: vi.fn(),
    updateSolidMessageBodyContext: vi.fn(),
    modifyBubble: (callback: () => void) => callback(),
    log: {error: vi.fn()}
  }) as any;
  const commitFinalTypingMessage = harness.commitFinalTypingMessage.bind(harness);
  harness.commitFinalTypingMessage = vi.fn((...args: unknown[]) => {
    expect(bubbles[tempFullMid]).toBe(oldBubble);
    expect(bubbles[finalFullMid]).toBeUndefined();
    expect(oldBubble.dataset.mid).toBe('99');
    expect(entries.get(tempId)).toBe(entry);
    return commitFinalTypingMessage(...args);
  });

  expect(harness.finalizeTypingMessage(finalMessage, tempId)).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(renderMessage).toHaveBeenCalledTimes(2);
  expect(harness.commitFinalTypingMessage).toHaveBeenCalledOnce();
  expect(bubbles[tempFullMid]).toBeUndefined();
  expect(bubbles[finalFullMid]).toBe(oldBubble);
  expect(harness.skippedMids.has(finalFullMid)).toBe(false);
  expect(entries.get(tempId)).toBeUndefined();
  expect(entries.get(finalMessage.mid)).toBe(entry);
  expect(oldBubble.dataset.mid).toBe('100');
  expect(entry.structure).toBe(oldStructure);
  expect(controller.getSnapshot().phase).toBe('finalizing');
  expect(controller.finalize).toHaveBeenCalledOnce();

  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('commits final group identity before a structural replacement is mounted', async() => {
  const tempId = 99;
  const tempFullMid = '10_99';
  const finalFullMid = '10_100';
  const tempMessage = {
    ...streamedMessage('draft'),
    id: tempId,
    mid: tempId
  };
  const finalMessage = {
    ...message(),
    date: 172_801
  };
  const oldBubble = document.createElement('div');
  const newBubble = document.createElement('div');
  oldBubble.dataset.peerId = newBubble.dataset.peerId = '' + peerId;
  oldBubble.dataset.mid = '' + tempId;
  newBubble.dataset.mid = '' + finalMessage.mid;
  document.body.append(oldBubble);

  const middlewareHelper = getMiddleware();
  oldBubble.middlewareHelper = middlewareHelper.get().create();
  newBubble.middlewareHelper = middlewareHelper.get().create();
  let snapshot: {
    sourceRevision: number,
    phase: 'streaming' | 'finalizing',
    message: Message.message
  } = {
    sourceRevision: 1,
    phase: 'streaming',
    message: tempMessage
  };
  const controller = {
    getSnapshot: () => snapshot,
    finalize: (nextMessage: Message.message, sourceRevision: number) => {
      snapshot = {sourceRevision, phase: 'finalizing', message: nextMessage};
      return true;
    }
  };
  const entry = {
    bubble: oldBubble,
    controller,
    message: tempMessage,
    revision: 1,
    structure: {kind: 'streaming-shell'},
    ownsTime: false,
    refreshPolicy: vi.fn()
  };
  type TestGroupItem = {
    bubble: HTMLElement,
    message: Message.message,
    mid: number,
    mounted: boolean,
    timestamp: number,
    dateTimestamp: number,
    fromId: PeerId,
    single: boolean,
    group?: {items: TestGroupItem[]}
  };
  const item: TestGroupItem = {
    bubble: oldBubble,
    message: tempMessage,
    mid: tempId,
    mounted: true,
    timestamp: tempMessage.date,
    dateTimestamp: 0,
    fromId: peerId,
    single: false
  };
  const group = {items: [item]};
  const finalGroup = {items: [] as TestGroupItem[]};
  item.group = group;
  const itemsByBubble = new Map<HTMLElement, typeof item>([[oldBubble, item]]);
  const changeBubbleByBubble = vi.fn((from: HTMLElement, to: HTMLElement) => {
    const currentItem = itemsByBubble.get(from);
    if(!currentItem) return;
    itemsByBubble.delete(from);
    currentItem.bubble = to;
    itemsByBubble.set(to, currentItem);
  });
  const changeBubbleMessage = vi.fn((bubble: HTMLElement, nextMessage: Message.message) => {
    const currentItem = itemsByBubble.get(bubble);
    if(!currentItem) return;
    currentItem.message = nextMessage;
    currentItem.mid = nextMessage.mid;
  });
  const bubbleGroups = {
    groups: [group],
    getItemByBubble: (bubble: HTMLElement) => itemsByBubble.get(bubble),
    changeBubbleByBubble,
    changeBubbleMessage,
    mountUnmountGroups: vi.fn((groups: typeof finalGroup[]) => {
      if(!groups.includes(finalGroup)) return;
      item.mounted = true;
      document.body.append(newBubble);
    })
  };
  const bubbles: Record<string, HTMLElement> = {[tempFullMid]: oldBubble};
  const bubblesToReplace = new Map<HTMLElement, {
    source: HTMLElement,
    fullMid: string,
    rollbackFullMidBubble?: HTMLElement,
    previousFullMidSkipped: boolean,
    regroupMessage?: Message.message
  }>([[newBubble, {
    source: oldBubble,
    fullMid: finalFullMid,
    rollbackFullMidBubble: undefined,
    previousFullMidSkipped: false
  }]]);
  const safeRenderMessage = vi.fn(() => {
    bubbles[finalFullMid] = newBubble;
    changeBubbleByBubble(oldBubble, newBubble);
    return Promise.resolve({bubble: newBubble});
  });
  const repositionMessageBubble = vi.fn((bubble: HTMLElement, nextMessage: Message.message) => {
    expect(oldBubble.isConnected).toBe(false);
    expect(bubble).toBe(newBubble);
    group.items = group.items.filter((current) => current !== item);
    item.message = nextMessage;
    item.mid = nextMessage.mid;
    item.timestamp = nextMessage.date;
    item.dateTimestamp = 172_800;
    item.fromId = nextMessage.fromId;
    item.single = false;
    item.group = finalGroup;
    finalGroup.items.push(item);
    item.mounted = false;
    return [finalGroup];
  });
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    bubbles,
    skippedMids: new Set<string>(),
    solidMessageBodies: new Map([[oldBubble, new Map([[tempId, entry]])]]),
    bubblesToReplace,
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups,
    getMiddleware: () => middlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: (currentMessage: Message.message) => `10_${currentMessage.mid}`,
    safeRenderMessage,
    repositionMessageBubble
  }) as any;

  expect(harness.finalizeTypingMessage(finalMessage, tempId)).toBe(true);
  await Promise.resolve();

  expect(bubbles[tempFullMid]).toBeUndefined();
  expect(bubbles[finalFullMid]).toBe(newBubble);
  expect(item.bubble).toBe(newBubble);
  expect(item.message).toBe(finalMessage);
  expect(item.mid).toBe(finalMessage.mid);
  expect(harness.getRenderedHistory('desc')).toEqual([finalFullMid]);
  expect(changeBubbleByBubble.mock.invocationCallOrder[0])
  .toBeLessThan(changeBubbleMessage.mock.invocationCallOrder[0]);
  expect(item.timestamp).toBe(tempMessage.date);
  expect(item.dateTimestamp).toBe(0);
  expect(item.group).toBe(group);
  expect(bubblesToReplace.get(newBubble).regroupMessage).toBe(finalMessage);
  expect(newBubble.isConnected).toBe(false);

  // The real batch ejects the visible temp DOM first, then applies the pending regroup in the same
  // turn. The regroup contributes its destination group to the existing batch and does not mount
  // independently; processBatch mounts it exactly once below.
  const batchGroups: typeof finalGroup[] = [];
  harness.commitBubbleReplacements(new Set([newBubble]), undefined, batchGroups);
  expect(repositionMessageBubble).toHaveBeenCalledOnce();
  expect(repositionMessageBubble).toHaveBeenCalledWith(newBubble, finalMessage, false);
  expect(item.timestamp).toBe(finalMessage.date);
  expect(item.dateTimestamp).toBe(172_800);
  expect(item.fromId).toBe(finalMessage.fromId);
  expect(item.single).toBe(false);
  expect(item.group).toBe(finalGroup);
  expect(group.items).toHaveLength(0);
  expect(finalGroup.items).toEqual([item]);
  expect(item.mounted).toBe(false);
  expect(newBubble.isConnected).toBe(false);
  expect(batchGroups).toEqual([finalGroup]);
  expect(bubblesToReplace.size).toBe(0);

  // Mirrors the single mount at the end of processBatch.
  bubbleGroups.mountUnmountGroups(batchGroups);
  expect(bubbleGroups.mountUnmountGroups).toHaveBeenCalledOnce();
  expect(item.mounted).toBe(true);
  expect(newBubble.isConnected).toBe(true);

  middlewareHelper.destroy();
});

test('defers every affected BubbleGroup mount during an atomic replacement regroup', () => {
  const bubble = document.createElement('div');
  const group = {unmountItem: vi.fn()};
  const item: {bubble: HTMLElement, group?: typeof group, mounted: boolean} = {
    bubble,
    group,
    mounted: true
  };
  const deferredGroups = new Set<typeof group>();
  const mountUnmountGroups = vi.fn();
  const groupsHarness = {
    itemsArr: [item],
    getItemByBubble: () => item,
    getSiblingsAtIndex: (): [undefined, undefined] => [undefined, undefined],
    removeItem: vi.fn(() => item.group = undefined),
    mountUnmountGroups
  };

  (BubbleGroups.prototype.removeAndUnmountBubble as any).call(groupsHarness, bubble, deferredGroups);

  expect(group.unmountItem).toHaveBeenCalledOnce();
  expect(mountUnmountGroups).not.toHaveBeenCalled();
  expect(deferredGroups).toEqual(new Set([group]));
});

test('reconciles only the latest streamed revision queued during the initial async render', async() => {
  const chatInner = document.createElement('div');
  const bubbles: Record<string, HTMLElement> = {};
  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const pendingStreamedMessageUpdates = new Map();
  const updateSolidMessageBody = vi.fn(() => true);
  const onMessageEdit = vi.fn();
  let renderedBubble: HTMLElement;
  let resolveRender: () => void;
  let queuedRender: Promise<unknown>;
  document.body.append(chatInner);

  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    pendingStreamedMessageUpdates,
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn()},
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => '10_100',
    isTransientMessageInCurrentChat: () => true,
    updateSolidMessageBody,
    renderTransientHistoryMessage: vi.fn(),
    renderMessage: vi.fn(({bubble, message, reverse}) => {
      renderedBubble = bubble;
      return new Promise<void>((resolve) => resolveRender = resolve).then(() => ({
        bubble,
        message,
        reverse,
        promises: [] as Promise<unknown>[]
      }));
    }),
    renderMessagesQueue: vi.fn((promise) => queuedRender = promise),
    log: {error: vi.fn()}
  }) as any;

  const renderPromise = harness.safeRenderMessage({message: streamedMessage('a')});
  const middle = streamedMessage('ab');
  const latest = streamedMessage('abc');
  harness.handleStreamedMessageUpdate(middle, false, onMessageEdit);
  harness.handleStreamedMessageUpdate(latest, false, onMessageEdit);

  expect(onMessageEdit).not.toHaveBeenCalled();
  expect(pendingStreamedMessageUpdates.get('10_100')).toBe(latest);

  resolveRender();
  const result = await renderPromise;
  expect(await queuedRender).toBe(result);
  expect(updateSolidMessageBody).toHaveBeenCalledOnce();
  expect(updateSolidMessageBody).toHaveBeenCalledWith(renderedBubble, latest);
  expect(pendingStreamedMessageUpdates.size).toBe(0);

  renderedBubble.remove();
  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('retries a rejected initial streamed render from the latest queued revision', async() => {
  const chatInner = document.createElement('div');
  const bubbles: Record<string, HTMLElement> = {};
  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const latest = streamedMessage('latest');
  const renderTransientHistoryMessage = vi.fn();
  let rejectRender: (error: Error) => void;
  document.body.append(chatInner);

  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    pendingStreamedMessageUpdates: new Map(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn()},
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => '10_100',
    isTransientMessageInCurrentChat: () => true,
    updateSolidMessageBody: vi.fn(),
    renderTransientHistoryMessage,
    renderMessage: vi.fn(() => new Promise((_, reject) => rejectRender = reject)),
    renderMessagesQueue: vi.fn(),
    log: {error: vi.fn()}
  }) as any;

  const renderPromise = harness.safeRenderMessage({message: streamedMessage('a')});
  harness.handleStreamedMessageUpdate(latest, false, vi.fn());
  rejectRender(new Error('render failed'));
  await renderPromise;

  expect(renderTransientHistoryMessage).toHaveBeenCalledOnce();
  expect(renderTransientHistoryMessage).toHaveBeenCalledWith(latest);
  expect(harness.pendingStreamedMessageUpdates.size).toBe(0);

  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('removes a stale processResult bubble mounted into a newer chat root', async() => {
  const oldChatInner = document.createElement('div');
  const newChatInner = document.createElement('div');
  const bubbles: Record<string, HTMLElement> = {};
  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const disposed = vi.fn();
  let renderedBubble: HTMLElement;
  let resolveRender: () => void;
  let queuedRender: Promise<unknown>;
  document.body.append(oldChatInner, newChatInner);

  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn()},
    chat: {isBotforum: false, peerId},
    chatInner: oldChatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => '10_100',
    renderMessage: vi.fn(({bubble, message, reverse}) => {
      renderedBubble = bubble;
      bubble.middlewareHelper.onDestroy(disposed);
      return new Promise<void>((resolve) => resolveRender = resolve).then(() => ({
        bubble,
        message,
        reverse,
        promises: [] as Promise<unknown>[]
      }));
    }),
    renderMessagesQueue: vi.fn((promise) => queuedRender = promise),
    log: {error: vi.fn()}
  }) as any;

  const safeRenderPromise = harness.safeRenderMessage({
    message: message(),
    processResult: async(result: Promise<{bubble: HTMLElement}>) => {
      const details = await result;
      newChatInner.prepend(details.bubble);
      return result;
    }
  });
  harness.chatInner = newChatInner;
  realMiddlewareHelper.clean();
  resolveRender();
  await safeRenderPromise;

  expect(await queuedRender).toBeUndefined();
  expect(newChatInner.contains(renderedBubble)).toBe(false);
  expect(renderedBubble.isConnected).toBe(false);
  expect(disposed).toHaveBeenCalledOnce();
  expect(bubbles['10_100']).toBeUndefined();

  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('keeps a valid nested processResult bubble under its captured chat root', async() => {
  const chatInner = document.createElement('div');
  const parentBubble = document.createElement('div');
  const bubbles: Record<string, HTMLElement> = {};
  const realMiddlewareHelper = getMiddleware();
  const chatDestroyMiddlewareHelper = getMiddleware();
  const chatInnerMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const disposed = vi.fn();
  let renderedBubble: HTMLElement;
  let queuedRender: Promise<unknown>;
  chatInner.append(parentBubble);
  document.body.append(chatInner);

  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    renderingMessages: new Set<string>(),
    bubbles,
    skippedMids: new Set<string>(),
    bubblesToReplace: new Map<HTMLElement, HTMLElement>(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    bubbleGroups: {changeBubbleByBubble: vi.fn()},
    chat: {isBotforum: false, peerId},
    chatInner,
    chatInnerMiddlewareHelper,
    managers: {},
    getMiddleware: () => realMiddlewareHelper.get(),
    getBubble: (fullMid: string) => bubbles[fullMid],
    makeFullMid: () => '10_100',
    renderMessage: vi.fn(({bubble, message, reverse}) => {
      renderedBubble = bubble;
      bubble.middlewareHelper.onDestroy(disposed);
      return Promise.resolve({
        bubble,
        message,
        reverse,
        promises: [] as Promise<unknown>[]
      });
    }),
    renderMessagesQueue: vi.fn((promise) => queuedRender = promise),
    log: {error: vi.fn()}
  }) as any;

  const result = await harness.safeRenderMessage({
    message: message(),
    processResult: async(renderResult: Promise<{bubble: HTMLElement}>) => {
      const details = await renderResult;
      parentBubble.append(details.bubble);
      return renderResult;
    }
  });

  expect(await queuedRender).toBe(result);
  expect(parentBubble.contains(renderedBubble)).toBe(true);
  expect(disposed).not.toHaveBeenCalled();

  ejectBubble(renderedBubble);
  realMiddlewareHelper.destroy();
  chatDestroyMiddlewareHelper.destroy();
});

test('waits for physical chat generation detach instead of a superseded transition promise', async() => {
  const chatInner = document.createElement('div');
  const generationMiddlewareHelper = getMiddleware();
  const bubbleMiddlewareHelper = generationMiddlewareHelper.get().create();
  chatInner.classList.add('bubbles-inner');
  chatInner.append(document.createElement('div'));
  document.body.append(chatInner);
  let destroyed = false;
  bubbleMiddlewareHelper.onDestroy(() => destroyed = true);

  disposeChatInnerMiddlewareAfterDetach(chatInner, generationMiddlewareHelper);
  await Promise.resolve();
  expect(destroyed).toBe(false);

  chatInner.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(destroyed).toBe(true);
});

test('disposes a disconnected staging generation without waiting for any transition', () => {
  const chatInner = document.createElement('div');
  const generationMiddlewareHelper = getMiddleware();
  const bubbleMiddlewareHelper = generationMiddlewareHelper.get().create();
  let destroyed = false;
  bubbleMiddlewareHelper.onDestroy(() => destroyed = true);

  disposeChatInnerMiddlewareAfterDetach(chatInner, generationMiddlewareHelper);

  expect(destroyed).toBe(true);
});

test('keeps visible O alive, disposes superseded A, and observes only the mounted generation', () => {
  const originalMutationObserver = globalThis.MutationObserver;
  const callbacks: Array<() => void> = [];
  const observers: Array<{
    disconnect: ReturnType<typeof vi.fn>,
    observe: ReturnType<typeof vi.fn>
  }> = [];

  class MutationObserverMock {
    disconnect = vi.fn();
    observe = vi.fn();

    constructor(callback: () => void) {
      callbacks.push(callback);
      observers.push(this);
    }

    takeRecords(): MutationRecord[] {
      return [];
    }
  }

  vi.stubGlobal('MutationObserver', MutationObserverMock);
  try {
    const chatDestroyMiddlewareHelper = getMiddleware();
    const oldGenerationMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
    const stagingGenerationMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
    const oldBubbleMiddlewareHelper = oldGenerationMiddlewareHelper.get().create();
    const stagingBubbleMiddlewareHelper = stagingGenerationMiddlewareHelper.get().create();
    const oldChatInner = document.createElement('div');
    const stagingChatInner = document.createElement('div');
    let oldBubbleDestroyed = false;
    let stagingBubbleDestroyed = false;
    oldBubbleMiddlewareHelper.onDestroy(() => oldBubbleDestroyed = true);
    stagingBubbleMiddlewareHelper.onDestroy(() => stagingBubbleDestroyed = true);
    document.body.append(oldChatInner);

    disposeChatInnerMiddlewareAfterDetach(oldChatInner, oldGenerationMiddlewareHelper);
    disposeChatInnerMiddlewareAfterDetach(stagingChatInner, stagingGenerationMiddlewareHelper);

    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledOnce();
    expect(oldBubbleDestroyed).toBe(false);
    expect(stagingBubbleDestroyed).toBe(true);
    expect(observers[0].disconnect).not.toHaveBeenCalled();

    oldChatInner.remove();
    callbacks[0]();
    expect(oldBubbleDestroyed).toBe(true);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    chatDestroyMiddlewareHelper.destroy();
  } finally {
    vi.stubGlobal('MutationObserver', originalMutationObserver);
  }
});

test('ejects one bubble without destroying its chat generation or sibling', () => {
  const chatDestroyMiddlewareHelper = getMiddleware();
  const generationMiddlewareHelper = chatDestroyMiddlewareHelper.get().create();
  const generationMiddleware = generationMiddlewareHelper.get();
  const firstBubble = document.createElement('div');
  const secondBubble = document.createElement('div');
  firstBubble.middlewareHelper = generationMiddleware.create();
  secondBubble.middlewareHelper = generationMiddleware.create();
  let firstDestroyed = false;
  let secondDestroyed = false;
  firstBubble.middlewareHelper.onDestroy(() => firstDestroyed = true);
  secondBubble.middlewareHelper.onDestroy(() => secondDestroyed = true);
  document.body.append(firstBubble, secondBubble);

  ejectBubble(firstBubble);

  expect(firstBubble.isConnected).toBe(false);
  expect(firstDestroyed).toBe(true);
  expect(secondBubble.isConnected).toBe(true);
  expect(secondDestroyed).toBe(false);
  expect(generationMiddleware()).toBe(true);

  ejectBubble(secondBubble);
  chatDestroyMiddlewareHelper.destroy();
});

test('guards a delayed legacy replacement immediately without owning inert state', () => {
  const container = document.createElement('div');
  const bubble = document.createElement('div');
  const anchor = document.createElement('a');
  const phone = document.createElement('a');
  const botCommand = document.createElement('a');
  const timestamp = document.createElement('a');
  const plainControl = document.createElement('button');
  const plainText = document.createElement('span');
  anchor.href = '#';
  markGuardedMessageLink(anchor);
  phone.href = 'tel:+123';
  botCommand.href = 'tg://bot_command?command=go';
  timestamp.href = '#';
  timestamp.className = 'timestamp';
  plainControl.type = 'button';
  plainText.textContent = 'selectable';
  bubble.append(anchor, phone, botCommand, timestamp, plainControl, plainText);
  container.append(bubble);
  document.body.append(container);
  bubble.inert = false;

  const followed = vi.fn();
  const controlled = vi.fn();
  const auxiliaryControlled = vi.fn();
  anchor.addEventListener('click', followed);
  plainControl.addEventListener('click', controlled);
  plainControl.addEventListener('auxclick', auxiliaryControlled);
  (['click', 'auxclick', 'contextmenu', 'dragstart'] as const).forEach((event) => {
    container.addEventListener(event, cancelPendingHiddenLinksEvent, {capture: true});
  });

  setBubbleHiddenLinksPending(bubble, true);
  const blocked = new MouseEvent('click', {bubbles: true, cancelable: true});
  expect(anchor.dispatchEvent(blocked)).toBe(false);
  expect(blocked.defaultPrevented).toBe(true);
  expect(followed).not.toHaveBeenCalled();
  expect(bubble.inert).toBe(false);
  expect(anchor.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))).toBe(false);
  expect(anchor.dispatchEvent(new Event('dragstart', {bubbles: true, cancelable: true}))).toBe(false);
  expect(plainControl.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))).toBe(true);
  expect(plainControl.dispatchEvent(new MouseEvent('auxclick', {bubbles: true, cancelable: true}))).toBe(true);
  expect(controlled).toHaveBeenCalledOnce();
  expect(auxiliaryControlled).toHaveBeenCalledOnce();
  expect(plainControl.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))).toBe(true);
  expect(plainControl.dispatchEvent(new Event('dragstart', {bubbles: true, cancelable: true}))).toBe(true);
  expect(plainText.dispatchEvent(new Event('selectstart', {bubbles: true, cancelable: true}))).toBe(true);
  expectRetainedLinkEventsAllowed(phone, botCommand, timestamp);

  bubble.inert = true;
  setBubbleHiddenLinksPending(bubble, false);
  const allowed = new MouseEvent('click', {bubbles: true, cancelable: true});
  expect(anchor.dispatchEvent(allowed)).toBe(true);
  expect(followed).toHaveBeenCalledOnce();
  expect(bubble.inert).toBe(true);
});

test('guards the ultimate visible source while a hidden-link candidate is still staging', () => {
  const currentMessage = {...message(), message: 'https://example.com'};
  const source = document.createElement('div');
  const candidate = document.createElement('div');
  const anchor = document.createElement('a');
  markGuardedMessageLink(anchor);
  source.append(anchor);
  candidate.dataset.hiddenLinks = '1';
  document.body.append(source);
  const bubbles: Record<string, HTMLElement> = {'10_100': candidate};
  const safeRenderMessage = vi.fn();
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    peerSettings: {
      _: 'peerSettings',
      pFlags: {report_spam: true}
    },
    bubbles,
    bubblesToReplace: new Map([[candidate, {
      source,
      fullMid: '10_100',
      rollbackFullMidBubble: source,
      previousFullMidSkipped: false
    }]]),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    solidMessageBodies: new Map(),
    bubbleGroups: {getItemByBubble: () => ({message: currentMessage})},
    chat: {peerId, getMessageByPeer: () => currentMessage},
    getRenderedHistory: () => ['10_100'],
    getBubble: (fullMid: string) => bubbles[fullMid],
    shouldForceHideNonContactLinks: () => false,
    safeRenderMessage
  }) as any;

  source.addEventListener('click', cancelPendingHiddenLinksEvent, {capture: true});
  harness.refreshHiddenLinks(true);

  expect(safeRenderMessage).not.toHaveBeenCalled();
  expect(harness.hiddenLinksPendingBubbles).toEqual(new Set([source]));
  const click = new MouseEvent('click', {bubbles: true, cancelable: true});
  expect(anchor.dispatchEvent(click)).toBe(false);
  expect(click.defaultPrevented).toBe(true);
});

test('keeps the old legacy bubble inert while its async replacement is delayed', () => {
  const message = {
    _: 'message',
    pFlags: {},
    id: 100,
    mid: 100,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    date: 1,
    message: 'https://example.com'
  } as Message.message;
  const bubble = document.createElement('div');
  document.body.append(bubble);
  const replacement = new Promise(() => {});
  const safeRenderMessage = vi.fn(() => replacement);
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    peerSettings: {
      _: 'peerSettings',
      pFlags: {report_spam: true}
    },
    bubblesToReplace: new Map(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    solidMessageBodies: new Map(),
    bubbleGroups: {getItemByBubble: () => ({message})},
    chat: {peerId, getMessageByPeer: () => message},
    getRenderedHistory: () => ['10_100'],
    getBubble: () => bubble,
    shouldForceHideNonContactLinks: () => false,
    safeRenderMessage
  }) as any;

  harness.refreshHiddenLinks(true);
  expect(safeRenderMessage).toHaveBeenCalledOnce();
  expect(bubble.dataset.hiddenLinks).toBe('1');
  const anchor = document.createElement('a');
  markGuardedMessageLink(anchor);
  bubble.append(anchor);
  const click = new MouseEvent('click', {bubbles: true, cancelable: true});
  bubble.addEventListener('click', cancelPendingHiddenLinksEvent, {capture: true});
  expect(anchor.dispatchEvent(click)).toBe(false);

  harness.peerSettings = {_: 'peerSettings', pFlags: {}};
  harness.refreshHiddenLinks(false);
  expect(bubble.dataset.hiddenLinks).toBeUndefined();
  expect(anchor.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))).toBe(true);
});

test('does not rerender an already hidden replacement after the pending batch settles', async() => {
  const currentMessage = message();
  const oldBubble = document.createElement('div');
  const replacementBubble = document.createElement('div');
  replacementBubble.dataset.hiddenLinks = '1';
  document.body.append(oldBubble);
  let currentBubble = oldBubble;
  let resolvePendingRender: () => void;
  const messagesQueuePromise = new Promise<void>((resolve) => resolvePendingRender = resolve);
  const safeRenderMessage = vi.fn(() => {
    currentBubble = replacementBubble;
    return Promise.resolve({bubble: replacementBubble});
  });
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    peerSettings: {
      _: 'peerSettings',
      pFlags: {report_spam: true}
    },
    batchProcessor: {queuePromise: messagesQueuePromise},
    bubblesToReplace: new Map(),
    hiddenLinksPendingBubbles: new Set<HTMLElement>(),
    solidMessageBodies: new Map(),
    bubbleGroups: {getItemByBubble: () => ({message: currentMessage})},
    chat: {peerId, isBot: false, getMessageByPeer: () => currentMessage},
    getRenderedHistory: () => ['10_100'],
    getBubble: () => currentBubble,
    shouldForceHideNonContactLinks: () => false,
    safeRenderMessage
  }) as any;

  harness.handleMessageLinkPolicyChange(false, true);
  await Promise.resolve();
  expect(safeRenderMessage).toHaveBeenCalledOnce();

  resolvePendingRender();
  await messagesQueuePromise;
  await Promise.resolve();
  expect(safeRenderMessage).toHaveBeenCalledOnce();
});

test.each(['cancelled', 'rejected'] as const)(
  'falls back to a link-only guard when replacement is %s',
  async(outcome) => {
    const currentMessage = message();
    const bubble = document.createElement('div');
    const anchor = document.createElement('a');
    const phone = document.createElement('a');
    const botCommand = document.createElement('a');
    const timestamp = document.createElement('a');
    const plainControl = document.createElement('button');
    markGuardedMessageLink(anchor);
    phone.href = 'tel:+123';
    botCommand.href = 'tg://bot_command?command=go';
    timestamp.href = '#';
    timestamp.className = 'timestamp';
    plainControl.type = 'button';
    bubble.append(anchor, phone, botCommand, timestamp, plainControl);
    document.body.append(bubble);
    bubble.inert = false;
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      peerSettings: {
        _: 'peerSettings',
        pFlags: {report_spam: true}
      },
      bubblesToReplace: new Map(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      solidMessageBodies: new Map(),
      bubbleGroups: {getItemByBubble: () => ({message: currentMessage})},
      chat: {peerId, getMessageByPeer: () => currentMessage},
      getRenderedHistory: () => ['10_100'],
      getBubble: () => bubble,
      shouldForceHideNonContactLinks: () => false,
      safeRenderMessage: vi.fn(() => outcome === 'cancelled' ?
        Promise.resolve(undefined) :
        Promise.reject(new Error('render failed')))
    }) as any;
    const plainControlClick = vi.fn();
    const plainControlContextMenu = vi.fn();
    plainControl.addEventListener('click', plainControlClick);
    plainControl.addEventListener('contextmenu', plainControlContextMenu);
    (['click', 'auxclick', 'contextmenu', 'dragstart'] as const).forEach((event) => {
      bubble.addEventListener(event, cancelPendingHiddenLinksEvent, {capture: true});
    });

    harness.refreshHiddenLinks(true);
    await Promise.resolve();

    expect(anchor.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))).toBe(false);
    expect(plainControl.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))).toBe(true);
    expect(plainControlClick).toHaveBeenCalledOnce();
    expect(anchor.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))).toBe(false);
    expect(anchor.dispatchEvent(new Event('dragstart', {bubbles: true, cancelable: true}))).toBe(false);
    expect(plainControl.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))).toBe(true);
    expect(plainControlContextMenu).toHaveBeenCalledOnce();
    expectRetainedLinkEventsAllowed(phone, botCommand, timestamp);
    expect(bubble.inert).toBe(false);
  }
);

test('preserves same-peer policy and drops it for another peer', () => {
  const peerSettings = {
    _: 'peerSettings',
    pFlags: {report_spam: true}
  } as PeerSettings;
  const testPeerNonContactState = {userId: 1 as UserId, isNonContact: true};

  expect(retainMessageLinkPolicyOnCleanup(
    true,
    peerSettings,
    testPeerNonContactState
  )).toEqual({peerSettings, testPeerNonContactState});
  expect(retainMessageLinkPolicyOnCleanup(
    false,
    peerSettings,
    testPeerNonContactState
  )).toEqual({});
});

test('keeps retained chat generations on their captured link policy after a peer switch', () => {
  const trustedPeerId = 11 as PeerId;
  const suspiciousSettings = {
    _: 'peerSettings',
    pFlags: {report_spam: true}
  } as PeerSettings;
  const oldPolicy = {
    peerId,
    peerSettings: suspiciousSettings,
    forceHide: false,
    callbacks: new Set<() => void>()
  };
  const currentPolicy = {
    peerId: trustedPeerId,
    peerSettings: undefined as PeerSettings,
    forceHide: false,
    callbacks: new Set<() => void>()
  };
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {peerId: trustedPeerId, isBot: false},
    peerSettings: undefined,
    testPeerNonContactState: undefined,
    messageLinkPolicyState: oldPolicy,
    messageLinkPolicyStates: new Set([oldPolicy, currentPolicy])
  }) as any;
  const retainedHideLinks = harness.createMessageLinkPolicyAccessor(message());

  harness.messageLinkPolicyState = currentPolicy;
  harness.syncCurrentMessageLinkPolicyState();

  expect(retainedHideLinks()).toBe(true);
  expect(harness.createMessageLinkPolicyAccessor(message())()).toBe(false);
  expect(oldPolicy.peerSettings).toBe(suspiciousSettings);
});

test('updates and guards a retained same-peer generation when link policy tightens', () => {
  const middlewareHelper = getMiddleware();
  const bubble = document.createElement('div');
  const anchor = document.createElement('a');
  markGuardedMessageLink(anchor);
  bubble.append(anchor);
  const retainedState = {
    peerId,
    peerSettings: undefined as PeerSettings,
    forceHide: false,
    callbacks: new Set<() => void>()
  };
  const currentState = {
    peerId,
    peerSettings: undefined as PeerSettings,
    forceHide: false,
    callbacks: new Set<() => void>()
  };
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {peerId, isBot: false},
    peerSettings: undefined,
    testPeerNonContactState: undefined,
    messageLinkPolicyState: currentState,
    messageLinkPolicyStates: new Set([retainedState, currentState])
  }) as any;
  const hideLinks = harness.createMessageLinkPolicyAccessor(message(), retainedState);
  const refreshPolicy = vi.fn();
  harness.registerRetainedMessageLinkPolicy(
    retainedState,
    bubble,
    middlewareHelper.get(),
    hideLinks,
    refreshPolicy
  );

  harness.peerSettings = {
    _: 'peerSettings',
    pFlags: {block_contact: true}
  } as PeerSettings;
  harness.syncCurrentMessageLinkPolicyState();

  const blocked = makeTargetedEvent('click', anchor);
  expect(cancelPendingHiddenLinksEvent(blocked)).toBe(true);
  expect(bubble.dataset.hiddenLinks).toBe('1');
  expect(refreshPolicy).toHaveBeenCalledOnce();

  harness.peerSettings = undefined;
  harness.syncCurrentMessageLinkPolicyState();
  const allowed = makeTargetedEvent('click', anchor);
  expect(cancelPendingHiddenLinksEvent(allowed)).toBe(false);
  expect(bubble.dataset.hiddenLinks).toBeUndefined();
  expect(refreshPolicy).toHaveBeenCalledTimes(2);
  middlewareHelper.destroy();
});

test('classifies preview contacts, self and bots without accepting stale replies', () => {
  const myId = (1 as UserId).toPeerId(false);
  const contactId = (2 as UserId).toPeerId(false);
  const nonContactId = (3 as UserId).toPeerId(false);
  const groupId = (4 as ChatId).toPeerId(true);

  expect(shouldForceHideNonContactLinkTest(myId, myId, false)).toBe(false);
  expect(shouldForceHideNonContactLinkTest(contactId, myId, true)).toBe(false);
  expect(shouldForceHideNonContactLinkTest(groupId, myId, false)).toBe(false);
  expect(shouldForceHideNonContactLinkTest(contactId, myId, false, {
    userId: contactId.toUserId(),
    isNonContact: false
  })).toBe(false);
  expect(shouldForceHideNonContactLinkTest(nonContactId, myId, false, {
    userId: nonContactId.toUserId(),
    isNonContact: true
  })).toBe(true);
  expect(shouldForceHideNonContactLinkTest(nonContactId, myId, false)).toBe(true);

  expect(isTestPeerNonContactRequestCurrent(2, 2, contactId, contactId)).toBe(true);
  expect(isTestPeerNonContactRequestCurrent(1, 2, contactId, contactId)).toBe(false);
  expect(isTestPeerNonContactRequestCurrent(2, 2, contactId, nonContactId)).toBe(false);
});

test('tracks rekeyed streamed bubbles and rejects stale translation or summary callbacks', () => {
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();
  const bubble = document.createElement('div');
  const replacement = document.createElement('div');
  bubble.dataset.peerId = '' + peerId;
  bubble.dataset.mid = '100';
  const bubbles = new Map([['10_100', bubble]]);
  const getBubble = (fullMid: string) => bubbles.get(fullMid);

  expect(isBubbleUiCurrent(middleware, bubble, getBubble)).toBe(true);

  bubbles.delete('10_100');
  bubble.dataset.mid = '101';
  bubbles.set('10_101', bubble);
  expect(isBubbleUiCurrent(middleware, bubble, getBubble)).toBe(true);

  bubbles.set('10_101', replacement);
  expect(isBubbleUiCurrent(middleware, bubble, getBubble)).toBe(false);

  middlewareHelper.clean();
  bubbles.set('10_101', bubble);
  expect(isBubbleUiCurrent(middleware, bubble, getBubble)).toBe(false);
});

test('a throwing bubble modification never wedges later Solid body updates', () => {
  // The batch handle is what gates scheduling the next flush. Before this was made fail-soft a
  // single throwing callback left it set, and every later `modifyBubble` in the chat just
  // queued behind a flush that would never run again.
  const scrollSaver = {save: vi.fn(), restore: vi.fn()};
  const error = vi.fn();
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    log: {error},
    createScrollSaver: () => scrollSaver
  }) as any;

  const survivor = vi.fn();
  harness.batchingModifying = [
    () => {
      throw new Error('bad revision');
    },
    survivor
  ];
  harness.flushBubbleModifications();

  // The rest of the frame still runs, the failure is reported, and the batch is released.
  expect(survivor).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  expect(scrollSaver.restore).toHaveBeenCalledTimes(1);
  expect(harness.batchingModifying).toBeUndefined();

  const later = vi.fn();
  harness.batchingModifying = [later];
  harness.flushBubbleModifications();
  expect(later).toHaveBeenCalledTimes(1);
  expect(harness.batchingModifying).toBeUndefined();
});

test('a modification queued from inside a flush starts a new batch instead of being dropped', () => {
  const scrollSaver = {save: vi.fn(), restore: vi.fn()};
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    log: {error: vi.fn()},
    createScrollSaver: () => scrollSaver
  }) as any;

  const reentrant = vi.fn();
  harness.batchingModifying = [() => {
    harness.batchingModifying = [reentrant];
  }];
  harness.flushBubbleModifications();

  expect(reentrant).not.toHaveBeenCalled();
  expect(harness.batchingModifying).toEqual([reentrant]);
});

import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import type {Message} from '@layer';
import '@helpers/peerIdPolyfill';
import {createRoot, onCleanup} from 'solid-js';
import {getMiddleware} from '@helpers/middleware';
import {ChatType} from '@components/chat/chatType';
import isCollected from '@/tests/helpers/collectGarbage';

/**
 * What a chat keeps of the bubbles it took off, the rule written before the code: a bubble a slice or a deletion
 * took off the list, and a group left with no bubbles, are let go of at once - not when the chat is left, which
 * kept every bubble scrolled past in memory, its whole DOM with it, for as long as the chat stayed open.
 */

// * jsdom's selector engines keep the node the last query of a selector ran on - a finished bubble's media query
// * would hold it there, which a browser does not
vi.mock('@helpers/dom/mediaPreviewAccessibility', () => ({default: () => {}}));

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let BubbleGroups: typeof import('@components/chat/bubbleGroups').default;

beforeAll(async() => {
  ({bubbles: {default: ChatBubbles}, BubbleGroups} = await loadChatBubbles());
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const cleanups: VoidFunction[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
});

const PEER_ID = 10 as PeerId;

describe('a bubble taken off the list', () => {
  function setup() {
    const chatInner = document.createElement('div');
    document.body.append(chatInner);
    // * the peer's generation: it lives as long as the chat shows this peer
    const peerMiddlewareHelper = getMiddleware();
    const chatInnerMiddlewareHelper = getMiddleware().get().create();
    cleanups.push(() => peerMiddlewareHelper.destroy());
    const bubbles: Record<string, HTMLElement> = {};
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      renderingMessages: new Set<string>(),
      pendingRerenders: new Map(),
      bubbles,
      skippedMids: new Set<string>(),
      bubblesToReplace: new Map(),
      hiddenLinksPendingBubbles: new Set<HTMLElement>(),
      bubbleGroups: {changeBubbleByBubble: () => {}, getItemByBubble: (): undefined => undefined},
      chat: {isBotforum: false, peerId: PEER_ID, getMessageByPeer: (): undefined => undefined},
      chatInner,
      chatInnerMiddlewareHelper,
      managers: {},
      getMiddleware: () => peerMiddlewareHelper.get(),
      // * a plain function: a mock would keep every bubble it was called with
      renderMessage: ({bubble, message, reverse}: any) => Promise.resolve({bubble, message, reverse, promises: []}),
      renderMessagesQueue: () => {},
      log: {error: () => {}}
    }) as any;

    return {harness, bubbles, chatInner, peerMiddlewareHelper};
  }

  function message(mid: number): Message.message {
    return {
      _: 'message',
      pFlags: {},
      id: mid,
      mid,
      peer_id: {_: 'peerUser', user_id: PEER_ID},
      peerId: PEER_ID,
      date: 1,
      message: 'text'
    };
  }

  test('can be collected while its chat stays open', async() => {
    const {harness, bubbles, chatInner, peerMiddlewareHelper} = setup();
    await harness.safeRenderMessage({message: message(100)});
    let bubble = bubbles['10_100'];
    chatInner.append(bubble);

    // * as a slice takes it off (deleteBubble)
    bubble.remove();
    delete bubbles['10_100'];
    bubble.middlewareHelper.destroy();
    const ref = new WeakRef(bubble);
    bubble = undefined;

    expect(peerMiddlewareHelper.get()(), 'the chat still shows the peer').toBe(true);
    expect(await isCollected(ref), 'the bubble stays in memory until the chat is left').toBe(true);
  });

  test('still has its work stopped when the chat is left', async() => {
    const {harness, bubbles, peerMiddlewareHelper} = setup();
    await harness.safeRenderMessage({message: message(100)});
    // * never mounted, so nothing else ever takes it off
    const bubble = bubbles['10_100'];
    const stopped = vi.fn();
    bubble.middlewareHelper.get().onClean(stopped);

    peerMiddlewareHelper.clean();
    expect(stopped).toHaveBeenCalledOnce();
  });
});

describe('a group left with no bubbles', () => {
  function setup() {
    // * the peer's generation, whose child each group's middleware is
    const peerMiddlewareHelper = getMiddleware();
    cleanups.push(() => peerMiddlewareHelper.destroy());
    const container = document.createElement('div');
    document.body.append(container);
    const date = {container, groupsLength: 0};
    const chat: any = {
      peerId: PEER_ID,
      type: ChatType.Chat,
      isOutMessage: () => false,
      bubbles: {
        getMiddleware: () => peerMiddlewareHelper.get(),
        getDateForDateContainer: () => ({dateTimestamp: 86_400_000}),
        getDateContainerByTimestamp: () => date,
        deleteEmptyDateGroups: () => {},
        changedMids: new Map()
      }
    };
    const groups = new BubbleGroups(chat);
    return {
      groups,
      groupsOfThePeer: () => (peerMiddlewareHelper as any).details.inner.length as number,
      add(mid: number, mount = true) {
        const bubble = document.createElement('div');
        const message: any = {_: 'message', pFlags: {}, mid, id: mid, peerId: PEER_ID, fromId: PEER_ID, date: 86_400 + mid, message: ''};
        groups.prepareForGrouping(bubble, message, false);
        const modified = [...groups.groupUngrouped()];
        if(mount) groups.mountUnmountGroups(modified);
        return {bubble, group: groups.getItemByBubble(bubble).group};
      }
    };
  }

  // * what the group's avatar is: a Solid root disposed when the group's middleware is destroyed
  function rootOwnedBy(group: {middlewareHelper: ReturnType<typeof getMiddleware>}) {
    const disposed = vi.fn();
    createRoot((dispose) => {
      group.middlewareHelper.get().onDestroy(dispose);
      onCleanup(disposed);
    });
    return disposed;
  }

  test.each([true, false])('lets go of what it owns at once (mounted: %s)', (mounted) => {
    const {groups, groupsOfThePeer, add} = setup();
    const {bubble, group} = add(1, mounted);
    const disposed = rootOwnedBy(group);

    groups.removeAndUnmountBubble(bubble);
    expect(groups.groups).toHaveLength(0);
    expect(disposed, 'its avatar stays until the chat is left').toHaveBeenCalledOnce();
    expect(groupsOfThePeer(), 'the chat keeps the empty group').toBe(0);
  });

  test('settles its avatar wait when it goes before its avatar has loaded', async() => {
    const {groups, add} = setup();
    // * as a batch does: the group and its avatar first, its mount once the avatar is there (processBatch)
    const {bubble, group} = add(1, false);
    const avatarLoaded = group.createAvatar(group.firstItem.message);
    let settled = false;
    avatarLoaded.then(() => settled = true);

    groups.removeAndUnmountBubble(bubble);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled, 'the batch waits for an avatar that never comes').toBe(true);
  });

  test('a group that keeps some of its bubbles keeps what it owns', () => {
    const {groups, add} = setup();
    const first = add(1);
    const second = add(2);
    expect(second.group).toBe(first.group);
    const disposed = rootOwnedBy(first.group);

    groups.removeAndUnmountBubble(first.bubble);
    expect(disposed).not.toHaveBeenCalled();
    expect(add(3).group, 'a new bubble joins the group still there').toBe(first.group);
    groups.removeAndUnmountBubble(second.bubble);
    expect(disposed).not.toHaveBeenCalled();
  });

  test('scrolling through many groups leaves none of them with the chat', () => {
    const {groups, groupsOfThePeer, add} = setup();
    for(let mid = 1; mid <= 25; ++mid) {
      const {bubble} = add(mid);
      groups.removeAndUnmountBubble(bubble);
    }
    expect(groupsOfThePeer()).toBe(0);
  });
});

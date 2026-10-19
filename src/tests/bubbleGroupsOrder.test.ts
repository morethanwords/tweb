import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import type {Message} from '@layer';
import '@helpers/peerIdPolyfill';
import {getMiddleware} from '@helpers/middleware';
import {ChatType} from '@components/chat/chatType';
import {BubbleTimelineKey, compareBubbleTimelineKeys, makeBubbleTimelineKey} from '@components/chat/bubbleTimelineOrder';

/**
 * The order and grouping of a chat's bubbles, driven through the code paths the chat uses: a batch of new
 * bubbles (`groupBubbles` + `mountUnmountGroups`), a message taking its server identity
 * (`updateGroupedMessage`, behind `history_update`, `message_sent` and the Solid body), a deletion
 * (`removeAndUnmountBubble`). Every expectation is the rule, written down before the code ran:
 * - top to bottom, messages go by id; a send still on its way by its temporary id (a step past the message
 *   that was last when it was sent) until an earlier send takes its server id — then right behind that one,
 *   in the order they were sent; an ephemeral message comes right after the message it follows, which keeps
 *   it while it is dated no later;
 * - neighbours share a group exactly when they can be grouped: one sender, one day, at most 121 s apart.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let BubbleGroups: typeof import('@components/chat/bubbleGroups').default;
let STICKY_OFFSET: number;

const PEER_ID = 10 as PeerId;
const MY_ID = 20 as PeerId;
const DAY = 86400;
const T = DAY * 20000 + 3600; // some day, an hour in

beforeAll(async() => {
  const loaded = await loadChatBubbles();
  BubbleGroups = loaded.BubbleGroups;
  ChatBubbles = loaded.bubbles.default;
  STICKY_OFFSET = loaded.bubbles.STICKY_OFFSET;
  const rootScope = (await import('@lib/rootScope')).default;
  rootScope.myId = MY_ID;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

afterEach(() => {
  document.body.replaceChildren();
});

type TestMessage = Message.message & {name: string};

function incoming(name: string, mid: number, date: number): TestMessage {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    date,
    message: name,
    peer_id: {_: 'peerUser', user_id: PEER_ID.toUserId()},
    peerId: PEER_ID,
    fromId: PEER_ID,
    name
  };
}

function outgoing(name: string, mid: number, date: number): TestMessage {
  return {...incoming(name, mid, date), pFlags: {out: true}, fromId: MY_ID};
}

/** a send on its way: a temporary id a step past the top message, as `generateTempMessageId` makes it */
function sending(name: string, mid: number, date: number): TestMessage {
  return {...outgoing(name, mid, date), pending: true};
}

/** the same message once the server has given it its id (and date) */
function confirmed(message: TestMessage, mid: number, date = message.date): TestMessage {
  const {pending, ...rest} = message;
  return {...rest, id: mid, mid, date};
}

function ephemeral(name: string, mid: number, date: number, order: number): TestMessage {
  return {
    ...incoming(name, mid, date),
    pFlags: {ephemeral: true},
    ephemeral_id: mid,
    ephemeral_receiver_id: MY_ID.toUserId(),
    ephemeral_order: order
  } as TestMessage;
}

function makeChat(type = ChatType.Chat) {
  const root = document.createElement('div');
  document.body.append(root);
  const middlewareHelper = getMiddleware();
  const dateContainers = new Map<number, {container: HTMLElement, groupsLength: number}>();
  /** the server ids the sends took, by temporary id (`message_sent`) */
  const changedMids = new Map<number, number>();
  const chat: any = {
    type,
    peerId: PEER_ID,
    isOutMessage: (message: Message.message) => !!message.pFlags?.out,
    bubbles: {
      getMiddleware: () => middlewareHelper.get(),
      getDateForDateContainer: (timestamp: number) => ({dateTimestamp: Math.floor(timestamp / DAY) * DAY * 1000}),
      getDateContainerByTimestamp: (timestamp: number) => {
        let dateContainer = dateContainers.get(timestamp);
        if(!dateContainer) {
          const container = document.createElement('div');
          container.classList.add('bubbles-date-group');
          for(let i = 0; i < STICKY_OFFSET; ++i) {
            container.append(document.createElement('span'));
          }

          dateContainers.set(timestamp, dateContainer = {container, groupsLength: 0});
          const later = [...dateContainers.keys()].sort((a, b) => a - b).find((key) => key > timestamp);
          root.insertBefore(container, later === undefined ? null : dateContainers.get(later).container);
        }

        return dateContainer;
      },
      deleteEmptyDateGroups: () => {},
      changedMids
    },
    selection: {isSelecting: false},
    getMessageByPeer: (_: PeerId, mid: number) => mirror.get(mid)
  };
  /** the messages as the mirror has them, once the server has taken them (`sent`) */
  const mirror = new Map<number, TestMessage>();

  const bubbleGroups = new BubbleGroups(chat);
  const bubblesToReplace = new Map<HTMLElement, {regroupMessage?: Message.message}>();
  /** the chat's bubbles by full mid, as `getBubble` reads them */
  const registry: Record<string, HTMLElement> = {};
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat,
    bubbles: registry,
    changedMids,
    bubbleGroups,
    bubblesToReplace,
    isAvatarNeeded: () => false,
    createScrollSaver: () => {
      ++scrollSaves;
      return {save: () => {}, restore: () => {}};
    },
    setUnreadDelimiter: (): void => undefined,
    prepareToSaveScroll: () => ({}),
    lazyLoadQueue: {setAllSeen: () => {}},
    // the bubble's own render is not what these tests look at
    safeRenderMessage: (): void => undefined
  }) as any;
  const batchLog = Object.assign(() => {}, {groupCollapsed: () => {}, groupEnd: () => {}});
  let scrollSaves = 0;

  const bubbles = new Map<string, HTMLElement>();
  const makeBubble = (message: TestMessage) => {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    bubble.dataset.name = message.name;
    bubbles.set(message.name, bubble);
    return bubble;
  };

  return {
    root,
    bubbleGroups,
    /** a replacement render of a bubble that its batch has not committed yet */
    stageReplacement(name: string) {
      const transaction: {regroupMessage?: Message.message} = {};
      bubblesToReplace.set(bubbles.get(name), transaction);
      return transaction;
    },
    /** a batch of new bubbles, the way `processBatch` files and mounts them */
    render(...messages: TestMessage[]) {
      const {groups} = harness.groupBubbles(messages.map((message) => ({
        bubble: makeBubble(message),
        message,
        reverse: false
      })));
      bubbleGroups.mountUnmountGroups(groups);
    },
    /** renders under way: each bubble registered under its message, its result queued (`safeRenderMessage`) */
    startRendering(...messages: TestMessage[]) {
      return messages.map((message) => {
        const bubble = makeBubble(message);
        registry[harness.makeFullMid(message)] = bubble;
        return {bubble, message, reverse: false, promises: [] as Promise<any>[], updatePosition: true};
      });
    },
    /** the batch that files and mounts finished renders (`processBatch`) */
    batch(queue: Array<{bubble: HTMLElement, message: TestMessage}>) {
      return harness.processBatch(queue, <T>(promise: T) => promise, batchLog);
    },
    /** a send's server id taken over by its bubble wherever its render stands, as `message_sent` does it */
    sent(message: TestMessage, mid: number) {
      const bubble = bubbles.get(message.name);
      mirror.set(mid, confirmed(message, mid));
      harness.changedMids.set(message.mid, mid);
      delete registry[harness.makeFullMid(message)];
      registry[harness.makeFullMid(confirmed(message, mid))] = bubble;
      bubble.dataset.mid = '' + mid;
    },
    /** an album's bubble, rendered by `was`, rendered again with the items it has now (`rerenderGroupedBubble`) */
    rerenderAlbum(was: TestMessage, main: TestMessage) {
      const bubble = bubbles.get(was.name);
      const fullMid = harness.makeFullMid(was);
      registry[fullMid] = bubble;
      harness.rerenderGroupedBubble(bubble, fullMid, main);
    },
    /** the messages the chat holds as rendered, top to bottom */
    history() {
      return harness.getRenderedHistory('asc');
    },
    /** the server's identity for a message already on screen */
    update(message: TestMessage, options?: {regroup?: boolean}) {
      harness.updateGroupedMessage(bubbles.get(message.name), message, options);
    },
    /** a streamed message made final on its own bubble (`commitFinalTypingMessage`) */
    finalize(message: TestMessage) {
      harness.repositionMessageBubblePreservingScroll(bubbles.get(message.name), message);
    },
    /** a replacement render committed by its batch (`commitBubbleReplacements`), mounted once */
    commitReplacement(message: TestMessage) {
      bubbleGroups.mountUnmountGroups(harness.repositionMessageBubble(bubbles.get(message.name), message, false));
    },
    scrollSaves() {
      return scrollSaves;
    },
    remove(name: string) {
      bubbleGroups.removeAndUnmountBubble(bubbles.get(name));
    },
    /** what is on screen, top to bottom */
    order() {
      return Array.from(root.querySelectorAll<HTMLElement>('.bubble')).map((bubble) => bubble.dataset.name);
    },
    days() {
      return Array.from(root.children).map((day) => {
        return Array.from(day.querySelectorAll<HTMLElement>('.bubble')).map((bubble) => bubble.dataset.name);
      }).filter((names) => names.length);
    },
    groups() {
      return Array.from(root.querySelectorAll('.bubbles-group')).map((group) => {
        return Array.from(group.querySelectorAll<HTMLElement>('.bubble')).map((bubble) => bubble.dataset.name);
      });
    },
    /** the module's own bookkeeping says what the screen shows */
    expectConsistent() {
      const name = (item: {bubble: HTMLElement}) => item.bubble.dataset.name;
      expect(bubbleGroups.itemsArr.map(name).reverse()).toEqual(this.order());
      expect(bubbleGroups.groups.map((group) => group.items.map(name).reverse()).reverse()).toEqual(this.groups());
      expect(bubbleGroups.itemsArr.every((item) => item.mounted && item.bubble.isConnected)).toBe(true);
    }
  };
}

describe('a send the server confirms', () => {
  test('keeps an incoming message that arrives late above the sends that came after it', () => {
    const chat = makeChat();
    const x = incoming('x', 100, T);
    chat.render(x);

    const a = sending('a', 100.0001, T + 10);
    const b = sending('b', 100.0002, T + 11);
    chat.render(a);
    chat.render(b);
    expect(chat.order()).toEqual(['x', 'a', 'b']);

    // the server took `a` after a message it had not delivered yet
    chat.update(confirmed(a, 102));
    expect(chat.order()).toEqual(['x', 'a', 'b']);
    chat.render(incoming('i', 101, T + 9));
    expect(chat.order()).toEqual(['x', 'i', 'a', 'b']);
    chat.update(confirmed(b, 103));
    expect(chat.order()).toEqual(['x', 'i', 'a', 'b']);
    chat.render(sending('c', 103.0001, T + 20));

    expect(chat.order()).toEqual(['x', 'i', 'a', 'b', 'c']);
    expect(chat.groups()).toEqual([['x', 'i'], ['a', 'b', 'c']]);
    chat.expectConsistent();
  });

  test('takes the later sends along when a send is rebuilt from the server message', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    chat.render(a);
    chat.render(sending('b', 100.0002, T + 11));

    // `message_sent` cancelling a replacement that was being staged
    chat.update(confirmed(a, 101), {regroup: true});

    expect(chat.order()).toEqual(['x', 'a', 'b']);
    chat.expectConsistent();
  });

  test('keeps the view in place with one measurement however many sends move', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const [a, ...later] = [100.0001, 100.0002, 100.0003, 100.0004, 100.0005].map((mid, idx) => {
      return sending('abcde'[idx], mid, T + 10 + idx);
    });
    for(const send of [a, ...later]) {
      chat.render(send);
    }
    chat.render(incoming('i', 101, T + 20));
    expect(chat.order()).toEqual(['x', 'a', 'b', 'c', 'd', 'e', 'i']);
    const savesBefore = chat.scrollSaves();

    chat.update(confirmed(a, 102));

    expect(chat.order()).toEqual(['x', 'i', 'a', 'b', 'c', 'd', 'e']);
    expect(chat.scrollSaves() - savesBefore).toBe(1);
    chat.expectConsistent();
  });

  test('works the same whichever of two confirmations reaches the bubble first', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    chat.render(a);

    chat.update(confirmed(a, 101));
    chat.update(confirmed(a, 101));

    expect(chat.order()).toEqual(['x', 'a']);
    chat.expectConsistent();
  });

  test('puts a message that arrives meanwhile under what is still being sent, and the sends under it when sent', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    const b = sending('b', 100.0002, T + 11);
    chat.render(a);
    chat.render(b);
    chat.render(incoming('i', 101, T + 12));

    expect(chat.order()).toEqual(['x', 'a', 'b', 'i']);
    expect(chat.groups()).toEqual([['x'], ['a', 'b'], ['i']]);
    chat.expectConsistent();

    chat.update(confirmed(a, 102));

    expect(chat.order()).toEqual(['x', 'i', 'a', 'b']);
    expect(chat.groups()).toEqual([['x', 'i'], ['a', 'b']]);
    chat.expectConsistent();

    chat.update(confirmed(b, 103));

    expect(chat.order()).toEqual(['x', 'i', 'a', 'b']);
    chat.expectConsistent();
  });

  test('moves a long upload once, when it is sent, however many messages go out meanwhile', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const f = sending('f', 100.0001, T + 1);
    chat.render(f);

    const t1 = sending('t1', 100.0002, T + 5);
    chat.render(t1);
    chat.update(confirmed(t1, 101));
    expect(chat.order()).toEqual(['x', 'f', 't1']);

    const t2 = sending('t2', 101.0001, T + 6);
    chat.render(t2);
    chat.update(confirmed(t2, 102));
    expect(chat.order()).toEqual(['x', 'f', 't1', 't2']);
    chat.expectConsistent();

    chat.update(confirmed(f, 103, T + 600));

    expect(chat.order()).toEqual(['x', 't1', 't2', 'f']);
    expect(chat.groups()).toEqual([['x'], ['t1', 't2'], ['f']]);
    chat.expectConsistent();
  });

  test('puts a send whose bubble comes in after an earlier send was confirmed behind that one', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    const b = sending('b', 100.0002, T + 11);
    const c = sending('c', 100.0003, T + 12);
    await chat.batch(chat.startRendering(a));

    // sent in a burst: the server takes `a` before the bubbles of `b` and `c` are in
    chat.sent(a, 102);
    chat.update(confirmed(a, 102));
    await chat.batch(chat.startRendering(b));
    expect(chat.order()).toEqual(['x', 'a', 'b']);
    chat.render(incoming('i', 101, T + 9));
    expect(chat.order()).toEqual(['x', 'i', 'a', 'b']);
    await chat.batch(chat.startRendering(c));

    expect(chat.order()).toEqual(['x', 'i', 'a', 'b', 'c']);
    expect(chat.groups()).toEqual([['x', 'i'], ['a', 'b', 'c']]);
    chat.expectConsistent();

    chat.sent(c, 103);
    chat.update(confirmed(c, 103));
    expect(chat.order()).toEqual(['x', 'i', 'a', 'b', 'c']);
    chat.sent(b, 104);
    chat.update(confirmed(b, 104));

    // `b` takes an id past `c`'s, and moves behind it then, as it would have with its bubble in all along
    expect(chat.order()).toEqual(['x', 'i', 'a', 'c', 'b']);
    chat.expectConsistent();
  });

  test('puts a late bubble behind an earlier send the server took before its own bubble came in', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    const b = sending('b', 100.0002, T + 11);
    const queue = chat.startRendering(a);
    chat.sent(a, 101);
    await chat.batch(queue);
    chat.update(confirmed(a, 101));
    chat.render(incoming('i', 102, T + 12));
    await chat.batch(chat.startRendering(b));

    expect(chat.order()).toEqual(['x', 'a', 'b', 'i']);
    chat.expectConsistent();
  });

  test('keeps late bubbles in the order they were sent, whichever comes in first', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    const [b, c, d, e] = [100.0002, 100.0003, 100.0004, 100.0005].map((mid, idx) => sending('bcde'[idx], mid, T + 11 + idx));
    await chat.batch(chat.startRendering(a));
    await chat.batch(chat.startRendering(b));
    chat.sent(a, 102);
    chat.update(confirmed(a, 102));
    expect(chat.order()).toEqual(['x', 'a', 'b']);

    // * an upload's bubble comes in after the texts sent behind it
    await chat.batch(chat.startRendering(e));
    await chat.batch(chat.startRendering(c));
    await chat.batch(chat.startRendering(d));

    expect(chat.order()).toEqual(['x', 'a', 'b', 'c', 'd', 'e']);
    chat.expectConsistent();
  });

  test('puts a send made after the earlier ones were moved behind a confirmed one after them', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    const b = sending('b', 100.0002, T + 11);
    chat.render(a);
    chat.render(b);
    chat.sent(a, 101);
    chat.update(confirmed(a, 101));

    // * the next temporary id is a step past the server id `a` took
    chat.render(sending('c', 101.0001, T + 12));

    expect(chat.order()).toEqual(['x', 'a', 'b', 'c']);
    chat.expectConsistent();
  });

  test('leaves a long upload rendered late above the messages sent after it', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const f = sending('f', 100.0001, T + 1);
    const t1 = sending('t1', 100.0002, T + 5);
    await chat.batch(chat.startRendering(t1));
    chat.sent(t1, 101);
    chat.update(confirmed(t1, 101));
    await chat.batch(chat.startRendering(f));

    expect(chat.order()).toEqual(['x', 'f', 't1']);
    chat.expectConsistent();
  });

  test('keeps a send above a message the server made after it', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    chat.render(a);
    chat.render(incoming('i', 103, T + 11));

    expect(chat.order()).toEqual(['x', 'a', 'i']);

    // the server took `a` before it made `i`
    chat.update(confirmed(a, 102));

    expect(chat.order()).toEqual(['x', 'a', 'i']);
    expect(chat.groups()).toEqual([['x'], ['a'], ['i']]);
    chat.expectConsistent();
  });

  test('groups by the date the server gave the message', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    chat.render(a);

    // a slow send: the server dates it more than two minutes after it was typed
    chat.update(confirmed(a, 101, T + 300));
    chat.render(outgoing('b', 102, T + 301));

    expect(chat.groups()).toEqual([['x'], ['a', 'b']]);
    chat.expectConsistent();
  });

  test('joins the group before it when the server dates it close enough', () => {
    const chat = makeChat();
    chat.render(outgoing('x', 100, T));
    const a = sending('a', 100.0001, T + 200); // a clock running ahead
    chat.render(a);
    expect(chat.groups()).toEqual([['x'], ['a']]);

    chat.update(confirmed(a, 101, T + 50));

    expect(chat.groups()).toEqual([['x', 'a']]);
    chat.expectConsistent();
  });

  test('moves a send the server dates the next day under that day', () => {
    const chat = makeChat();
    const midnight = T - 3600 + DAY;
    chat.render(incoming('x', 100, midnight - 30));
    const a = sending('a', 100.0001, midnight - 1);
    chat.render(a);

    chat.update(confirmed(a, 101, midnight + 1));

    expect(chat.days()).toEqual([['x'], ['a']]);
    chat.expectConsistent();
  });

  test('keeps a send still on its way at midnight under its own day', () => {
    const chat = makeChat();
    const midnight = T - 3600 + DAY;
    chat.render(incoming('x', 100, midnight - 60));
    const a = sending('a', 100.0001, midnight - 10); // a long upload
    chat.render(a);
    chat.render(incoming('y', 101, midnight + 10));

    expect(chat.days()).toEqual([['x', 'a'], ['y']]);
    chat.expectConsistent();

    // the server dates it when it finishes: after midnight, after `y`
    chat.update(confirmed(a, 102, midnight + 20));

    expect(chat.days()).toEqual([['x'], ['y', 'a']]);
    chat.expectConsistent();
  });

  test('keeps a send moved behind an earlier one under its own day', () => {
    const chat = makeChat();
    const midnight = T - 3600 + DAY;
    chat.render(incoming('x', 100, midnight - 60));
    const a = sending('a', 100.0001, midnight - 10);
    const b = sending('b', 100.0002, midnight - 5);
    chat.render(a);
    chat.render(b);
    chat.render(incoming('y', 101, midnight + 5));

    chat.update(confirmed(a, 102, midnight + 10));

    expect(chat.days()).toEqual([['x', 'b'], ['y', 'a']]);
    chat.expectConsistent();

    chat.update(confirmed(b, 103, midnight + 11));

    expect(chat.days()).toEqual([['x'], ['y', 'a', 'b']]);
    chat.expectConsistent();
  });

  test('leaves a replacement being staged to the batch that commits it', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    chat.render(a);
    chat.render(incoming('i', 101, T + 11));
    const transaction = chat.stageReplacement('a');

    const final = confirmed(a, 102);
    chat.update(final);

    expect(chat.order()).toEqual(['x', 'a', 'i']);
    expect(transaction.regroupMessage).toBe(final);
    chat.expectConsistent();
  });

  test('shows the sends the server took before the batch that mounts them began', async() => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const a = sending('a', 100.0001, T + 10);
    await chat.batch(chat.startRendering(a));
    chat.sent(a, 101);
    chat.update(confirmed(a, 101));

    // sent in a burst: b and c wait for the next batch, and the server takes them meanwhile
    const b = sending('b', 101.0001, T + 11);
    const c = sending('c', 101.0002, T + 12);
    const queue = chat.startRendering(b, c);
    chat.sent(b, 102);
    chat.sent(c, 103);
    await chat.batch(queue);

    expect(chat.order()).toEqual(['x', 'a', 'b', 'c']);
    expect(chat.groups()).toEqual([['x'], ['a', 'b', 'c']]);
    chat.expectConsistent();

    // `history_update`, which waits for that batch
    chat.update(confirmed(b, 102));
    chat.update(confirmed(c, 103));

    expect(chat.order()).toEqual(['x', 'a', 'b', 'c']);
    expect(chat.groups()).toEqual([['x'], ['a', 'b', 'c']]);
    chat.expectConsistent();
  });

  test('groups a scheduled send the server took before its batch began by the message it became', async() => {
    const chat = makeChat(ChatType.Scheduled);
    const a = sending('a', 100.0001, T + 600);
    const queue = chat.startRendering(a);
    chat.sent(a, 101);
    await chat.batch(queue);

    // a scheduled chat has no `history_update` to give it that identity later
    expect(chat.history()).toEqual(['10_101']);
    chat.expectConsistent();
  });

  test.each([
    // `message_sent` came first, and found no bubble to give the id to
    ['a send the server took before its render began', () => {
      const a = sending('a', 100.0001, T + 10);
      return {event: a, now: confirmed(a, 101), changedMids: new Map([[a.mid, 101]])};
    }],
    // the new message and its edit came in one batch, and the edit found no bubble to go to
    ['a message edited in the batch it came in', () => {
      const a = incoming('a', 101, T + 10);
      return {event: a, now: {...a, message: 'a, edited', edit_date: T + 11}, changedMids: new Map<number, number>()};
    }]
  ])('renders %s as it is by now', async(_, make) => {
    const {event, now, changedMids} = make();
    const safeRenderMessage = vi.fn();
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      log: {bindPrefix: () => () => {}},
      chatInner: document.createElement('div'),
      scrollable: {loadedAll: {top: true, bottom: true}},
      changedMids,
      chat: {getMessageByPeer: (peerId: PeerId, mid: number) => peerId === PEER_ID && mid === now.mid ? now : undefined},
      batchProcessor: {},
      safeRenderMessage,
      checkIfEmptyPlaceholderNeeded: (): void => undefined
    }) as any;

    await harness.performHistoryResult({history: [event]}, false);

    expect(safeRenderMessage).toHaveBeenCalledOnce();
    expect(safeRenderMessage.mock.calls[0][0].message).toBe(now);
  });
});

describe('an album', () => {
  test('goes by its oldest item when that one comes after the album was rendered', () => {
    const chat = makeChat();
    chat.render(incoming('x', 99, T));
    const b: TestMessage = {...incoming('b', 101, T + 1), grouped_id: 'g'};
    chat.render(b); // the album as far as it has come: its second item

    chat.rerenderAlbum(b, {...incoming('a', 100, T + 1), grouped_id: 'g'});

    expect(chat.history()).toEqual(['10_99', '10_100']);
    chat.expectConsistent();
  });
});

describe('grouping', () => {
  test('joins the nearest group of a sender, not one further away', () => {
    const chat = makeChat();
    // dates out of step with ids, as in an imported chat: 1 and 2 are too far apart to share a group
    chat.render(outgoing('1', 1, T + 300));
    chat.render(outgoing('2', 2, T + 100));
    chat.render(outgoing('3', 3, T + 200));

    expect(chat.order()).toEqual(['1', '2', '3']);
    expect(chat.groups()).toEqual([['1'], ['2', '3']]);
    chat.expectConsistent();
  });

  test('keeps every message on screen when a deletion joins two groups', () => {
    const chat = makeChat();
    // 1 is within two minutes of 3 but not of 2, so 1, 2 and 3 only share a group in the order they came
    chat.render(outgoing('3', 3, T + 100));
    chat.render(outgoing('1', 1, T));
    chat.render(outgoing('2', 2, T + 200));
    chat.render(incoming('s', 4, T + 140));
    chat.render(outgoing('5', 5, T + 150));
    expect(chat.order()).toEqual(['1', '2', '3', 's', '5']);

    chat.remove('s');

    expect(chat.order()).toEqual(['1', '2', '3', '5']);
    expect(chat.groups()).toEqual([['1'], ['2', '3', '5']]);
    chat.expectConsistent();
  });
});

describe('ephemeral messages', () => {
  const EPHEMERAL = 0x200000000;

  test('go between the history messages dated around them', () => {
    const chat = makeChat();
    chat.render(incoming('40', 40, T - 1), incoming('50', 50, T + 1));
    chat.render(ephemeral('e', EPHEMERAL + 7, T, 1));

    expect(chat.order()).toEqual(['40', 'e', '50']);
    chat.expectConsistent();
  });

  test('come after a history message of the same second, and after each other in the order they came', () => {
    const chat = makeChat();
    chat.render(incoming('100', 100, T));
    chat.render(ephemeral('second', EPHEMERAL + 1, T, 2), ephemeral('first', EPHEMERAL + 50, T, 1));

    expect(chat.order()).toEqual(['100', 'first', 'second']);
    chat.expectConsistent();
  });

  test('are placed from the history around them even when a batch brings them first', () => {
    const chat = makeChat();
    chat.render(ephemeral('e', EPHEMERAL + 7, T, 1), incoming('40', 40, T - 1), incoming('50', 50, T + 1));

    expect(chat.order()).toEqual(['40', 'e', '50']);
    chat.expectConsistent();
  });

  test('stay put when history with skewed dates comes around them', () => {
    const chat = makeChat();
    // r1 is newer by id, r2 by date: no order by date alone holds all three
    chat.render(outgoing('r1', 100, T + 2), incoming('r2', 101, T));
    chat.render(ephemeral('e', EPHEMERAL + 1, T + 1, 1));
    chat.render(sending('a', 101.0001, T + 3));

    expect(chat.order()).toEqual(['r1', 'r2', 'e', 'a']);
    chat.expectConsistent();
  });

  test('let a message that arrives after them follow them', () => {
    const chat = makeChat();
    chat.render(incoming('100', 100, T));
    chat.render(ephemeral('e', EPHEMERAL + 1, T + 5, 1));
    // delivered late: dated before the ephemeral message, but it came after it
    chat.render(incoming('101', 101, T + 4));
    const a = sending('a', 101.0001, T + 6);
    chat.render(a);
    chat.update(confirmed(a, 102));

    expect(chat.order()).toEqual(['100', 'e', '101', 'a']);
    chat.expectConsistent();
  });

  test('stay under the command they answer when the answer comes before the command is confirmed', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const command = sending('command', 100.0001, T + 10);
    chat.render(command);
    chat.render(ephemeral('answer', EPHEMERAL + 1, T + 11, 1));
    expect(chat.order()).toEqual(['x', 'command', 'answer']);

    chat.update(confirmed(command, 101, T + 10));

    expect(chat.order()).toEqual(['x', 'command', 'answer']);
    chat.expectConsistent();
  });

  test.each(['on its own bubble', 'by its batch'] as const)('stay under a streamed message made final %s', (way) => {
    const chat = makeChat();
    chat.render(incoming('h', 100, T));
    const draft = incoming('draft', 100.0001, T + 1); // a bot's reply on its way, at a temporary id
    chat.render(draft);
    chat.render(ephemeral('e', EPHEMERAL + 1, T + 2, 1));
    expect(chat.order()).toEqual(['h', 'draft', 'e']);

    const final: TestMessage = {...draft, id: 101, mid: 101};
    if(way === 'on its own bubble') chat.finalize(final);
    else chat.commitReplacement(final);

    expect(chat.order()).toEqual(['h', 'draft', 'e']);
    chat.expectConsistent();
  });

  test('come before an upload the server dates after them', () => {
    const chat = makeChat();
    chat.render(incoming('x', 100, T));
    const f = sending('f', 100.0001, T);
    chat.render(f);
    chat.render(ephemeral('e', EPHEMERAL + 1, T + 60, 1));
    expect(chat.order()).toEqual(['x', 'f', 'e']);

    chat.update(confirmed(f, 101, T + 600));

    expect(chat.order()).toEqual(['x', 'e', 'f']);
    chat.expectConsistent();
  });

  test('older than every message on screen go above them, under older history loaded later', () => {
    const chat = makeChat();
    chat.render(incoming('100', 100, T));
    chat.render(ephemeral('e', EPHEMERAL + 1, T - 60, 1));
    chat.render(incoming('90', 90, T - 120));

    expect(chat.order()).toEqual(['90', 'e', '100']);
    chat.expectConsistent();
  });
});

describe('the timeline key', () => {
  function key(message: TestMessage, position = message.mid) {
    return makeBubbleTimelineKey(message, message.mid, Math.floor(message.date / DAY) * DAY * 1000, position);
  }

  test('orders history by id even when dates disagree', () => {
    expect(compareBubbleTimelineKeys(key(incoming('a', 50, T + 1)), key(incoming('b', 100, T)))).toBeLessThan(0);
  });

  test('is a total order', () => {
    const keys: BubbleTimelineKey[] = [
      key(incoming('a', 100, T + 2)),
      key(incoming('b', 101, T)),
      key(incoming('c', 102, T + 1)),
      key(ephemeral('e', 0x200000001, T + 1, 1), 101),
      key(ephemeral('f', 0x200000002, T + 1, 2), 101),
      key(ephemeral('g', 0x200000003, T, 3), 100),
      key(sending('s', 102.0001, T - 10)),
      key(sending('t', 102.0002, T - 20)),
      key(sending('u', 102.0003, T - DAY)),
      key(incoming('d', 103, T + DAY)),
      key(incoming('o', 104, T - DAY))
    ];

    const sign = (value: number) => Math.sign(value);
    for(const a of keys) {
      expect(compareBubbleTimelineKeys(a, a)).toBe(0);
      for(const b of keys) {
        expect(sign(compareBubbleTimelineKeys(a, b)) + sign(compareBubbleTimelineKeys(b, a))).toBe(0);
        for(const c of keys) {
          if(compareBubbleTimelineKeys(a, b) < 0 && compareBubbleTimelineKeys(b, c) < 0) {
            expect(compareBubbleTimelineKeys(a, c)).toBeLessThan(0);
          }
        }
      }
    }
  });
});

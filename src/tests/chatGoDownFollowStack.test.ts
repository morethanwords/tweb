import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {getMiddleware} from '@helpers/middleware';
import windowSize from '@helpers/windowSize';
import {FullMid, makeFullMid, splitFullMid} from '@appManagers/utils/messages/fullMid';
import {EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';
import '@helpers/peerIdPolyfill';

/**
 * A reply followed to the message it quotes leaves the reply to go back to: the go-down button goes there first,
 * while it is still below. Once the list has been scrolled past it, the button goes down to the end - as it does
 * with nothing to go back to. With every reply scrolled past, the press used to throw (a `pop` of the emptied
 * stack) and do nothing; only the next press went down.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = 10;

function makeBubble(mid: number, top?: number) {
  const bubble = document.createElement('div');
  bubble.classList.add('bubble');
  bubble.dataset.mid = '' + mid;
  bubble.dataset.peerId = '' + PEER_ID;
  bubble.getBoundingClientRect = () => ({top} as DOMRect);
  return bubble;
}

function makeHarness({followed, rendered, onScreen}: {
  followed: number[],
  // * the mids rendered, by where their bubble's top stands
  rendered: {[mid: number]: number},
  // * the bubbles on screen, oldest first: by their id, and where they stand in the history when that is not their id
  onScreen: (number | {mid: number, position?: number})[]
}) {
  const setMessageId = vi.fn();
  const bubbles: {[fullMid: string]: HTMLElement} = {};
  for(const mid in rendered) {
    bubbles[makeFullMid(PEER_ID, +mid)] = makeBubble(+mid, rendered[mid]);
  }

  const items = new Map<typeof onScreen[0], {element: HTMLElement}>();
  const elements = new Map<HTMLElement, {timelineKey: {position: number}}>();
  for(const bubble of onScreen) {
    const {mid, position} = typeof(bubble) === 'number' ? {mid: bubble, position: bubble} : bubble;
    const element = makeBubble(mid);
    items.set(bubble, {element});
    if(position !== undefined) elements.set(element, {timelineKey: {position}});
  }

  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      getMessage: (fullMid: FullMid) => ({_: 'message', mid: splitFullMid(fullMid).mid}),
      setMessageId
    },
    middlewareHelper: getMiddleware(),
    followStack: followed.map((mid) => makeFullMid(PEER_ID, mid)),
    bubbles,
    getViewportSlice: () => ({visible: onScreen.map((bubble) => ({element: items.get(bubble)?.element ?? makeBubble(-1)}))}),
    // * an ad inside a post (no position) is no item of the list
    bubbleGroups: {getItemByBubble: (element: HTMLElement) => elements.get(element)}
  });

  return {harness, setMessageId};
}

const below = () => windowSize.height - 10;
const above = () => -100;

test('a reply still below is gone back to', async() => {
  const {harness, setMessageId} = makeHarness({followed: [50], rendered: {50: below()}, onScreen: [48, 49]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith({lastMsgId: 50});
});

test('a reply scrolled past: the press goes down to the end', async() => {
  const {harness, setMessageId} = makeHarness({followed: [50], rendered: {50: above()}, onScreen: [59, 60]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledTimes(1);
  expect(setMessageId).toHaveBeenCalledWith();
  expect(harness.followStack).toEqual([]);
});

test('of two replies the one still below is gone back to', async() => {
  const {harness, setMessageId} = makeHarness({followed: [50, 70], rendered: {50: above(), 70: below()}, onScreen: [68, 69]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith({lastMsgId: 70});
});

test('a reply not rendered, newer than the screen (the list jumped to stands above it), is gone back to', async() => {
  const {harness, setMessageId} = makeHarness({followed: [50], rendered: {}, onScreen: [19, 20]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith({lastMsgId: 50});
});

test('a reply not rendered, older than the screen (sliced away above), is not gone back up to', async() => {
  const {harness, setMessageId} = makeHarness({followed: [50], rendered: {}, onScreen: [89, 90]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith();
});

test('an ephemeral message or an ad at the bottom of the screen is told by where it stands, not by its id', async() => {
  // * an ephemeral id is past every id of the history; it stands after the message it was filed by
  const {harness, setMessageId} = makeHarness({
    followed: [50],
    rendered: {},
    onScreen: [20, {mid: EPHEMERAL_MESSAGE_ID_OFFSET + 1, position: 20}, {mid: -1}]
  });
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith({lastMsgId: 50});
});

test('a screen of ephemeral messages only, past a reply sliced away above: down is the end', async() => {
  const {harness, setMessageId} = makeHarness({
    followed: [50],
    rendered: {},
    onScreen: [{mid: EPHEMERAL_MESSAGE_ID_OFFSET + 1, position: 90}, {mid: EPHEMERAL_MESSAGE_ID_OFFSET + 2, position: 90}]
  });
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith();
});

test('nothing followed back to: down is the end', async() => {
  const {harness, setMessageId} = makeHarness({followed: [], rendered: {}, onScreen: [20]});
  await harness.onGoDownClick();
  expect(setMessageId).toHaveBeenCalledWith();
});

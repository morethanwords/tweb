import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {makeFullMid} from '@appManagers/utils/messages/fullMid';
import '@helpers/peerIdPolyfill';

/**
 * A message whose story is not cached yet is rendered with "Loading" and rendered again once the story comes (the
 * mention of a story, a story reply turning out expired). By then the bubble may be no bubble of the list any more:
 * the message deleted, the bubble sliced away or rendered anew, another chat opened - the render made it anew all the
 * same, and a deleted message came back, or the previous chat's message went into the list of the chat opened.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = 10;

function makeHarness() {
  const message = {_: 'message', peerId: PEER_ID, mid: 5, pFlags: {}};
  const edited = {...message, message: 'edited'};
  const bubble = document.createElement('div');
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {getMessageByPeer: () => edited},
    bubbles: {[makeFullMid(PEER_ID, 5)]: bubble},
    safeRenderMessage: vi.fn(async(): Promise<undefined> => undefined)
  });

  return {harness, bubble, message, edited};
}

test('the bubble still the list\'s: rendered again, as the message is now', () => {
  const {harness, bubble, message, edited} = makeHarness();
  harness.rerenderWhenLoaded(bubble, message);
  expect(harness.safeRenderMessage).toHaveBeenCalledWith({message: edited, reverse: true, bubble});
});

test('the message deleted, or the bubble sliced away, meanwhile: nothing is rendered', () => {
  const {harness, bubble, message} = makeHarness();
  harness.bubbles = {};
  harness.rerenderWhenLoaded(bubble, message);
  expect(harness.safeRenderMessage).not.toHaveBeenCalled();
});

test('the bubble rendered anew meanwhile: the old one is not rendered over it', () => {
  const {harness, bubble, message} = makeHarness();
  harness.bubbles[makeFullMid(PEER_ID, 5)] = document.createElement('div');
  harness.rerenderWhenLoaded(bubble, message);
  expect(harness.safeRenderMessage).not.toHaveBeenCalled();
});

import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import {createPendingWidgetEditHandler} from '@components/chat/bubbleParts/widgetEdit';

/**
 * An edit goes into a bubble as it stands where its parts can take it: what a part of it updates itself
 * (`updateLocalOnEdit`: a poll, a widget) and its text's body. A part that says it cannot (`false`: a widget whose
 * shell or id changed, a caption coming or going among it) has the bubble rendered anew, whatever the body would take.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const message = {_: 'message', peerId: 10, mid: 5, pFlags: {}, message: 'caption'};

function makeHarness(local: (() => void | false) | undefined, bodyTakes: boolean) {
  const bubble = document.createElement('div');
  const updateLocalOnEdit = new Map<HTMLElement, () => void | false>();
  if(local) updateLocalOnEdit.set(bubble, vi.fn(local));
  const harness: any = Object.assign(Object.create(ChatBubbles.prototype), {
    updateLocalOnEdit,
    updateSolidMessageBody: vi.fn(() => bodyTakes)
  });

  return {harness, bubble};
}

test('a part that cannot take the edit has the bubble rendered anew, though the body would take it', () => {
  const {harness, bubble} = makeHarness(() => false, true);
  expect(harness.editInPlace(bubble, message)).toBe(false);
  expect(harness.updateSolidMessageBody).not.toHaveBeenCalled();
});

test('a part that takes it, and the body too', () => {
  const {harness, bubble} = makeHarness(() => {}, true);
  expect(harness.editInPlace(bubble, message)).toBe(true);
  expect(harness.updateSolidMessageBody).toHaveBeenCalledWith(bubble, message);
});

test('a part that takes it, where the body does not (a widget\'s state under an unchanged caption)', () => {
  const {harness, bubble} = makeHarness(() => {}, false);
  expect(harness.editInPlace(bubble, message)).toBe(true);
});

test('the body alone, or nothing', () => {
  expect(makeHarness(undefined, true).harness.editInPlace(document.createElement('div'), message)).toBe(true);
  const {harness, bubble} = makeHarness(undefined, false);
  expect(harness.editInPlace(bubble, message)).toBe(false);
  // * a service message has no body
  expect(harness.editInPlace(bubble, {...message, _: 'messageService'})).toBe(false);
});

test('a widget\'s bubble whose widget does not run (still loading, or failed to load) is made anew for new HTML, though its caption\'s body would take it', () => {
  const widget = (payload: number[]) => ({_: 'messageMediaWidget', pFlags: {}, width: 0, height: 0, payload: new Uint8Array(payload)});
  const rendered: any = {...message, media: widget([1])};
  const {harness, bubble} = makeHarness(undefined, true);
  harness.updateLocalOnEdit.set(bubble, createPendingWidgetEditHandler(rendered));
  expect(harness.editInPlace(bubble, {...rendered, media: widget([2])})).toBe(false);
  expect(harness.updateSolidMessageBody).not.toHaveBeenCalled();
  // * what changes none of it (a reaction) the caption's body takes
  expect(harness.editInPlace(bubble, {...rendered, reactions: {_: 'messageReactions', pFlags: {}, results: []}})).toBe(true);
});

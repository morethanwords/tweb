import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import makeSponsoredHarness from '@/tests/helpers/sponsoredChatBubbles';
import '@helpers/peerIdPolyfill';

/**
 * An ad of a channel is reported as seen (`messages.viewSponsoredMessage`, by its `random_id`) once it comes into
 * view, as every official client does. What is watched is the ad's button under it, which has no id of its own: its
 * bubble does. And every ad that is put in its place is taken off the queue of the ones waiting for it - the list the
 * report looked the ad up in. No ad of a channel was ever reported.
 */

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const PEER_ID = -100;

function makeAd(randomId: number) {
  return {_: 'sponsoredMessage', random_id: new Uint8Array([randomId]), message: 'ad', url: 'https://t.me/x', title: 'x', button_text: 'Open'};
}

function makeHarness(sponsoredMessages: any) {
  const viewSponsoredMessage = vi.fn((randomId: Uint8Array) => Promise.resolve(true));
  const renderNewMessage = vi.fn();
  const harness: any = makeSponsoredHarness(ChatBubbles, PEER_ID, sponsoredMessages, {
    managers: {appMessagesManager: {
      getSponsoredMessage: () => Promise.resolve(sponsoredMessages),
      viewSponsoredMessage
    }},
    batchProcessor: {},
    // * as the real one makes it, without the worker
    generateLocalFirstMessage: async(service: boolean, fill: (message: any) => void, addOffset: number) => {
      const message = {_: 'message', id: -addOffset, mid: -addOffset, peerId: PEER_ID, date: 0, pFlags: {local: true}};
      fill(message);
      return message;
    },
    renderNewMessage
  });

  const load = async() => {
    harness.loadSponsoredMessages();
    await harness.getSponsoredMessagePromise;
  };

  // * the ad's bubble as it is rendered, with its button under it: that one is watched
  const show = (message: {mid: number}) => {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble', 'is-sponsored');
    bubble.dataset.mid = '' + message.mid;
    bubble.dataset.peerId = '' + PEER_ID;
    const button = document.createElement('div');
    button.classList.add('webpage-footer');
    bubble.append(button);
    // * what `viewsObserverCallback` calls once it is in view
    harness.onViewed(button);
  };

  return {harness, load, show, renderNewMessage, viewSponsoredMessage};
}

test('an ad of a channel that shows one is reported once it is seen', async() => {
  const ad = makeAd(1);
  const {load, show, renderNewMessage, viewSponsoredMessage} = makeHarness({_: 'messages.sponsoredMessages', messages: [ad]});
  await load();

  expect(renderNewMessage).toHaveBeenCalledTimes(1);
  show(renderNewMessage.mock.calls[0][0]);
  expect(viewSponsoredMessage).toHaveBeenCalledTimes(1);
  expect(viewSponsoredMessage).toHaveBeenCalledWith(ad.random_id);
});

test('the ads of a channel that shows them between its posts are reported, each one as it is seen', async() => {
  const ads = [makeAd(1), makeAd(2), makeAd(3)];
  const {harness, load, show, renderNewMessage, viewSponsoredMessage} = makeHarness({_: 'messages.sponsoredMessages', posts_between: 3, messages: ads});
  await load();

  // * the first one goes to the bottom at once, the others wait for their places
  expect(renderNewMessage).toHaveBeenCalledTimes(1);
  show(renderNewMessage.mock.calls[0][0]);
  expect(viewSponsoredMessage).toHaveBeenLastCalledWith(ads[0].random_id);

  // * as `performHistoryResult` puts the next one between posts
  const next = harness.sponsoredMessagesAvailable.shift();
  show(next);
  expect(viewSponsoredMessage).toHaveBeenLastCalledWith(ads[1].random_id);
  expect(viewSponsoredMessage).toHaveBeenCalledTimes(2);
});

test('an ad seen again is not reported again', async() => {
  const {load, show, renderNewMessage, viewSponsoredMessage} = makeHarness({_: 'messages.sponsoredMessages', messages: [makeAd(1)]});
  await load();

  const message = renderNewMessage.mock.calls[0][0];
  show(message);
  // * its bubble rendered anew, as after the list was sliced and scrolled back to
  show(message);
  expect(viewSponsoredMessage).toHaveBeenCalledTimes(1);
});

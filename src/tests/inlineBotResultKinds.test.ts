import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import {AppInlineBotsManager} from '@appManagers/appInlineBotsManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {BotInlineMessage, BotInlineResult} from '@layer';

const PEER_ID = (42 as UserId).toPeerId(false);
const BOT_ID = 7 as BotId;

// * an inline bot result picked, sent by a real sendOther down to the request it makes
function makeManagers() {
  const message = {_: 'message', id: 1, random_id: '5', pFlags: {}, promise: deferredPromise<void>()} as any;
  const invokeApiAfter = vi.fn((..._args: any[]) => new Promise(noop));
  const beforeMessageSending = vi.fn();
  const messagesManager = new AppMessagesManager() as any;
  Object.assign(messagesManager, {
    pendingAfterMsgs: {},
    appPeersManager: {
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'})
    },
    apiManager: {invokeApiAfter},
    checkSendOptions: () => Promise.resolve({config: {}, appConfig: {}}),
    generateOutgoingMessage: () => message,
    stripEphemeralReply: noop,
    beforeMessageSending
  });
  const sendText = vi.spyOn(messagesManager, 'sendText').mockImplementation(noop as any);
  vi.spyOn(messagesManager, 'sendOther').mockImplementation((options: any) => {
    // * it resolves when the server's message is in: only what it does on the way there is looked at
    const sending = AppMessagesManager.prototype.sendOther.call(messagesManager, options);
    sending.catch(noop);
    return sending;
  });

  const inlineBotsManager = Object.create(AppInlineBotsManager.prototype) as AppInlineBotsManager;
  Object.assign(inlineBotsManager as any, {
    inlineResults: {},
    appMessagesManager: messagesManager,
    appUsersManager: {getTopPeers: () => Promise.resolve([])},
    appStateManager: {setKeyValueToStorage: noop},
    appGifsManager: {addRecentGif: noop}
  });

  const pick = async(sendMessage: BotInlineMessage, options: {scheduleDate?: number, silent?: boolean} = {}) => {
    const inlineResult: BotInlineResult.botInlineResult = {_: 'botInlineResult', id: 'r1', type: 'article', send_message: sendMessage};
    const sent = inlineBotsManager.sendInlineResult(PEER_ID, BOT_ID, 'q1_r1', {inlineResult, ...options});
    await vi.waitFor(() => expect(beforeMessageSending).toHaveBeenCalled());
    message.send();
    return sent;
  };

  return {pick, sendText, invokeApiAfter, beforeMessageSending, message};
}

describe('an inline bot result with no media of its own to draw', () => {
  it('is sent through the bot when it is a text with a link preview, as scheduled and as silent as asked', async() => {
    const {pick, sendText, invokeApiAfter, beforeMessageSending, message} = makeManagers();

    const sent = await pick({
      _: 'botInlineMessageMediaWebPage',
      pFlags: {force_large_media: true},
      message: 'Look https://telegram.org',
      url: 'https://telegram.org'
    }, {scheduleDate: 1e9, silent: true});

    expect(sent).toBe(true);
    expect(sendText).not.toHaveBeenCalled();
    // * no message of its own: the server's comes with the update, made from the result
    expect(beforeMessageSending).toHaveBeenCalledWith(message, expect.objectContaining({noOutgoingMessage: true}));
    expect(invokeApiAfter).toHaveBeenCalledWith('messages.sendInlineBotResult', expect.objectContaining({
      query_id: 'q1',
      id: 'r1',
      random_id: '5',
      schedule_date: 1e9,
      silent: true
    }), expect.anything());
  });

  it('is sent through the bot when it is a rich message', async() => {
    const {pick, invokeApiAfter, beforeMessageSending, message} = makeManagers();

    await pick({
      _: 'botInlineMessageRichMessage',
      rich_message: {_: 'richMessage', pFlags: {}, blocks: [], photos: [], documents: []}
    });

    expect(beforeMessageSending).toHaveBeenCalledWith(message, expect.objectContaining({noOutgoingMessage: true}));
    expect(invokeApiAfter).toHaveBeenCalledWith('messages.sendInlineBotResult', expect.objectContaining({
      query_id: 'q1',
      id: 'r1'
    }), expect.anything());
  });
});

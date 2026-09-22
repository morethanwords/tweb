import {AppMessagesManager, HistoryStorage} from '@appManagers/appMessagesManager';
import {Message, ReplyMarkup} from '@layer';
import '@helpers/peerIdPolyfill';

const PEER_ID = 10 as PeerId;
const BOT_ID = 100 as UserId;

function makeManager() {
  const manager = new AppMessagesManager() as any;
  Object.assign(manager, {
    appPeersManager: {
      getPeerId: (peer: any) => peer?._ === 'peerUser' ?
        (+peer.user_id as UserId).toPeerId(false) :
        PEER_ID
    },
    appUsersManager: {isBot: () => true}
  });

  return manager;
}

function makeStorage(): HistoryStorage {
  return {} as HistoryStorage;
}

function makeMessage(mid: number, reply_markup: ReplyMarkup): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    peerId: PEER_ID,
    peer_id: {_: 'peerUser', user_id: BOT_ID},
    from_id: {_: 'peerUser', user_id: BOT_ID},
    date: 1,
    message: '',
    reply_markup
  } as Message.message;
}

describe('layer 229 force_reply markups', () => {
  test('tracks an inline markup that forces a reply as the last keyboard', () => {
    const manager = makeManager();
    const storage = makeStorage();
    const markup: ReplyMarkup.replyInlineMarkup = {
      _: 'replyInlineMarkup',
      pFlags: {force_reply: true},
      rows: []
    };

    expect(manager.mergeReplyKeyboard(storage, makeMessage(5, markup))).toBe(true);
    expect(storage.replyMarkup).toBe(markup);
    // the mid is what the input replies to, the bot is who it answers
    expect(markup.mid).toBe(5);
    expect(markup.fromId).toBe(BOT_ID.toPeerId(false));
  });

  test('leaves an ordinary inline markup inside its own bubble', () => {
    const manager = makeManager();
    const storage = makeStorage();

    expect(manager.mergeReplyKeyboard(storage, makeMessage(6, {
      _: 'replyInlineMarkup',
      pFlags: {},
      rows: []
    }))).toBe(false);
    expect(storage.replyMarkup).toBeUndefined();
  });

  test('still tracks a reply keyboard that forces a reply', () => {
    const manager = makeManager();
    const storage = makeStorage();
    const markup: ReplyMarkup.replyKeyboardMarkup = {
      _: 'replyKeyboardMarkup',
      pFlags: {force_reply: true},
      rows: []
    };

    expect(manager.mergeReplyKeyboard(storage, makeMessage(7, markup))).toBe(true);
    expect(storage.replyMarkup).toBe(markup);
    expect(markup.mid).toBe(7);
  });
});

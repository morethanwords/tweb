import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {ReplyMarkup} from '@layer';
import {makeDeletingMessagesManager} from '@/tests/helpers/deletingMessagesManager';
import {makeBotMessage} from '@/tests/helpers/botMessage';

// * a bot's keyboard goes with the message that brought it: deleted, the chat shows it no more, nor answers it, and an
// * older one a history load brings does not come back in its place (tdesktop's History::itemVanished ->
// * clearLastKeyboard, lastKeyboardInited)
const PEER_ID = (100 as UserId).toPeerId(false);
const BOT_ID = 7 as UserId;
const KEYBOARD_MID = 7;

const keyboard = (): ReplyMarkup.replyKeyboardMarkup => ({
  _: 'replyKeyboardMarkup',
  pFlags: {},
  rows: [{_: 'keyboardButtonRow', buttons: [{_: 'keyboardButton', text: 'Menu', type: {_: 'buttonTypeDefault'}}]}]
});

function setup() {
  const dispatchEvent = vi.fn();
  const historyStorage = {history: new Set(), count: 0, replyMarkup: {...keyboard(), mid: KEYBOARD_MID} as ReplyMarkup};
  const {manager} = makeDeletingMessagesManager({
    handleDeletedMessages: (_peerId: PeerId, _storage: unknown, mids: number[]) => ({
      count: mids.length,
      unread: 0,
      unreadMentions: 0,
      unreadReactions: 0,
      msgs: new Set(mids),
      byThreadKey: new Map()
    }),
    rootScope: {dispatchEvent},
    getHistoryStorage: () => historyStorage
  });

  const deleteMessages = (messages: number[]) => manager.onUpdateDeleteMessages({
    _: 'updateDeleteMessages',
    messages,
    pts: 1,
    pts_count: messages.length,
    peerId: PEER_ID
  });

  return {manager, historyStorage, dispatchEvent, deleteMessages};
}

const botMessage = (mid: number) => makeBotMessage(mid, PEER_ID, BOT_ID, keyboard());

describe('a reply keyboard whose message is deleted', () => {
  it('is gone from the chat', () => {
    const {historyStorage, dispatchEvent, deleteMessages} = setup();
    deleteMessages([KEYBOARD_MID]);

    expect(historyStorage.replyMarkup._).toBe('replyKeyboardHide');
    expect(dispatchEvent).toHaveBeenCalledWith('history_reply_markup', {peerId: PEER_ID});
  });

  it('does not come back as an older keyboard a history load brings', () => {
    const {manager, historyStorage, deleteMessages} = setup();
    deleteMessages([KEYBOARD_MID]);

    expect(manager.mergeReplyKeyboard(historyStorage, botMessage(KEYBOARD_MID - 2))).toBe(false);
    expect(historyStorage.replyMarkup._).toBe('replyKeyboardHide');
  });

  it('stays when another message is deleted', () => {
    const {historyStorage, dispatchEvent, deleteMessages} = setup();
    deleteMessages([KEYBOARD_MID + 1]);

    expect(historyStorage.replyMarkup._).toBe('replyKeyboardMarkup');
    expect(historyStorage.replyMarkup.mid).toBe(KEYBOARD_MID);
    expect(dispatchEvent).not.toHaveBeenCalledWith('history_reply_markup', expect.anything());
  });
});

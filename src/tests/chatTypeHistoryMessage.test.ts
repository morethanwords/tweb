import type {Message} from '@layer';
import {ChatType, getNonHistoryStore, isHistoryMessage} from '@components/chat/chatType';

/**
 * Which messages a chat shows are of its history as the server keeps it: only those are asked through, polled and kept
 * for beyond their bubble (a widget's storage, requests, polls and a remembered height on disk).
 */
const message = (overrides: Partial<Message.message> & {ephemeral_id?: number} = {}) => ({
  _: 'message',
  id: 5,
  mid: 5,
  peer_id: {_: 'peerUser', user_id: 10},
  peerId: 10 as PeerId,
  pFlags: {},
  date: 1,
  message: '',
  ...overrides
}) as Message.message;

describe('a message of the chat\'s history', () => {
  it('is an ordinary one, in an ordinary chat', () => {
    expect(isHistoryMessage(ChatType.Chat, message())).toBe(true);
    expect(getNonHistoryStore(ChatType.Chat, message())).toBeUndefined();
  });

  it('is not one standing in for a message of the history (an anchored ephemeral one): what it shows is not that message\'s', () => {
    const anchored = message({pFlags: {ephemeral_anchored: true}, ephemeral_id: 77});
    expect(isHistoryMessage(ChatType.Chat, anchored)).toBe(false);
    // * a store of its own: its widget's key is not the covered message's
    expect(getNonHistoryStore(ChatType.Chat, anchored)).toBe('ephemeral');
  });

  it('is not an ephemeral one, a scheduled one, an admin log\'s entry, a preview or a welcome message', () => {
    expect(getNonHistoryStore(ChatType.Chat, message({pFlags: {ephemeral: true}, ephemeral_id: 1}))).toBe('ephemeral');
    expect(getNonHistoryStore(ChatType.Chat, message({pFlags: {is_scheduled: true}}))).toBe(ChatType.Scheduled);
    for(const type of [ChatType.Scheduled, ChatType.Logs, ChatType.Static, ChatType.Welcome]) {
      expect(isHistoryMessage(type, message())).toBe(false);
    }
  });
});

import {describe, expect, it} from 'vitest';
import type {Message, MessagesMessages} from '@layer';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager, HistoryStorage} from '@appManagers/appMessagesManager';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import SlicedArray, {SliceEnd} from '@helpers/slicedArray';

// A basic group whose history slice reaches the newest messages while `maxId` stays below them:
// the chat opens at `maxId`, so those messages are never shown.
const CHAT_ID = 4675771418 as ChatId;
const PEER_ID = CHAT_ID.toPeerId(true);

function makeMessage(mid: number): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    date: mid,
    message: 'text ' + mid,
    peer_id: {_: 'peerChat', chat_id: CHAT_ID},
    peerId: PEER_ID
  } as Message.message;
}

describe('history fill that extends the bottom-end slice', () => {
  it('raises maxId when a result that is not the bottom end extends the bottom-end slice', async() => {
    const historyStorage: HistoryStorage = createHistoryStorage({type: 'history', peerId: PEER_ID});
    historyStorage.history = new SlicedArray();
    historyStorage.history.insertSlice([153, 152, 151]);
    historyStorage.history.first.setEnd(SliceEnd.Bottom);
    historyStorage._maxId = 153;

    const reloaded: PeerId[] = [];
    const manager = new AppMessagesManager() as any;
    Object.assign(manager, {
      appPeersManager: {getPeerMigratedTo: (): PeerId => undefined},
      middleware: {get: () => () => true},
      getChannelAvailableMinIdGeneration: () => 0,
      mergeReplyKeyboard: () => false,
      reloadConversation: (peerId: PeerId) => reloaded.push(peerId)
    });

    // * offset_id_offset 5 with only 4 newer messages, as the server answered live for a basic group:
    // * a request that did load everything newer is not judged to be the bottom end
    const result = {
      _: 'messages.messagesSlice',
      pFlags: {},
      count: 2147483647,
      offset_id_offset: 5,
      messages: [160, 159, 158, 157, 153, 152].map(makeMessage),
      chats: [],
      users: [],
      topics: []
    } as MessagesMessages.messagesMessagesSlice;
    manager.requestHistory = () => Promise.resolve(result);

    await manager.fillHistoryStorage({
      peerId: PEER_ID,
      historyStorage,
      offsetId: 153,
      addOffset: -4,
      limit: 6,
      recursion: true
    });

    expect(historyStorage.history.first[0]).toBe(160);
    expect(historyStorage.history.first.isEnd(SliceEnd.Bottom)).toBe(true);
    expect(historyStorage.maxId).toBe(160);
    expect(reloaded).toEqual([PEER_ID]);
  });
});

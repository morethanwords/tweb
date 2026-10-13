import {describe, expect, it, vi} from 'vitest';
import type {Message, MessagesMessages} from '@layer';
import '@helpers/peerIdPolyfill';

vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {
    getInstance: () => ({invokeVoid: () => {}})
  }
}));

import {AppMessagesManager} from '@appManagers/appMessagesManager';

// * a cached search (a chat's photos and videos) has to know the messages a request put into it: an edit
// * re-checks the message against every search, and one it does not know about it inserts again. The
// * storage is wrapped in the mirroring proxy, as in the app — that wrapper is what once lost the mark.
const PEER_ID = 1000001 as PeerId;
const FILTER = {_: 'inputMessagesFilterPhotoVideo'} as const;

function photoMessage(mid: number, caption = ''): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    date: mid,
    message: caption,
    peer_id: {_: 'peerUser', user_id: PEER_ID.toUserId()},
    peerId: PEER_ID,
    media: {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photo', id: '' + mid} as any}
  } as Message.message;
}

function createManager() {
  const manager = new AppMessagesManager() as any;
  const log = Object.assign(() => {}, {error: () => {}, warn: () => {}, debug: () => {}});
  Object.assign(manager, {
    searchesStorage: {},
    references: {},
    log,
    appPeersManager: {getPeerMigratedTo: (): PeerId => undefined, isForum: () => false, isBotforum: () => false},
    getMigration: (): undefined => undefined
  });

  return manager;
}

function loadSearch(manager: any, mids: number[]) {
  const options = {peerId: PEER_ID, inputFilter: FILTER, searchType: 'cached'};
  const storage = manager.getSearchStorage(options);
  manager.mergeHistoryResult({
    ...options,
    offsetId: 0,
    addOffset: 0,
    limit: 50,
    slicedArray: storage.history,
    historyStorage: storage,
    historyResult: {
      _: 'messages.messages',
      messages: mids.map((mid) => photoMessage(mid)),
      chats: [],
      users: []
    } as MessagesMessages.messagesMessages
  });

  return storage;
}

describe('cached search and the messages a request brought into it', () => {
  it('keeps an edited message once', () => {
    const manager = createManager();
    const storage = loadSearch(manager, [26205, 26204, 26203, 26202, 25701]);

    manager.updateMessageContext(photoMessage(26202, 'a new caption'));

    expect(Array.from(storage.history.first)).toEqual([26205, 26204, 26203, 26202, 25701]);
  });

  it('drops a message that no longer matches the filter', () => {
    const manager = createManager();
    const storage = loadSearch(manager, [26205, 26204, 26203]);

    const withoutMedia = photoMessage(26204);
    delete withoutMedia.media;
    manager.updateMessageContext(withoutMedia);

    expect(Array.from(storage.history.first)).toEqual([26205, 26203]);
  });
});

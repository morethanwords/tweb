import '@helpers/peerIdPolyfill';
import {AppMessagesManager, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {AppPhotosManager} from '@appManagers/appPhotosManager';
import {ReferencesStorage} from '@lib/storages/references';
import type {Message, MessagesMessages, Peer, Photo} from '@layer';

// A scheduled message has ids of its own: `messages.getMessages` takes one of them for another
// message, or for none. So the expired file reference of a scheduled message's media is renewed
// with `messages.getScheduledMessages`, as tdesktop (apiwrap.cpp) and iOS (AccountViewTracker) do.

const PEER: Peer = {_: 'peerUser', user_id: 42};
const PEER_ID = (42 as UserId).toPeerId(false);
const ID = 7;

const photo = (id: string, reference: number[]): Photo.photo => ({
  _: 'photo', pFlags: {}, id, access_hash: '1', file_reference: reference, date: 0, dc_id: 2,
  sizes: [{_: 'photoSize', type: 'x', w: 800, h: 600, size: 1000}]
});

const message = (media: Photo.photo): Message.message => ({
  _: 'message', pFlags: {}, id: ID, peer_id: PEER, date: 0, message: '',
  media: {_: 'messageMediaPhoto', pFlags: {}, photo: media}
});

function setup() {
  const manager = new AppMessagesManager();
  const references = new ReferencesStorage();
  const photos = new AppPhotosManager();
  const log: any = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn(), debug: vi.fn()});
  log.bindPrefix = () => log;

  // what the server holds now: the scheduled message, its photo with a fresh reference
  const scheduledNow: MessagesMessages = {
    _: 'messages.messages', messages: [message(photo('scheduled', [4, 5, 6]))], chats: [], users: [], topics: []
  };
  const invokeApiSingle = vi.fn(async(method: string): Promise<MessagesMessages> => {
    if(method === 'messages.getScheduledMessages') return scheduledNow;
    throw new Error('unexpected ' + method);
  });

  Object.assign(references, {log, appMessagesManager: manager, apiFileManager: {cancelDownloadByReference: vi.fn()}});
  Object.assign(photos, {photos: {}, referencesStorage: references});
  Object.assign(manager as any, {
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appPhotosManager: photos,
    referencesStorage: references,
    apiManager: {invokeApiSingle},
    appChatsManager: {isBroadcast: () => false},
    appPeersManager: {
      peerId: (1 as UserId).toPeerId(false),
      getPeerId: () => PEER_ID,
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '0'}),
      registerMessagePeers: vi.fn(),
      saveApiPeers: vi.fn()
    },
    timeManager: {getServerTimeOffset: () => 0, getServerTime: () => 0},
    setMessageUnreadByDialog: vi.fn(),
    setMessageToStorage: (storage: MessagesStorage, message: Message.message) => storage.set(message.mid, message),
    scheduledMessagesStorage: {}
  });

  // * the chat's own message with the same id, and another photo
  const history = (manager as any).createMessageStorage(PEER_ID, 'history') as MessagesStorage;
  manager.saveMessage(message(photo('sent', [9, 9, 9])), {storage: history});

  const scheduled = manager.getScheduledMessagesStorage(PEER_ID);
  manager.saveMessage(message(photo('scheduled', [1, 2, 3])), {storage: scheduled, isScheduled: true});

  return {manager, references, photos, history, scheduled, invokeApiSingle};
}

describe('the media of a scheduled message', () => {
  it('renews its expired file reference from the scheduled messages', async() => {
    const {references, photos, scheduled, invokeApiSingle} = setup();
    const stored = photos.getPhoto('scheduled');

    // what a download hands over when the server answers FILE_REFERENCE_EXPIRED: the bytes it used
    const renewed = await references.refreshReference([1, 2, 3]);

    expect([...renewed]).toEqual([4, 5, 6]);
    expect(invokeApiSingle).toHaveBeenCalledOnce();
    expect(invokeApiSingle).toHaveBeenCalledWith('messages.getScheduledMessages', {
      peer: {_: 'inputPeerUser', user_id: 42, access_hash: '0'},
      id: [ID]
    });
    // the very object a download reads its parts by
    expect(photos.getPhoto('scheduled')).toBe(stored);
    expect([...stored.file_reference]).toEqual([4, 5, 6]);
    expect((scheduled.get(ID) as Message.message).pFlags.is_scheduled).toBe(true);
    // the chat's message of the same id is not touched
    expect([...photos.getPhoto('sent').file_reference]).toEqual([9, 9, 9]);
  });

  it('is not brought back by a late answer once sent or deleted, or once the cache is cleared', async() => {
    for(const goAway of ['delete', 'clear'] as const) {
      const {manager, scheduled, invokeApiSingle} = setup();
      let answer: () => void;
      invokeApiSingle.mockImplementationOnce(() => new Promise((resolve) => answer = () => resolve({
        _: 'messages.messages', messages: [message(photo('scheduled', [4, 5, 6]))], chats: [], users: [], topics: []
      })));

      const promise = manager.reloadScheduledMessage(PEER_ID, ID);
      await Promise.resolve();
      expect(invokeApiSingle).toHaveBeenCalledOnce();
      // * what the deletion leaves behind, or a cleared cache
      if(goAway === 'delete') scheduled.delete(ID);
      else (manager as any).scheduledMessagesStorage = {};
      answer();

      expect(await promise).toBeUndefined();
      expect(manager.getScheduledMessagesStorage(PEER_ID).has(ID)).toBe(false);
    }
  });

  it('keeps an edit saved while the request is on its way, newer than the answer', async() => {
    const {manager, photos, scheduled, invokeApiSingle} = setup();
    let answer: () => void;
    invokeApiSingle.mockImplementationOnce(() => new Promise((resolve) => answer = () => resolve({
      _: 'messages.messages', messages: [message(photo('scheduled', [4, 5, 6]))], chats: [], users: [], topics: []
    })));

    const promise = manager.reloadScheduledMessage(PEER_ID, ID);
    await Promise.resolve();
    // * what updateNewScheduledMessage saves for an edit: a new caption, and the photo's fresh reference
    manager.saveMessage({...message(photo('scheduled', [7, 7, 7])), message: 'edited'}, {storage: scheduled, isScheduled: true});
    const edited = scheduled.get(ID);
    answer();

    expect(await promise).toBe(edited);
    expect(scheduled.get(ID)).toBe(edited);
    expect((edited as Message.message).message).toBe('edited');
    expect([...photos.getPhoto('scheduled').file_reference]).toEqual([7, 7, 7]);
  });

  it('asks nothing for a message no longer kept', async() => {
    const {manager, scheduled, invokeApiSingle} = setup();
    scheduled.delete(ID);

    expect(await manager.reloadScheduledMessage(PEER_ID, ID)).toBeUndefined();
    expect(invokeApiSingle).not.toHaveBeenCalled();
  });

  it('lets go of its own references only, once it is gone', () => {
    const {manager, references, scheduled} = setup();

    (manager as any).handleReleasingMessage(scheduled.get(ID), scheduled);

    expect(references.getContexts([1, 2, 3])[0]).toBeUndefined();
    expect([...references.getContexts([9, 9, 9])[0]]).toEqual([{type: 'message', peerId: PEER_ID, messageId: ID}]);
  });
});

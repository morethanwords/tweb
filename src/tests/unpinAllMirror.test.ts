import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';

// "Unpin all" unpins the chat's messages where the tab reads them too: the server's answer carries no update of
// them for this session, so the worker's copies changed alone would leave the tab's ones pinned (the context menu
// offering "Unpin" on them) until a reload.

const peerId = (42 as UserId).toPeerId(false);

function setup() {
  const manager = new AppMessagesManager();
  const storage = (manager as any).createMessageStorage(peerId, 'history');
  const make = (mid: number, pinned: boolean) => ({_: 'message', id: mid, mid, peerId, pFlags: pinned ? {pinned: true} : {}, date: 0, message: ''} as Message.message);
  [make(1, true), make(2, false), make(3, true)].forEach((message) => storage.set(message.mid, message));

  Object.assign(manager as any, {
    apiManager: {invokeApiSingle: vi.fn().mockResolvedValue({_: 'messages.affectedHistory', pts: 2, pts_count: 1, offset: 0})},
    apiUpdatesManager: {processLocalUpdate: vi.fn()},
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '0'})},
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue(storage);
  vi.spyOn(manager as any, 'flushPinnedMessagesCache').mockImplementation(() => {});
  const setMessageToStorage = vi.spyOn(manager, 'setMessageToStorage').mockImplementation((target: any, message: any) => target.set(message.mid, message));
  vi.spyOn(manager as any, 'setDialogToStateIfMessageIsTop').mockImplementation(() => {});
  vi.spyOn(manager, 'updateMessageContext').mockImplementation(() => {});

  return {manager, storage, setMessageToStorage};
}

describe('unpinning all the messages of a chat', () => {
  test('writes every message it unpins back, for the tab', async() => {
    const {manager, storage, setMessageToStorage} = setup();

    await manager.unpinAllMessages(peerId);

    expect([...storage.values()].map((message: Message.message) => !!message.pFlags.pinned)).toEqual([false, false, false]);
    expect(setMessageToStorage.mock.calls.map(([, message]) => message.mid)).toEqual([1, 3]);
  });
});

import '@helpers/peerIdPolyfill';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {Message} from '@layer';

// A temporary id is its chat's own: two empty chats both give their first pending message 0.0001. A server id of a
// private chat or a basic group names one message account-wide, and such a message is kept in the global storage too;
// a pending one is not, or finding, calling off, deleting or sending it in one chat would take the other chat's.

const userPeerId = (42 as UserId).toPeerId(false);
const groupPeerId = (77 as ChatId).toPeerId(true);
const TEMP_ID = 0.0001;

function setup() {
  const mirror = vi.fn();
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: mirror} as any);

  const manager = new AppMessagesManager();
  const processLocalUpdate = vi.fn();
  Object.assign(manager as any, {
    messagesStorageByPeerId: {},
    pendingByRandomId: {},
    pendingTopMsgs: {},
    tempFinalizeCallbacks: {},
    appPeersManager: {isChannel: () => false},
    appMessagesIdsManager: new AppMessagesIdsManager(),
    apiManager: {
      getConfig: vi.fn().mockResolvedValue({forwarded_count_max: 100}),
      invokeApi: vi.fn().mockResolvedValue({_: 'messages.affectedMessages', pts: 2, pts_count: 1})
    },
    apiUpdatesManager: {processLocalUpdate},
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getHistoryStorage').mockImplementation(() => ({history: {delete: vi.fn()}}) as any);
  vi.spyOn(manager as any, 'updateMessageContextForDeletion').mockImplementation(() => {});
  vi.spyOn(manager as any, 'onMessageModification').mockImplementation(() => {});
  const handleReleasingMessage = vi.spyOn(manager as any, 'handleReleasingMessage').mockImplementation(() => {});

  // * a pending message of the chat, kept the way a send keeps it
  const pend = (peerId: PeerId, randomId: string) => {
    const message = {
      _: 'message',
      id: TEMP_ID,
      mid: TEMP_ID,
      peerId,
      pFlags: {out: true, is_outgoing: true},
      date: 0,
      message: `to ${peerId}`,
      random_id: randomId,
      pending: true
    } as any as Message.message;
    const storage = manager.getHistoryMessagesStorage(peerId);
    manager.setMessageToStorage(storage, message);
    (manager as any).pendingByRandomId[randomId] = {peerId, tempId: TEMP_ID, storage};
    return message;
  };

  // * what the tab was told to forget
  const deletedFromTab = () => mirror.mock.calls
  .filter(([type, payload]) => type === 'mirror' && payload.name === 'messages' && !('value' in payload))
  .map(([, payload]) => payload.key as string);

  return {manager, processLocalUpdate, handleReleasingMessage, pend, deletedFromTab};
}

function served(peerId: PeerId, id: number) {
  return {_: 'message', id, mid: id, peerId, pFlags: {out: true}, date: 0, message: 'served'} as Message.message;
}

describe('pending messages of two chats with the same temporary id', () => {
  test('each is found in its own chat', () => {
    const {manager, pend} = setup();
    const inGroup = pend(groupPeerId, '2');
    const inUser = pend(userPeerId, '1');

    expect(manager.getMessageByPeer(userPeerId, TEMP_ID)).toBe(inUser);
    expect(manager.getMessageByPeer(groupPeerId, TEMP_ID)).toBe(inGroup);
    // * a basic group's server ids are asked for account-wide, its temporary ones are not
    expect(manager.reloadMessage(groupPeerId, TEMP_ID)).toBe(inGroup);
    // * nothing names a chat by a temporary id alone
    expect(manager.getMessageById(TEMP_ID)).toBeUndefined();
    expect((manager as any).findPeerIdByMids([TEMP_ID])).toBeUndefined();
  });

  test('one called off takes only its own message, and leaves the other where both the worker and the tab find it', () => {
    const {manager, handleReleasingMessage, pend, deletedFromTab} = setup();
    const inUser = pend(userPeerId, '1');
    const inGroup = pend(groupPeerId, '2');

    expect(manager.cancelPendingMessage('1')).toBe(true);

    expect(handleReleasingMessage).toHaveBeenCalledOnce();
    expect(handleReleasingMessage.mock.calls[0][0]).toBe(inUser);
    expect(manager.getMessageByPeer(userPeerId, TEMP_ID)).toBeUndefined();
    expect(manager.getMessageByPeer(groupPeerId, TEMP_ID)).toBe(inGroup);
    expect(deletedFromTab()).toEqual([joinDeepPath(`${userPeerId}_history`, TEMP_ID)]);
  });

  test('a chat flushed takes its own from where the tab reads it, and leaves the other chat\'s', () => {
    const {manager, pend, deletedFromTab} = setup();
    (manager as any).clear(true);
    Object.assign(manager as any, {
      appTranslationsManager: {resetPeerTranslations: vi.fn()},
      dialogsStorage: {flushForumTopicsCache: vi.fn()}
    });
    pend(userPeerId, '1');
    pend(groupPeerId, '2');
    const sent = served(userPeerId, 5);
    manager.setMessageToStorage(manager.getHistoryMessagesStorage(userPeerId), sent);

    manager.flushStoragesByPeerId(userPeerId);

    expect(manager.getMessageByPeer(userPeerId, TEMP_ID)).toBeUndefined();
    expect(manager.getMessageByPeer(groupPeerId, TEMP_ID)).toMatchObject({peerId: groupPeerId});
    // * the server id from the global storage, the temporary one from the chat's own
    expect(deletedFromTab().sort()).toEqual([
      joinDeepPath(`${userPeerId}_history`, TEMP_ID),
      joinDeepPath('0_history', sent.mid)
    ].sort());
  });

  test('one sent is replaced by what the server made of it, and the other stays', () => {
    const {manager, pend} = setup();
    const inGroup = pend(groupPeerId, '2');
    const inUser = pend(userPeerId, '1');

    expect(manager.finalizePendingMessage('2', served(groupPeerId, 5))).toBe(inGroup);

    expect(manager.getMessageByPeer(groupPeerId, TEMP_ID)).toBeUndefined();
    expect(manager.getMessageByPeer(userPeerId, TEMP_ID)).toBe(inUser);
  });

  test('one deleted names its chat to the delete, which cannot find it by its id', async() => {
    const {manager, processLocalUpdate, pend} = setup();
    pend(userPeerId, '1');
    pend(groupPeerId, '2');

    await manager.deleteMessages(groupPeerId, [TEMP_ID]);

    expect(processLocalUpdate).toHaveBeenCalledWith(expect.objectContaining({
      _: 'updateDeleteMessages',
      messages: [TEMP_ID],
      peerId: groupPeerId
    }));
  });

  test('an edit made while one is sent waits for that one only', async() => {
    const {manager, pend} = setup();
    const inUser = pend(userPeerId, '1');
    const inGroup = pend(groupPeerId, '2');
    const editInUser = manager.editMessage(inUser, 'edited in the private chat');
    const editInGroup = manager.editMessage(inGroup, 'edited in the group');
    const edit = vi.spyOn(manager, 'editMessage').mockResolvedValue(undefined);

    manager.cancelPendingMessage('2');
    await expect(editInGroup).rejects.toMatchObject({type: 'UPLOAD_CANCELED'});

    const sent = served(userPeerId, 5);
    manager.finalizePendingMessage('1', sent);
    await editInUser;
    expect(edit).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledWith(sent, 'edited in the private chat', {});
  });
});

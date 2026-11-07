import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {SERVICE_PEER_ID} from '@appManagers/constants';
import {Message} from '@layer';

// Deleting a message the server has nothing of asks it for nothing. A message whose send failed calls the send off: a
// send left pending is waited for for good (in a slow mode group no other message may go while one is). The changelog
// the app puts into the service chat on an update is the client's alone: it is deleted here.

const peerId = (-77 as ChatId).toPeerId(true);

function setupManager(messages: {[mid: number]: Message.message}, idsManager: AppMessagesIdsManager, isChannel: boolean) {
  const manager = new AppMessagesManager();
  const invokeApi = vi.fn().mockResolvedValue({_: 'messages.affectedMessages', pts: 2, pts_count: 1});
  const processLocalUpdate = vi.fn();
  Object.assign(manager as any, {
    apiManager: {invokeApi, getConfig: vi.fn().mockResolvedValue({forwarded_count_max: 100})},
    apiUpdatesManager: {processLocalUpdate},
    appMessagesIdsManager: idsManager,
    appPeersManager: {isChannel: () => isChannel},
    appChatsManager: {
      getChat: () => ({_: 'channel', pFlags: {creator: true}}),
      getChannelInput: () => ({_: 'inputChannel', channel_id: 77, access_hash: '0'})
    }
  });
  vi.spyOn(manager, 'getMessageByPeer').mockImplementation((_peerId, mid) => messages[mid]);
  return {manager, invokeApi, processLocalUpdate};
}

function setup() {
  const idsManager = new AppMessagesIdsManager();
  const sentMid = idsManager.generateMessageId(10, 77 as ChatId);
  const failedMid = idsManager.generateTempMessageId(10, 77 as ChatId);
  const messages: {[mid: number]: Message.message} = {
    [sentMid]: {_: 'message', id: 10, mid: sentMid, peerId, pFlags: {out: true}, date: 0, message: 'sent'} as Message.message,
    [failedMid]: {
      _: 'message',
      id: failedMid,
      mid: failedMid,
      peerId,
      pFlags: {out: true, is_outgoing: true},
      date: 0,
      message: 'failed',
      random_id: '5',
      error: {type: 'SLOWMODE_WAIT_10'}
    } as any as Message.message
  };

  const {manager, invokeApi} = setupManager(messages, idsManager, true);
  const cancelPendingMessage = vi.spyOn(manager, 'cancelPendingMessage').mockReturnValue(true);

  return {manager, invokeApi, cancelPendingMessage, sentMid, failedMid};
}

describe('deleting a message whose send failed', () => {
  test('calls the send off and asks the server for nothing', async() => {
    const {manager, invokeApi, cancelPendingMessage, failedMid} = setup();

    await manager.deleteMessages(peerId, [failedMid]);

    expect(cancelPendingMessage).toHaveBeenCalledWith('5');
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('with a sent one, deletes the sent one on the server', async() => {
    const {manager, invokeApi, cancelPendingMessage, sentMid, failedMid} = setup();

    await manager.deleteMessages(peerId, [sentMid, failedMid]);

    expect(cancelPendingMessage).toHaveBeenCalledOnce();
    expect(invokeApi).toHaveBeenCalledWith('channels.deleteMessages', expect.objectContaining({id: [10]}));
  });
});

describe('deleting the changelog put into the service chat', () => {
  function setupChangelog() {
    const idsManager = new AppMessagesIdsManager();
    const mid = idsManager.generateTempMessageId(10, undefined);
    const message = {
      _: 'message',
      id: mid,
      mid,
      peerId: SERVICE_PEER_ID,
      pFlags: {unread: true, is_outgoing: true},
      date: 0,
      message: 'changelog'
    } as any as Message.message;
    return {...setupManager({[mid]: message}, idsManager, false), message, mid};
  }

  test('is allowed, while a send still waited for is not', () => {
    const {manager, message} = setupChangelog();

    expect(manager.canDeleteMessage(message)).toBe(true);
    expect(manager.canDeleteMessage({...message, random_id: '6'} as Message.message)).toBe(false);
  });

  test('deletes it here and asks the server for nothing', async() => {
    const {manager, invokeApi, processLocalUpdate, mid} = setupChangelog();

    await manager.deleteMessages(SERVICE_PEER_ID, [mid]);

    expect(invokeApi).not.toHaveBeenCalled();
    expect(processLocalUpdate).toHaveBeenCalledWith(expect.objectContaining({_: 'updateDeleteMessages', messages: [mid], peerId: SERVICE_PEER_ID}));
  });
});

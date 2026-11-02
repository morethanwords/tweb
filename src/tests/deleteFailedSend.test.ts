import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {Message} from '@layer';

// Deleting a message whose send failed calls the send off: the server has nothing of it to delete, and a send
// left pending is waited for for good (in a slow mode group no other message may go while one is).

const peerId = (-77 as ChatId).toPeerId(true);

function setup() {
  const manager = new AppMessagesManager();
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

  const invokeApi = vi.fn().mockResolvedValue({_: 'messages.affectedMessages', pts: 2, pts_count: 1});
  Object.assign(manager as any, {
    apiManager: {invokeApi, getConfig: vi.fn().mockResolvedValue({forwarded_count_max: 100})},
    apiUpdatesManager: {processLocalUpdate: vi.fn()},
    appMessagesIdsManager: idsManager,
    appPeersManager: {isChannel: () => true},
    appChatsManager: {
      getChat: () => ({_: 'channel', pFlags: {creator: true}}),
      getChannelInput: () => ({_: 'inputChannel', channel_id: 77, access_hash: '0'})
    }
  });
  vi.spyOn(manager, 'getMessageByPeer').mockImplementation((_peerId, mid) => messages[mid]);
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

import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message, Update} from '@layer';
import {stubModifyMessage} from '@/tests/helpers/modifyMessageStub';

// An update pinning or unpinning messages may name one the client cannot have: deleted since, or
// before the history a new member of a group sees. The others are still pinned or unpinned, and
// the pinned messages are asked for again.

const peerId = (42 as UserId).toPeerId(false);

function setup() {
  const manager = new AppMessagesManager();
  const message = {
    _: 'message',
    id: 5,
    mid: 5,
    peerId,
    peer_id: {_: 'peerUser', user_id: 42},
    pFlags: {pinned: true},
    date: 0,
    message: 'kept'
  } as Message.message;
  const storage = new Map<number, Message.message>([[5, message]]) as any;
  storage.key = `${peerId}_history`;

  Object.assign(manager as any, {
    appPeersManager: {getPeerId: () => peerId},
    appMessagesIdsManager: {generateMessageId: (id: number) => id}
  });
  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue(storage);
  // * the server has nothing by that id: an empty message comes back, and nothing is saved
  const reloadMessages = vi.spyOn(manager, 'reloadMessages').mockImplementation((_peerId, mids: number[]) => {
    return Promise.resolve(mids.map((mid) => ({_: 'messageEmpty', id: mid, mid} as any)));
  });
  stubModifyMessage(manager);
  const resetPinnedMessagesCache = vi.fn();
  (manager as any).resetPinnedMessagesCache = resetPinnedMessagesCache;

  return {manager, message, reloadMessages, resetPinnedMessagesCache};
}

describe('pinned messages update naming a message the client cannot have', () => {
  test.each([
    ['unpinned', false],
    ['pinned', true]
  ])('%s: the others change and the pinned messages are asked for again', async(_name, pinned) => {
    const {manager, message, reloadMessages, resetPinnedMessagesCache} = setup();

    const update: Update.updatePinnedMessages = {
      _: 'updatePinnedMessages',
      pFlags: pinned ? {pinned: true} : {},
      peer: {_: 'peerUser', user_id: 42},
      messages: [6, 5],
      pts: 1,
      pts_count: 1
    };
    if(!pinned) message.pFlags.pinned = true;
    else delete message.pFlags.pinned;

    (manager as any).onUpdatePinnedMessages(update);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(reloadMessages).toHaveBeenCalledWith(peerId, [6]);
    expect(!!message.pFlags.pinned).toBe(pinned);
    expect(resetPinnedMessagesCache).toHaveBeenCalledOnce();
    const [cachePeerId, cacheMids, cachePinned] = resetPinnedMessagesCache.mock.calls[0];
    expect([cachePeerId, cacheMids, !!cachePinned]).toEqual([peerId, [6, 5], pinned]);
  });
});

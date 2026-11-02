import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

// A forum shown as topics is read by reading its topics, and is never marked unread (as tdesktop's
// Thread::canToggleUnread). One whose topics are all read but which carries the "unread" mark (set on another
// device) is read by clearing the mark, as any chat is.

const peerId = (77 as ChatId).toPeerId(true);

// * getForumUnreadCount counts the first 20 topics only: `sampled` is what it sees of `unreadTopics`
function setup(unreadTopics: number, unreadMark = true, sampled = unreadTopics) {
  const manager = new AppMessagesManager();
  const dialog = {_: 'dialog', peerId, pFlags: unreadMark ? {unread_mark: true} : {}, unread_count: 0, top_message: 10} as any;
  const invokeApi = vi.fn().mockResolvedValue(true);
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appPeersManager: {
      isForum: () => true,
      getInputDialogPeerById: () => ({_: 'inputDialogPeer', peer: {_: 'inputPeerChannel', channel_id: 77, access_hash: '0'}}),
      getDialogPeer: () => ({_: 'dialogPeer', peer: {_: 'peerChannel', channel_id: 77}})
    },
    dialogsStorage: {
      getForumUnreadCount: () => ({count: sampled, hasUnmuted: false}),
      getFolder: () => ({unreadPeerIds: new Set(unreadTopics ? [100] : [])})
    }
  });
  vi.spyOn(manager, 'getDialogOnly').mockReturnValue(dialog);
  const readForumTopic = vi.spyOn(manager as any, 'readForumTopic').mockImplementation(() => undefined);
  vi.spyOn(manager as any, 'onUpdateDialogUnreadMark').mockImplementation(() => {});

  return {manager, invokeApi, readForumTopic};
}

describe('reading a forum', () => {
  test.each([
    ['asked to read', true],
    ['toggled', undefined]
  ])('with no unread topic left, %s, clears its unread mark', async(_name, read) => {
    const {manager, invokeApi} = setup(0);

    await manager.markDialogUnread({peerId, read});

    expect(invokeApi).toHaveBeenCalledWith('messages.markDialogUnread', expect.objectContaining({unread: undefined}));
  });

  test('with an unread topic beyond the first ones, reads it rather than clearing its mark', async() => {
    const {manager, invokeApi, readForumTopic} = setup(1, true, 0);

    await manager.markDialogUnread({peerId, read: true});

    expect(readForumTopic).toHaveBeenCalledWith(peerId, 100);
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('read through, is not marked unread', async() => {
    const {manager, invokeApi} = setup(0, false);

    await manager.markDialogUnread({peerId});

    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('with unread topics, reads them', async() => {
    const {manager, invokeApi, readForumTopic} = setup(1);

    await manager.markDialogUnread({peerId, read: true});

    expect(readForumTopic).toHaveBeenCalledWith(peerId, 100);
    expect(invokeApi).not.toHaveBeenCalled();
  });
});

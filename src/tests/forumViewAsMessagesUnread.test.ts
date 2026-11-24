import {FOLDER_ID_ALL} from '@appManagers/constants';
import {createAllChatsStorage, DIALOG_DATE as DATE, makeDialog} from '@/tests/helpers/dialogsStorage';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';
import deferredPromise from '@helpers/cancellablePromise';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type DialogsStorage from '@lib/storages/dialogs';

const CHANNEL_ID = 300;

type TopicsUnread = Awaited<ReturnType<DialogsStorage['getForumUnreadCount']>>;

// * what is unread of a forum is its topics, of one shown as messages its messages (`view_forum_as_messages`): the
// * switch, made here or elsewhere, changes what its folders count and what its row shows
describe('a forum switched to be shown as messages', () => {
  // * `topics`: what of its topics is unread - none, by default; a promise while they are not loaded
  const setup = (fields: Record<string, any>, initialTopics: TopicsUnread = {count: 0, hasUnmuted: false}) => {
    let topics: TopicsUnread | Promise<TopicsUnread> = initialTopics;
    const {storage, dates} = createAllChatsStorage();
    const forumPeerId = CHANNEL_ID.toPeerId(true);
    Object.assign((storage as any).appPeersManager, {isForum: (peerId: PeerId) => peerId === forumPeerId});
    (storage as any).appChatsManager.getChat = () => ({_: 'channel', id: CHANNEL_ID, pFlags: {megagroup: true, forum: true}});
    // * the manager's own count, of this storage's topics
    (storage as any).appMessagesManager.getDialogUnreadCount = AppMessagesManager.prototype.getDialogUnreadCount.bind({
      appPeersManager: (storage as any).appPeersManager,
      dialogsStorage: storage
    });
    (storage as any).getForumUnreadCount = (_peerId: PeerId, ignoreIfAsMessages?: boolean) => {
      return ignoreIfAsMessages && (storage as any).getDialogOnly(forumPeerId)?.pFlags.view_forum_as_messages ? undefined : topics;
    };
    const dispatchEvent = (storage as any).rootScope.dispatchEvent = vi.fn();

    dates.set(`${forumPeerId}_1`, DATE);
    storage.saveDialog({dialog: makeDialog(0, {peer: {_: 'peerChannel', channel_id: CHANNEL_ID}, top_message: 1, ...fields}) as any});

    return {
      forumPeerId,
      unread: () => [...storage.getFolder(FOLDER_ID_ALL).unreadPeerIds],
      unreadUnmuted: () => [...storage.getFolder(FOLDER_ID_ALL).unreadUnmutedPeerIds],
      rowsTold: () => dispatchedEvents(dispatchEvent, 'dialog_unread').map(({dialog}) => dialog.peerId),
      // * the switch, as it comes
      showAsMessages: (enabled: boolean) => (storage as any).onUpdateChannelViewForumAsMessages({_: 'updateChannelViewForumAsMessages', channel_id: CHANNEL_ID, enabled}),
      setTopics: (value: typeof topics) => topics = value
    };
  };

  test('is counted, and shown, the new way', () => {
    const {forumPeerId, unread, rowsTold, showAsMessages} = setup({unread_count: 5});
    expect(unread()).toEqual([]);

    showAsMessages(true);

    expect(unread()).toEqual([forumPeerId]);
    expect(rowsTold(), 'its row is not told').toEqual([forumPeerId]);

    showAsMessages(false);
    expect(unread()).toEqual([]);
  });

  test('stays unread by its unread mark, shown either way', () => {
    const {forumPeerId, unread, showAsMessages} = setup({unread_count: 0, pFlags: {unread_mark: true}});
    expect(unread()).toEqual([forumPeerId]);

    showAsMessages(true);
    expect(unread()).toEqual([forumPeerId]);
    showAsMessages(false);
    expect(unread()).toEqual([forumPeerId]);
  });

  test('is muted as its unread topics are, an unread mark of its own or not', () => {
    const {forumPeerId, unread, unreadUnmuted} = setup({unread_count: 3, pFlags: {unread_mark: true}}, {count: 1, hasUnmuted: false});

    expect(unread()).toEqual([forumPeerId]);
    expect(unreadUnmuted()).toEqual([]);
  });

  test('keeps the count of its messages when a count of its topics asked for before it went back to messages comes after', async() => {
    const {forumPeerId, unread, showAsMessages, setTopics} = setup({unread_count: 3, pFlags: {view_forum_as_messages: true}});
    expect(unread()).toEqual([forumPeerId]);

    const loading = deferredPromise<TopicsUnread>();
    setTopics(loading);
    showAsMessages(false);
    showAsMessages(true);
    expect(unread()).toEqual([forumPeerId]);

    loading.resolve({count: 0, hasUnmuted: false});
    await loading;
    await Promise.resolve();

    expect(unread(), 'a count of its topics took it for read').toEqual([forumPeerId]);
  });

  test('does nothing for the switch it has already taken', () => {
    const {rowsTold, showAsMessages} = setup({unread_count: 5});

    showAsMessages(false);

    expect(rowsTold()).toEqual([]);
  });
});

import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

// Repro for: "deleting a dialog with unread messages doesn't update the folder counter".
// The folder badge reads dialogsStorage.getFolderUnreadCount(filterId), a cached set of peer ids
// maintained by modifyFolderUnreadCount. Dropping a dialog (delete chat / leave channel / the same
// from another device) must remove it from that set, and so must archiving it.
//
// The bug was forum-only: modifyFolderUnreadCount recomputes a forum's aggregate unread from its
// (still cached, still unread) topics and thus re-added the peer that was being removed.
describeOrSkip('folder unread counter on dialog deletion', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({seed, testDc: false});
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  const FILTER_ID = 2;
  const FOLDER_ID_ALL = 0;
  const FOLDER_ID_ARCHIVE = 1;

  const makeFilters = () => {
    const filtersStorage: any = client.managers.filtersStorage;

    // register the real folders as filters, the same way prependFilters does in a live session
    filtersStorage.saveDialogFilter(filtersStorage.localFilters[FOLDER_ID_ALL], false);
    filtersStorage.saveDialogFilter(filtersStorage.localFilters[FOLDER_ID_ARCHIVE], false);

    filtersStorage.saveDialogFilter({
      _: 'dialogFilter',
      id: FILTER_ID,
      title: {_: 'textWithEntities', text: 'All', entities: []},
      pFlags: {contacts: true, groups: true, broadcasts: true},
      pinned_peers: [],
      include_peers: [],
      exclude_peers: [],
      pinnedPeerIds: [],
      includePeerIds: [],
      excludePeerIds: []
    } as any, false);
  };

  const makeDialog = (peerId: any, peer: any, unreadCount: number) => {
    const dialogsStorage: any = client.managers.dialogsStorage;

    const dialog: any = {
      _: 'dialog',
      peerId,
      peer,
      top_message: 10,
      read_inbox_max_id: 7,
      read_outbox_max_id: 10,
      unread_count: unreadCount,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      folder_id: FOLDER_ID_ALL,
      pFlags: {},
      draft: undefined
    };

    dialogsStorage.dialogs[peerId] = dialog;
    makeFilters();
    dialogsStorage.processDialogForFilters(dialog);

    return dialog;
  };

  const makeUserDialog = (userId: number, unreadCount: number) => {
    (client.managers.appUsersManager as any).saveApiUsers([{
      _: 'user',
      id: userId,
      access_hash: '0',
      first_name: 'Delete',
      last_name: 'Test',
      pFlags: {contact: true}
    }]);

    return makeDialog(userId, {_: 'peerUser', user_id: userId}, unreadCount);
  };

  const makeChannelDialog = (chatId: number, unreadCount: number, forum?: boolean) => {
    const dialogsStorage: any = client.managers.dialogsStorage;

    (client.managers.appChatsManager as any).saveApiChats([{
      _: 'channel',
      id: chatId,
      access_hash: '0',
      title: forum ? 'Forum Test' : 'Channel Test',
      pFlags: forum ? {megagroup: true, forum: true} : {broadcast: true}
    }]);

    const peerId = (chatId as any).toPeerId(true);

    if(forum) {
      // the forum's own "folder" holds its topics; make it look loaded so the unread count is sync
      dialogsStorage.getFolder(peerId).dialogs.push({
        _: 'forumTopic',
        peerId,
        id: 2,
        title: 'Topic',
        top_message: 10,
        read_inbox_max_id: 7,
        unread_count: unreadCount,
        unread_mentions_count: 0,
        unread_reactions_count: 0,
        notify_settings: {_: 'peerNotifySettings'},
        pFlags: {}
      });
      dialogsStorage.setDialogsLoaded(peerId, true);
    }

    return makeDialog(peerId, {_: 'peerChannel', channel_id: chatId}, unreadCount);
  };

  const snapshot = (folderId: number, key: any) => {
    const dialogsStorage: any = client.managers.dialogsStorage;
    const folder = dialogsStorage.getFolder(folderId);
    return {
      messages: folder.unreadMessagesCount,
      inPeerIds: folder.unreadPeerIds.has(key),
      badge: dialogsStorage.getFolderUnreadCount(folderId)
    };
  };

  const expectDropped = (label: string, dialog: any) => {
    const dialogsStorage: any = client.managers.dialogsStorage;
    const {peerId} = dialog;

    const before = snapshot(FILTER_ID, peerId);
    const beforeMain = snapshot(FOLDER_ID_ALL, peerId);
    console.log(`[${label}/before]`, before, 'folder0:', beforeMain);
    expect(before.inPeerIds).toBe(true);
    expect(beforeMain.inPeerIds).toBe(true);

    dialogsStorage.dropDialogOnDeletion(peerId);

    const after = snapshot(FILTER_ID, peerId);
    const afterMain = snapshot(FOLDER_ID_ALL, peerId);
    console.log(`[${label}/after ]`, after, 'folder0:', afterMain);

    expect(after.inPeerIds).toBe(false);
    expect(after.badge.unreadCount).toBe(before.badge.unreadCount - 1);
    expect(afterMain.inPeerIds).toBe(false);
    expect(afterMain.badge.unreadCount).toBe(beforeMain.badge.unreadCount - 1);
  };

  test('private dialog: dropping it removes it from the folder counters', () => {
    expectDropped('private', makeUserDialog(777000, 3));
  });

  test('plain channel: dropping it removes it from the folder counters', () => {
    expectDropped('channel', makeChannelDialog(7654321, 4));
  });

  test('forum: dropping it removes it from the folder counters', () => {
    expectDropped('forum', makeChannelDialog(1234567, 5, true));
  });

  test('forum: archiving it moves its unread count to the archive', () => {
    const dialogsStorage: any = client.managers.dialogsStorage;
    const dialog = makeChannelDialog(1234568, 5, true);
    const {peerId} = dialog;

    expect(snapshot(FOLDER_ID_ALL, peerId).inPeerIds).toBe(true);

    dialog.folder_id = FOLDER_ID_ARCHIVE;
    dialogsStorage.processDialogForFilters(dialog);

    const main = snapshot(FOLDER_ID_ALL, peerId);
    const archive = snapshot(FOLDER_ID_ARCHIVE, peerId);
    console.log('[forum/archived] folder0:', main, 'folder1:', archive);

    expect(archive.inPeerIds).toBe(true);
    expect(main.inPeerIds).toBe(false); // was: stayed counted in "All chats" as well
  });
});

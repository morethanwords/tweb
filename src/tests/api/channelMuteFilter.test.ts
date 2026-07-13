import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

// Investigate: a CHANNEL set to MUTED from another client ends up / lingers in
// an exclude_read folder until opened. Mute alone must not change exclude_read
// membership; read-from-another-client must remove it.
describeOrSkip('channel mute + exclude_read folder', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({seed, testDc: false});
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  function makeChannel(id: number, title: string) {
    const chats: any = client.managers.appChatsManager;
    chats.saveApiChats([{
      _: 'channel',
      id,
      access_hash: '0',
      title,
      date: 0,
      version: 0,
      photo: {_: 'chatPhotoEmpty'},
      pFlags: {broadcast: true}
    }]);
    return id;
  }

  function setupExcludeReadFilter() {
    const filtersStorage: any = client.managers.filtersStorage;
    filtersStorage.saveDialogFilter({
      _: 'dialogFilter',
      id: 2,
      title: {_: 'textWithEntities', text: 'Unread', entities: []},
      pFlags: {exclude_read: true, broadcasts: true, groups: true, contacts: true, non_contacts: true, bots: true},
      pinned_peers: [],
      include_peers: [],
      exclude_peers: [],
      pinnedPeerIds: [],
      includePeerIds: [],
      excludePeerIds: []
    } as any, false);
  }

  function injectChannelDialog(channelId: number, opts: {unreadCount: number; topServerMid: number; readInboxServerMid: number}) {
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] = {pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null};

    const peerId = (-channelId) as PeerId;
    const topMid = idsManager.generateMessageId(opts.topServerMid, channelId);
    const readInboxMid = idsManager.generateMessageId(opts.readInboxServerMid, channelId);

    const dialog: any = {
      _: 'dialog',
      peerId,
      peer: {_: 'peerChannel', channel_id: channelId},
      top_message: topMid,
      read_inbox_max_id: readInboxMid,
      read_outbox_max_id: topMid,
      unread_count: opts.unreadCount,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      folder_id: 0,
      pts: 1,
      pFlags: {},
      draft: undefined
    };
    dialogsStorage.dialogs[peerId] = dialog;
    return {peerId, dialog, topMid};
  }

  function inFolder(peerId: PeerId) {
    const dialogsStorage: any = client.managers.dialogsStorage;
    const indexKey = dialogsStorage.getDialogIndexKeyByFilterId(2);
    const dialog = dialogsStorage.getDialogOnly(peerId);
    return dialogsStorage.getDialogIndex(dialog, indexKey) !== undefined;
  }

  function muteUpdate(channelId: number) {
    return {
      _: 'updateNotifySettings',
      peer: {_: 'notifyPeer', peer: {_: 'peerChannel', channel_id: channelId}},
      notify_settings: {
        _: 'peerNotifySettings',
        mute_until: 2147483647, // muted forever
        show_previews: true,
        silent: true
      }
    } as any;
  }

  test('UNREAD channel: mute keeps it in exclude_read; reading elsewhere removes it', () => {
    const updates: any = client.managers.apiUpdatesManager;
    const channelId = 900001;
    makeChannel(channelId, 'Muted Unread Channel');
    setupExcludeReadFilter();
    const topServerMid = 100;
    const {peerId, dialog} = injectChannelDialog(channelId, {unreadCount: 5, topServerMid, readInboxServerMid: 95});

    client.managers.dialogsStorage.processDialogForFilters(dialog);
    console.log('[unread, not muted] in folder:', inFolder(peerId));
    expect(inFolder(peerId)).toBe(true);

    // mute from another client
    updates.saveUpdate(muteUpdate(channelId));
    console.log('[after mute] in folder (still unread -> should stay):', inFolder(peerId), 'unread_count:', dialog.unread_count, 'isDialogUnread:', client.managers.appMessagesManager.isDialogUnread(dialog));
    expect(inFolder(peerId)).toBe(true);

    // read from another client (updateReadChannelInbox with still_unread_count 0)
    updates.saveUpdate({
      _: 'updateReadChannelInbox',
      channel_id: channelId,
      max_id: topServerMid,
      still_unread_count: 0,
      pts: 2,
      pts_count: 0
    } as any);
    console.log('[after read elsewhere] in folder (should be false):', inFolder(peerId), 'unread_count:', dialog.unread_count);
    expect(dialog.unread_count).toBe(0);
    expect(inFolder(peerId)).toBe(false);
  });

  test('deleting a channels unread messages must drop it from exclude_read (not strand it)', () => {
    const m: any = client.managers.appMessagesManager;
    const updates: any = client.managers.apiUpdatesManager;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 900003;
    makeChannel(channelId, 'Channel With Deleted Posts');
    setupExcludeReadFilter();

    const readInboxServerMid = 100;
    const unreadServerIds = [101, 102];
    const topServerMid = 102;
    const {peerId, dialog} = injectChannelDialog(channelId, {unreadCount: unreadServerIds.length, topServerMid, readInboxServerMid});

    // inject the unread messages into history storage so handleDeletedMessages counts them
    const messagesStorage = m.getHistoryMessagesStorage(peerId);
    for(const serverId of unreadServerIds) {
      const mid = idsManager.generateMessageId(serverId, channelId);
      messagesStorage.set(mid, {
        _: 'message',
        mid,
        id: serverId,
        peerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        date: 0,
        message: 'post ' + serverId,
        pFlags: {unread: true}
      });
    }

    client.managers.dialogsStorage.processDialogForFilters(dialog);
    console.log('[unread channel] in folder:', inFolder(peerId));
    expect(inFolder(peerId)).toBe(true);

    // delete the unread posts (e.g. channel admin removes them / deleted from another client)
    updates.saveUpdate({
      _: 'updateDeleteChannelMessages',
      channel_id: channelId,
      messages: unreadServerIds,
      pts: 2,
      pts_count: unreadServerIds.length
    } as any);

    console.log('[after deleting unread posts] unread_count:', dialog.unread_count, 'in folder (should be false):', inFolder(peerId));
    expect(dialog.unread_count).toBe(0);
    expect(inFolder(peerId)).toBe(false);
  });

  test('READ channel: muting it must NOT make it appear in exclude_read', () => {
    const updates: any = client.managers.apiUpdatesManager;
    const channelId = 900002;
    makeChannel(channelId, 'Read Channel');
    setupExcludeReadFilter();
    const {peerId, dialog} = injectChannelDialog(channelId, {unreadCount: 0, topServerMid: 50, readInboxServerMid: 50});

    client.managers.dialogsStorage.processDialogForFilters(dialog);
    console.log('[read, not muted] in folder (should be false):', inFolder(peerId));
    expect(inFolder(peerId)).toBe(false);

    updates.saveUpdate(muteUpdate(channelId));
    console.log('[read, muted] in folder (should be false):', inFolder(peerId), 'unread_count:', dialog.unread_count, 'isDialogUnread:', client.managers.appMessagesManager.isDialogUnread(dialog));
    expect(inFolder(peerId)).toBe(false);
  });
});

import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

describeOrSkip('unread counter races', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;
  let realInvoke: typeof client.apiManager.invokeApi;
  const stubbedReadMethods = new Set([
    'channels.readHistory',
    'messages.readHistory',
    'messages.readSavedHistory',
    'messages.readDiscussion'
  ]);
  let pendingServerReads: Array<() => void> = [];

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({seed, testDc: false});

    realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(stubbedReadMethods.has(method)) {
        return new Promise<any>((resolve) => {
          pendingServerReads.push(() => resolve({_: 'messages.affectedMessages', pts: 0, pts_count: 0}));
        });
      }
      return realInvoke(method as any, params, opts);
    };
  }, 60_000);

  afterAll(() => {
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];
    client?.dispose();
  });

  function makeChannel(id: number, title: string, opts: {forum?: boolean} = {}) {
    const chats: any = client.managers.appChatsManager;
    chats.saveApiChats([{
      _: 'channel',
      id,
      access_hash: '0',
      title,
      date: 0,
      version: 0,
      photo: {_: 'chatPhotoEmpty'},
      pFlags: opts.forum ? {megagroup: true, forum: true} : {broadcast: true}
    }]);
    return id;
  }

  function injectForumTopic(peerId: number, channelId: number, topicServerId: number, opts: {
    unreadCount: number;
    unreadMentionsCount: number;
    topServerMid: number;
    readInboxServerMid: number;
  }) {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] ??= {
      pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null
    };

    const topicId = idsManager.generateMessageId(topicServerId, channelId);
    const topMid = idsManager.generateMessageId(opts.topServerMid, channelId);
    const readInboxMid = idsManager.generateMessageId(opts.readInboxServerMid, channelId);

    const topic: any = {
      _: 'forumTopic',
      id: topicId,
      peerId,
      title: 'Topic ' + topicServerId,
      date: 0,
      icon_color: 0,
      from_id: {_: 'peerUser', user_id: 1},
      notify_settings: {_: 'peerNotifySettings'},
      top_message: topMid,
      read_inbox_max_id: readInboxMid,
      read_outbox_max_id: topMid,
      unread_count: opts.unreadCount,
      unread_mentions_count: opts.unreadMentionsCount,
      unread_reactions_count: 0,
      pts: 1,
      folder_id: 0,
      pFlags: {}
    };
    const cache = dialogsStorage.getForumTopicsCache(peerId);
    cache.topics.set(topicId, topic);

    // populate topic message storage with mentions
    const messagesStorage = m.getHistoryMessagesStorage(peerId);
    const historyStorage = m.getHistoryStorage(peerId, topicId);
    historyStorage._maxId = topMid;
    historyStorage.count = (opts.topServerMid - opts.readInboxServerMid);
    historyStorage.readMaxId = readInboxMid;

    const mids: number[] = [];
    for(let serverId = opts.readInboxServerMid + 1; serverId <= opts.topServerMid; serverId++) {
      const mid = idsManager.generateMessageId(serverId, channelId);
      mids.push(mid);
      messagesStorage.set(mid, {
        _: 'message',
        mid,
        id: serverId,
        peerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        date: 0,
        message: 'mention ' + serverId,
        pFlags: {unread: true, media_unread: true, mentioned: true},
        reply_to: {
          _: 'messageReplyHeader',
          reply_to_msg_id: topicId,
          reply_to_top_id: topicId,
          pFlags: {forum_topic: true}
        }
      });
    }
    historyStorage.history.first.length = 0;
    historyStorage.history.first.push(...mids.slice().reverse());

    return {topic, topicId, historyStorage};
  }

  function injectDialog(peerId: number, channelId: number, opts: {
    unreadCount: number;
    topServerMid: number;
    readInboxServerMid: number;
  }) {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] = {
      pts: 1,
      pendingPtsUpdates: [],
      syncPending: null,
      syncLoading: null
    };

    const topMid = idsManager.generateMessageId(opts.topServerMid, channelId);
    const readInboxMid = idsManager.generateMessageId(opts.readInboxServerMid, channelId);

    const dialog: any = {
      _: 'dialog',
      peer: {_: 'peerChannel', channel_id: channelId},
      peerId,
      top_message: topMid,
      read_inbox_max_id: readInboxMid,
      read_outbox_max_id: topMid,
      unread_count: opts.unreadCount,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 0,
      index_0: 0,
      folder_id: 0,
      pFlags: {}
    };
    dialogsStorage.dialogs[peerId] = dialog;

    // populate history with messages [topServerMid - 30 .. topServerMid] all unread
    const historyStorage = m.getHistoryStorage(peerId);
    const messagesStorage = m.getHistoryMessagesStorage(peerId);
    historyStorage._maxId = topMid;
    historyStorage.count = 31;
    // mimic state after at least one prior read confirmed by server
    historyStorage.readMaxId = readInboxMid;

    const mids: number[] = [];
    for(let serverId = opts.topServerMid - 30; serverId <= opts.topServerMid; serverId++) {
      const mid = idsManager.generateMessageId(serverId, channelId);
      mids.push(mid);
      messagesStorage.set(mid, {
        _: 'message',
        mid,
        id: serverId,
        peerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        date: 0,
        message: 'm' + serverId,
        pFlags: serverId > opts.readInboxServerMid ? {unread: true} : {},
        from_id: undefined,
        out: false
      } as any);
    }
    historyStorage.history.first.length = 0;
    historyStorage.history.first.push(...mids.slice().reverse());
    historyStorage.history.first.setEnd?.(0); // SliceEnd.None — keep loose

    return {dialog, historyStorage, topMid, readInboxMid};
  }

  test('Bug 1 freeze: triedToReadMaxId stays stale during overlapping reads', async() => {
    const m: any = client.managers.appMessagesManager;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000001;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 1');

    const {dialog, historyStorage} = injectDialog(peerId as any, channelId, {
      unreadCount: 6188,
      topServerMid: 10000,
      readInboxServerMid: 9969 // first 30 in history are all unread
    });

    const baseMid = (sid: number) => idsManager.generateMessageId(sid, channelId);
    pendingServerReads = [];

    // Fire three reads with progressively higher maxIds, all while server stub blocks
    const p1 = m.readHistory({peerId, maxId: baseMid(9980), force: true});
    const p2 = m.readHistory({peerId, maxId: baseMid(9990), force: true});
    const p3 = m.readHistory({peerId, maxId: baseMid(9995), force: true});

    // Right now historyStorage.triedToReadMaxId reflects only the FIRST call's maxId
    const triedAfterRace = historyStorage.triedToReadMaxId;
    const expected = baseMid(9995);


    console.log('[Bug1] triedToReadMaxId =', triedAfterRace,
      'highest issued =', expected,
      'unread_count =', dialog.unread_count);

    // Now simulate user trying to mark up to 9985 (e.g. fast scroll caused multiple maxIds)
    // After server resolves and recovery sets triedToReadMaxId = 9995, a subsequent
    // call with smaller maxId should still do local apply but currently early-returns.
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];
    await Promise.all([p1, p2, p3]);

    // historyStorage.triedToReadMaxId is now whatever recovery set
    const triedAfterResolve = historyStorage.triedToReadMaxId;

    console.log('[Bug1] after resolve: triedToReadMaxId =', triedAfterResolve,
      'unread_count =', dialog.unread_count);

    // BUG demonstration: user receives a NEW unread message at sid 10001 (mid > triedToReadMaxId)
    // and immediately reads it — but a stale triedToReadMaxId could block subsequent calls
    // if its value got bumped above the new message via processing.
    // For this test we just confirm both invariants visibly:
    expect(triedAfterRace).toBeDefined();
    expect(triedAfterResolve).toBeGreaterThanOrEqual(triedAfterRace);
  }, 30_000);

  test('Bug 1 freeze: smaller maxId after large triedToReadMaxId is silently dropped', async() => {
    const m: any = client.managers.appMessagesManager;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000002;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 2');

    const {dialog, historyStorage} = injectDialog(peerId as any, channelId, {
      unreadCount: 6188,
      topServerMid: 10000,
      readInboxServerMid: 9969
    });

    const baseMid = (sid: number) => idsManager.generateMessageId(sid, channelId);
    pendingServerReads = [];

    // Pretend a previous readAllHistory bumped triedToReadMaxId to top
    historyStorage.triedToReadMaxId = baseMid(10000);

    const before = dialog.unread_count;

    // User scrolls to sid 9990 — should mark 9970..9990 (21 messages) as read
    await Promise.race([
      m.readHistory({peerId, maxId: baseMid(9990), force: true}),
      new Promise((r) => setTimeout(r, 100))
    ]);

    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];

    const after = dialog.unread_count;
    const decremented = before - after;

    console.log('[Bug1.b] before =', before, 'after =', after, 'decremented =', decremented);

    expect(decremented).toBe(21);
  }, 30_000);

  test('Bug 2 duplicate: replay via saveUpdate after dialog reload double-counts', async() => {
    const updates: any = client.managers.apiUpdatesManager;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000003;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 3');

    // Dialog already has the new message accounted for (server snapshot)
    const newServerId = 10001;
    const {dialog} = injectDialog(peerId as any, channelId, {
      unreadCount: 1,                  // server already counted it
      topServerMid: newServerId,       // top_message already includes it
      readInboxServerMid: 10000        // user has read up to mid 10000
    });

    const newMid = idsManager.generateMessageId(newServerId, channelId);

    // Same message replayed via saveUpdate (this is what happens when an update
    // arrived during reloadConversation and was queued; applyDialogs replays it
    // through saveUpdate which bypasses the pts dedup in processUpdate).
    const update = {
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: newServerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        from_id: undefined as any,
        date: Math.floor(Date.now() / 1000),
        message: 'hello',
        pFlags: {unread: true}
      },
      pts: 2,
      pts_count: 1
    };

    const before = dialog.unread_count;
    updates.saveUpdate(update);
    const after = dialog.unread_count;


    console.log('[Bug2] before =', before, 'after replay =', after,
      'newMid =', newMid, 'top_message =', dialog.top_message,
      'read_inbox_max_id =', dialog.read_inbox_max_id);

    // BUG: replay re-increments because the increment guard only checks
    // message.mid > dialog.top_message, not message.mid > dialog.read_inbox_max_id.
    // After server snapshot already counted the message AND set top_message=newMid,
    // saveUpdate of the same message: mid > top_message is FALSE so no increment.
    // But if reload finished JUST before the message landed in top_message
    // (top_message=10000, snapshot count=1 includes it), increment fires anyway.
    expect(after).toBe(before);
  }, 30_000);

  test('Bug 3 reload+read race: stale dialog snapshot must not roll back local read state', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000005;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 5');

    const {historyStorage} = injectDialog(peerId as any, channelId, {
      unreadCount: 10,
      topServerMid: 10000,
      readInboxServerMid: 9969
    });

    const baseMid = (sid: number) => idsManager.generateMessageId(sid, channelId);
    const currentDialog = () => dialogsStorage.getDialogOnly(peerId);

    pendingServerReads = [];
    await Promise.race([
      m.readHistory({peerId, maxId: baseMid(9979), force: true}),
      new Promise((r) => setTimeout(r, 100))
    ]);
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];

    const afterRead = currentDialog().unread_count;
    const readInboxAfterRead = currentDialog().read_inbox_max_id;
    const historyReadAfterRead = historyStorage.readMaxId;


    console.log('[Bug3] after local read: unread =', afterRead,
      'read_inbox_max_id =', readInboxAfterRead,
      'historyReadMaxId =', historyReadAfterRead);

    // Stale reloadConversation snapshot — predates the local read.
    dialogsStorage.applyDialogs({
      _: 'messages.peerDialogs',
      dialogs: [{
        _: 'dialog',
        peer: {_: 'peerChannel', channel_id: channelId},
        top_message: 10000,
        read_inbox_max_id: 9969,   // <-- BEHIND local
        read_outbox_max_id: 10000,
        unread_count: 10,          // <-- ROLLBACK from 0 to 10
        unread_mentions_count: 0,
        unread_reactions_count: 0,
        notify_settings: {_: 'peerNotifySettings'},
        pts: 1,
        folder_id: 0,
        pFlags: {}
      }],
      messages: [],
      chats: [],
      users: [],
      state: {_: 'updates.state', pts: 1, qts: 0, date: 0, seq: 0, unread_count: 0}
    });

    const afterReload = currentDialog().unread_count;
    const readInboxAfterReload = currentDialog().read_inbox_max_id;
    const historyReadAfterReload = historyStorage.readMaxId;


    console.log('[Bug3] after reload: unread =', afterReload,
      'read_inbox_max_id =', readInboxAfterReload,
      'historyReadMaxId =', historyReadAfterReload);

    // BUG: applyDialogs overwrites with stale server values, jumping
    // unread_count back up.
    // Expected after fix: read cursor never rolls back; unread <= afterRead.
    expect(readInboxAfterReload).toBeGreaterThanOrEqual(baseMid(9979));
    expect(historyReadAfterReload).toBeGreaterThanOrEqual(baseMid(9979));
    expect(afterReload).toBeLessThanOrEqual(afterRead);
  }, 30_000);

  test('Bug 3 duplicate counts: subsequent read after stale reload stays consistent', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000006;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 6');

    const {historyStorage} = injectDialog(peerId as any, channelId, {
      unreadCount: 10,
      topServerMid: 10000,
      readInboxServerMid: 9969
    });

    const baseMid = (sid: number) => idsManager.generateMessageId(sid, channelId);

    pendingServerReads = [];
    // First local read up to mid 9979
    await Promise.race([
      m.readHistory({peerId, maxId: baseMid(9979), force: true}),
      new Promise((r) => setTimeout(r, 100))
    ]);
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];

    // Stale reload snapshot (predates the read)
    dialogsStorage.applyDialogs({
      _: 'messages.peerDialogs',
      dialogs: [{
        _: 'dialog',
        peer: {_: 'peerChannel', channel_id: channelId},
        top_message: 10000,
        read_inbox_max_id: 9969,
        read_outbox_max_id: 10000,
        unread_count: 10,
        unread_mentions_count: 0,
        unread_reactions_count: 0,
        notify_settings: {_: 'peerNotifySettings'},
        pts: 1,
        folder_id: 0,
        pFlags: {}
      }],
      messages: [],
      chats: [],
      users: [],
      state: {_: 'updates.state', pts: 1, qts: 0, date: 0, seq: 0, unread_count: 0}
    });

    const currentDialog = () => dialogsStorage.getDialogOnly(peerId);
    const beforeSecondRead = currentDialog().unread_count;

    pendingServerReads = [];
    await Promise.race([
      m.readHistory({peerId, maxId: baseMid(9985), force: true}),
      new Promise((r) => setTimeout(r, 100))
    ]);
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];

    const afterSecondRead = currentDialog().unread_count;
    const decremented = beforeSecondRead - afterSecondRead;


    console.log('[Bug3.b] beforeSecond =', beforeSecondRead, 'afterSecond =', afterSecondRead,
      'decremented =', decremented,
      'historyReadMaxId after =', historyStorage.readMaxId,
      'triedToReadMaxId after =', historyStorage.triedToReadMaxId);

    // After fix: stale reload preserves local read state.
    // Counter never jumps back up; subsequent read decrements at most by the
    // genuinely new unread (mids 9980..9985 = 6).
    expect(beforeSecondRead).toBeLessThanOrEqual(10);
    expect(afterSecondRead).toBeLessThanOrEqual(beforeSecondRead);
  }, 30_000);

  test('Bug 2 duplicate: new message below read_inbox_max_id should not increment', async() => {
    const m: any = client.managers.appMessagesManager;
    const updates: any = client.managers.apiUpdatesManager;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000004;
    const peerId = -channelId;
    makeChannel(channelId, 'Race Test 4');

    // Dialog is fully read; read_inbox_max_id = 10000
    const {dialog} = injectDialog(peerId as any, channelId, {
      unreadCount: 0,
      topServerMid: 10000,
      readInboxServerMid: 10000
    });

    // Server resends an "old" message that the user already read on another device
    const oldServerId = 9999;
    const update = {
      _: 'updateNewChannelMessage',
      message: {
        _: 'message',
        id: oldServerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        from_id: undefined,
        date: Math.floor(Date.now() / 1000),
        message: 'old echo',
        pFlags: {unread: true}
      },
      pts: 1,
      pts_count: 1
    } as any;

    const before = dialog.unread_count;
    updates.processLocalUpdate(update);
    const after = dialog.unread_count;


    console.log('[Bug2.b] before =', before, 'after =', after,
      'oldMid =', idsManager.generateMessageId(oldServerId, channelId),
      'read_inbox_max_id =', dialog.read_inbox_max_id);

    // Already-read messages should never increment unread_count
    expect(after).toBe(0);
  }, 30_000);

  function makeBotforumUser(userId: number, name: string) {
    const users: any = client.managers.appUsersManager;
    users.saveApiUsers([{
      _: 'user',
      id: userId,
      access_hash: '0',
      first_name: name,
      pFlags: {bot: true, bot_forum_view: true, bot_forum_can_manage_topics: true}
    }]);
    return userId;
  }

  test('Bug 6 mentions: updateChannelReadMessagesContents must decrement unread_mentions_count (issue #380)', async() => {
    const updates: any = client.managers.apiUpdatesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const m: any = client.managers.appMessagesManager;
    const channelId = 999000020;
    const peerId = -channelId;
    makeChannel(channelId, 'Mentions Issue 380');

    // Inject parent dialog with one unread mention (and one unread message overall)
    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] ??= {pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null};

    const topMid = idsManager.generateMessageId(500, channelId);
    const dialog: any = {
      _: 'dialog',
      peer: {_: 'peerChannel', channel_id: channelId},
      peerId,
      top_message: topMid,
      read_inbox_max_id: idsManager.generateMessageId(499, channelId),
      read_outbox_max_id: topMid,
      unread_count: 1,
      unread_mentions_count: 1,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 1,
      index_0: 0,
      folder_id: 0,
      pFlags: {}
    };
    dialogsStorage.dialogs[peerId] = dialog;

    // The mention message must already be in local storage (the typical case
    // when the user has scrolled the chat list / loaded the dialog).
    const storage = m.getHistoryMessagesStorage(peerId);
    const mentionMid = topMid;
    storage.set(mentionMid, {
      _: 'message',
      mid: mentionMid,
      id: 500,
      peerId,
      peer_id: {_: 'peerChannel', channel_id: channelId},
      date: 0,
      message: '@me hello',
      pFlags: {unread: true, media_unread: true, mentioned: true}
    });

    // Server (or another device) reports the mention's content as read.
    // No history read yet — only the content-read.
    updates.processLocalUpdate({
      _: 'updateChannelReadMessagesContents',
      channel_id: channelId,
      messages: [500]
    });


    console.log('[Bug6] dialog.unread_mentions_count =', dialog.unread_mentions_count,
      'message.media_unread =', storage.get(mentionMid)?.pFlags?.media_unread);

    // BUG: the handler removes media_unread BEFORE checking isMentionUnread,
    // so addMention: false is never dispatched and the counter is stuck.
    expect(dialog.unread_mentions_count).toBe(0);
  }, 30_000);

  test('Bug 7 reactions in forum topic: readMessages must clear the topic unread_reactions_count + call readReactions with top_msg_id', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000030;
    const peerId = -channelId;
    const topicServerId = 100;
    makeChannel(channelId, 'Reactions Forum', {forum: true});

    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] ??= {pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null};

    const topMid = idsManager.generateMessageId(500, channelId);

    // Parent forum dialog: a forum channel tracks reaction counts PER TOPIC, not
    // on the channel dialog — so the parent's own unread_reactions_count is 0.
    const parentDialog: any = {
      _: 'dialog',
      peer: {_: 'peerChannel', channel_id: channelId},
      peerId,
      top_message: topMid,
      read_inbox_max_id: topMid,
      read_outbox_max_id: topMid,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 1,
      index_0: 0,
      folder_id: 0,
      pFlags: {forum: true}
    };
    dialogsStorage.dialogs[peerId] = parentDialog;

    // Topic carrying one unread reaction (to our own message inside the topic).
    const topicId = idsManager.generateMessageId(topicServerId, channelId);
    const topic: any = {
      _: 'forumTopic',
      id: topicId,
      peerId,
      title: 'Topic ' + topicServerId,
      date: 0,
      icon_color: 0,
      from_id: {_: 'peerUser', user_id: 1},
      notify_settings: {_: 'peerNotifySettings'},
      top_message: topMid,
      read_inbox_max_id: topMid,
      read_outbox_max_id: topMid,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 1,
      pts: 1,
      folder_id: 0,
      pFlags: {}
    };
    const cache = dialogsStorage.getForumTopicsCache(peerId);
    cache.topics.set(topicId, topic);

    // Our OUT message in the topic, with an unread reaction from someone else.
    const storage = m.getHistoryMessagesStorage(peerId);
    const reactionMid = topMid;
    storage.set(reactionMid, {
      _: 'message',
      mid: reactionMid,
      id: 500,
      peerId,
      peer_id: {_: 'peerChannel', channel_id: channelId},
      date: 0,
      message: 'my message',
      pFlags: {out: true},
      reply_to: {
        _: 'messageReplyHeader',
        reply_to_msg_id: topicId,
        reply_to_top_id: topicId,
        pFlags: {forum_topic: true}
      },
      reactions: {
        _: 'messageReactions',
        results: [{_: 'reactionCount', reaction: {_: 'reactionEmoji', emoticon: '\u{1F44D}'}, count: 1}],
        recent_reactions: [{
          _: 'messagePeerReaction',
          peer_id: {_: 'peerUser', user_id: 2},
          reaction: {_: 'reactionEmoji', emoticon: '\u{1F44D}'},
          pFlags: {unread: true}
        }]
      }
    });

    // Capture the dedicated server-side counter-reset calls.
    const invoked: Array<{method: string, params: any}> = [];
    const prevInvoke = (client.apiManager as any).invokeApi;
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'channels.readMessageContents') {
        invoked.push({method, params});
        return Promise.resolve(true);
      }
      if(method === 'messages.readReactions') {
        invoked.push({method, params});
        return Promise.resolve({_: 'messages.affectedHistory', pts: 0, pts_count: 0, offset: 0});
      }
      return prevInvoke(method, params, opts);
    };

    try {
      await m.readMessages(peerId, [reactionMid]);
    } finally {
      (client.apiManager as any).invokeApi = prevInvoke;
    }

    const readReactionsCall = invoked.find((c) => c.method === 'messages.readReactions');
    console.log('[Bug7] topic.unread_reactions_count =', topic.unread_reactions_count,
      '| parent.unread_reactions_count =', parentDialog.unread_reactions_count,
      '| readReactions top_msg_id =', readReactionsCall?.params?.top_msg_id ?? '(NOT CALLED)');

    // The topic's reaction badge must clear locally...
    expect(topic.unread_reactions_count).toBe(0);
    // ...and the server must be told to reset the TOPIC's reaction counter.
    expect(readReactionsCall).toBeTruthy();
    expect(readReactionsCall!.params.top_msg_id).toBe(topicServerId);
  }, 30_000);

  test('Bug 8 poll votes in forum topic: readMentions(isPollVote) stays scoped to the topic', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000040;
    const peerId = -channelId;
    const topicServerId = 200;
    makeChannel(channelId, 'Poll Votes Forum', {forum: true});

    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] ??= {pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null};

    const topMid = idsManager.generateMessageId(800, channelId);
    // Parent forum dialog tracks poll votes per-topic too -> 0 on the channel.
    dialogsStorage.dialogs[peerId] = {
      _: 'dialog',
      peer: {_: 'peerChannel', channel_id: channelId},
      peerId,
      top_message: topMid,
      read_inbox_max_id: topMid,
      read_outbox_max_id: topMid,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      unread_poll_votes_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 1,
      index_0: 0,
      folder_id: 0,
      pFlags: {forum: true}
    };

    const topicId = idsManager.generateMessageId(topicServerId, channelId);
    const topic: any = {
      _: 'forumTopic',
      id: topicId,
      peerId,
      title: 'Topic ' + topicServerId,
      date: 0,
      icon_color: 0,
      from_id: {_: 'peerUser', user_id: 1},
      notify_settings: {_: 'peerNotifySettings'},
      top_message: topMid,
      read_inbox_max_id: topMid,
      read_outbox_max_id: topMid,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      unread_poll_votes_count: 1,
      pts: 1,
      folder_id: 0,
      pFlags: {}
    };
    dialogsStorage.getForumTopicsCache(peerId).topics.set(topicId, topic);

    const invoked: Array<{method: string, params: any}> = [];
    const prevInvoke = (client.apiManager as any).invokeApi;
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.readPollVotes') {
        invoked.push({method, params});
        return Promise.resolve({_: 'messages.affectedHistory', pts: 0, pts_count: 0, offset: 0});
      }
      return prevInvoke(method, params, opts);
    };

    try {
      // This is the exact call the "go to next poll vote" button / traversal-end
      // fire (input.ts passes this.chat.threadId).
      await m.readMentions(peerId, topicId, false, true);
    } finally {
      (client.apiManager as any).invokeApi = prevInvoke;
    }

    const readPollVotesCall = invoked.find((c) => c.method === 'messages.readPollVotes');
    console.log('[Bug8] topic.unread_poll_votes_count =', topic.unread_poll_votes_count,
      '| readPollVotes top_msg_id =', readPollVotesCall?.params?.top_msg_id ?? '(NOT CALLED)');

    expect(topic.unread_poll_votes_count).toBe(0);
    expect(readPollVotesCall).toBeTruthy();
    expect(readPollVotesCall!.params.top_msg_id).toBe(topicServerId);
  }, 30_000);

  test('Bug 5 botforum: readHistory on a topic must mark messages even if parent dialog has unread_count=0', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const userId = 999000010;
    const peerId = userId; // user peerId == userId (positive)
    const topicServerId = 50;
    makeBotforumUser(userId, 'BotForum Bot');

    // Parent user dialog: unread_count = 0 (other topics are caught up),
    // but this topic has 3 unread mentions inside.
    const dialog: any = {
      _: 'dialog',
      peer: {_: 'peerUser', user_id: userId},
      peerId,
      top_message: idsManager.generateMessageId(200, 0),
      read_inbox_max_id: idsManager.generateMessageId(200, 0),
      read_outbox_max_id: idsManager.generateMessageId(200, 0),
      unread_count: 0,
      unread_mentions_count: 3,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 1,
      index_0: 0,
      folder_id: 0,
      pFlags: {}
    };
    dialogsStorage.dialogs[peerId] = dialog;

    // Topic with 3 unread mentions
    const topicId = topicServerId; // for user-peer botforum, no channel encoding
    const topMid = 200;
    const readInboxMid = 197;

    const topic: any = {
      _: 'forumTopic',
      id: topicId,
      peerId,
      title: 'Topic ' + topicServerId,
      date: 0,
      icon_color: 0,
      from_id: {_: 'peerUser', user_id: userId},
      notify_settings: {_: 'peerNotifySettings'},
      top_message: topMid,
      read_inbox_max_id: readInboxMid,
      read_outbox_max_id: topMid,
      unread_count: 3,
      unread_mentions_count: 3,
      unread_reactions_count: 0,
      pts: 1,
      folder_id: 0,
      pFlags: {}
    };
    const cache = dialogsStorage.getForumTopicsCache(peerId);
    cache.topics.set(topicId, topic);

    const messagesStorage = m.getHistoryMessagesStorage(peerId);
    const historyStorage = m.getHistoryStorage(peerId, topicId);
    historyStorage._maxId = topMid;
    historyStorage.count = 3;
    // intentionally NOT pre-setting historyStorage.readMaxId — this is the
    // realistic state right after the topic dialog is loaded for the first time.

    const mids: number[] = [];
    for(let serverId = readInboxMid + 1; serverId <= topMid; serverId++) {
      mids.push(serverId);
      messagesStorage.set(serverId, {
        _: 'message',
        mid: serverId,
        id: serverId,
        peerId,
        peer_id: {_: 'peerUser', user_id: userId},
        date: 0,
        message: 'mention ' + serverId,
        pFlags: {unread: true, media_unread: true, mentioned: true},
        reply_to: {
          _: 'messageReplyHeader',
          reply_to_msg_id: topicId,
          reply_to_top_id: topicId,
          pFlags: {forum_topic: true}
        }
      });
    }
    historyStorage.history.first.length = 0;
    historyStorage.history.first.push(...mids.slice().reverse());

    pendingServerReads = [];
    // No `force: true` — relying on the unread-detection logic to find the topic.
    await Promise.race([
      m.readHistory({peerId, maxId: topMid, threadId: topicId}),
      new Promise((r) => setTimeout(r, 100))
    ]);
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];


    console.log('[Bug5] topic.unread_mentions_count =', topic.unread_mentions_count,
      'topic.unread_count =', topic.unread_count,
      'parent.unread_mentions_count =', dialog.unread_mentions_count,
      'parent.unread_count =', dialog.unread_count);

    // BUG before fix: readHistory early-returns because the dialog lookup at line
    // 6151 only checks `isForum`, not `isBotforum`, so it gets the parent user
    // dialog (unread=0) instead of the topic, decides "isn't unread", and never
    // applies the local update. Topic's mentions stay at 3.
    expect(topic.unread_mentions_count).toBe(0);
    expect(topic.unread_count).toBe(0);
    expect(dialog.unread_mentions_count).toBe(0);
  }, 30_000);

  test('Bug 4 forum: parent dialog unread_mentions_count must drop when topic mention is read', async() => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const idsManager: any = client.managers.appMessagesIdsManager;
    const channelId = 999000007;
    const peerId = -channelId;
    const topicServerId = 100; // topic root mid
    makeChannel(channelId, 'Race Test 7 (forum)', {forum: true});

    // Parent forum dialog: tracks aggregate mentions across topics
    const dialog: any = {
      _: 'dialog',
      peer: {_: 'peerChannel', channel_id: channelId},
      peerId,
      top_message: idsManager.generateMessageId(10000, channelId),
      read_inbox_max_id: idsManager.generateMessageId(9969, channelId),
      read_outbox_max_id: idsManager.generateMessageId(10000, channelId),
      unread_count: 10,
      unread_mentions_count: 3,    // 3 mentions live somewhere in topics
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      pts: 1,
      index_0: 0,
      folder_id: 0,
      pFlags: {}
    };
    dialogsStorage.dialogs[peerId] = dialog;

    // Topic with 3 unread mentions
    const {topic, topicId} = injectForumTopic(peerId as any, channelId, topicServerId, {
      unreadCount: 3,
      unreadMentionsCount: 3,
      topServerMid: 200,
      readInboxServerMid: 197 // mids 198, 199, 200 are unread mentions
    });

    pendingServerReads = [];
    await Promise.race([
      m.readHistory({peerId, maxId: idsManager.generateMessageId(200, channelId), threadId: topicId, force: true}),
      new Promise((r) => setTimeout(r, 100))
    ]);
    pendingServerReads.forEach((r) => r());
    pendingServerReads = [];


    console.log('[Bug4] topic.unread_mentions_count =', topic.unread_mentions_count,
      'topic.unread_count =', topic.unread_count,
      'parent.unread_mentions_count =', dialog.unread_mentions_count,
      'parent.unread_count =', dialog.unread_count);

    // After fix: parent dialog's mentions count must reflect the read mentions.
    // Started with 3 mentions, all 3 read in the topic → parent should drop to 0.
    expect(topic.unread_mentions_count).toBe(0);
    expect(dialog.unread_mentions_count).toBe(0);
  }, 30_000);
});

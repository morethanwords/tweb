import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

// Regression test for: "when someone else's chat was JUST converted into a forum and a topic was
// created in it, the new topic never showed up for me".
//
// Two bugs conspired here:
//
// 1. `dialogsStorage.applyLocalForumTopics` (the local topic-create apply path added for the earlier
//    "new topic never appears" fix) called `applyDialogs` WITHOUT a peerId and WITH `pts: 0`. Both are
//    fatal: `processTopics` reads `peerId.isAnyChat()` (crashes on undefined) and, when a `pts` is
//    present, calls `addChannelState(pts)` which throws on `pts: 0`. The throw is swallowed by the
//    update dispatcher, so the topic was silently dropped for EVERY topic-create — even in a chat
//    already known to be a forum.
//
// 2. Even with (1) fixed, `onUpdateNewMessage` derives the topic id via getThreadKey ->
//    getMessageThreadId, which only yields a threadId for a `messageActionTopicCreate` when the cached
//    channel is ALREADY a forum. Right after another account flips the group into a forum, the
//    topic-create update can reach us before `pFlags.forum=true` propagates; with the flag still false
//    there is no threadId and the whole apply block is skipped. A topic-create only ever exists inside
//    a forum, so it is now recognized regardless of the (possibly stale) cached flag.

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

describeOrSkip('forum conversion: a topic-create update applies the new topic locally', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({seed, testDc: false});
    // saveMessages reads appUsersManager.getSelf().id on service-message paths; a raw invokeApi does
    // NOT populate the manager cache, so save the self user explicitly.
    const selfUsers = await client.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]});
    client.managers.appUsersManager.saveApiUsers(selfUsers as any);
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  function makeMegagroup(channelId: number, title: string, forum: boolean) {
    client.managers.appChatsManager.saveApiChats([{
      _: 'channel',
      id: channelId,
      access_hash: '0',
      title,
      date: 0,
      version: 0,
      photo: {_: 'chatPhotoEmpty'},
      pFlags: forum ? {megagroup: true, forum: true} : {megagroup: true}
    } as any]);
  }

  function injectRootDialog(peerId: number, channelId: number) {
    const idsManager: any = client.managers.appMessagesIdsManager;
    const apiUpdates: any = client.managers.apiUpdatesManager;
    apiUpdates.channelStates ??= {};
    apiUpdates.channelStates[channelId] ??= {pts: 1, pendingPtsUpdates: [], syncPending: null, syncLoading: null};

    const topMid = idsManager.generateMessageId(2, channelId);
    (client.managers.dialogsStorage as any).dialogs[peerId] = {
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
      pFlags: {}
    };
  }

  // Drives a topic-create update through the real update pipeline (processLocalUpdate ->
  // processUpdate -> saveUpdate -> onUpdateNewMessage). Returns the encoded topic id.
  function fireTopicCreate(channelId: number, topicServerId: number, title: string) {
    const idsManager: any = client.managers.appMessagesIdsManager;
    client.managers.apiUpdatesManager.processLocalUpdate({
      _: 'updateNewChannelMessage',
      message: {
        _: 'messageService',
        id: topicServerId,
        peer_id: {_: 'peerChannel', channel_id: channelId},
        date: 1700000000,
        action: {
          _: 'messageActionTopicCreate',
          title,
          icon_color: 0x6FB9F0
        },
        pFlags: {}
      }
    } as any);
    return idsManager.generateMessageId(topicServerId, channelId);
  }

  test('control: chat already known as a forum -> topic is applied locally', () => {
    const channelId = 990000101;
    const peerId = -channelId;
    makeMegagroup(channelId, 'Forum control', true);
    injectRootDialog(peerId, channelId);

    const encodedTopicId = fireTopicCreate(channelId, 41, 'Control Topic');

    const topic = client.managers.dialogsStorage.getForumTopic(peerId as PeerId, encodedTopicId);
    expect(topic).toBeDefined();
    expect((topic as any)?.title).toBe('Control Topic');
  });

  test('bug: topic-create arriving while the forum flag is still stale-false is still applied', () => {
    const channelId = 990000102;
    const peerId = -channelId;
    // NOT a forum yet on our side (forum=true has not propagated), but a root dialog already exists.
    makeMegagroup(channelId, 'Just converted', false);
    injectRootDialog(peerId, channelId);

    expect(client.managers.appChatsManager.isForum(channelId as ChatId)).toBe(false);

    const encodedTopicId = fireTopicCreate(channelId, 42, 'Converted Topic');

    const topic = client.managers.dialogsStorage.getForumTopic(peerId as PeerId, encodedTopicId);
    expect(topic).toBeDefined();
    expect((topic as any)?.title).toBe('Converted Topic');
  });
});

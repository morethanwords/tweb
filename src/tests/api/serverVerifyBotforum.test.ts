import {createTestClient} from './harness';
import {loadSeed} from './dualHarness';

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const username = '';

describeOrSkip(`Bug 5 e2e: botforum (@${username}) topic read on account A`, () => {
  test('readHistory on a botforum topic decrements server-side unread', async() => {
    const seed = loadSeed(seedAPath);
    const client = await createTestClient({seed, accountNumber: 1, testDc: false});

    // Trace outgoing API calls
    const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
    (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(/read|getForumTopics|getReplies|getPeerDialogs|getHistory/.test(method)) {
        console.log('  [→]', method, params?.peer?._ || '', params?.msg_id || params?.max_id || '');
      }
      return realInvoke(method as any, params, opts);
    };

    try {
      await client.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]});

      const resolved: any = await client.apiManager.invokeApi('contacts.resolveUsername' as any, {
        username: username
      } as any);
      const user = resolved.users.find((u: any) => u._ === 'user');
      const userId = user.id as number;
      const peerId = userId as PeerId;
      const inputPeerUser = {_: 'inputPeerUser', user_id: userId, access_hash: user.access_hash};

      console.log('[botforum]', {id: userId, bot_forum_view: !!user?.pFlags?.bot_forum_view});
      expect(user?.pFlags?.bot_forum_view).toBe(true);

      // List topics
      const topicsRes: any = await client.apiManager.invokeApi('messages.getForumTopics' as any, {
        peer: inputPeerUser,
        offset_date: 0,
        offset_id: 0,
        offset_topic: 0,
        limit: 30
      } as any);

      const topics: any[] = topicsRes.topics || [];

      console.log('[step 1] topics found:', topics.length, 'examples:',
        topics.slice(0, 5).map((t) => ({
          id: t.id, title: t.title?.slice(0, 30),
          top_message: t.top_message,
          unread_count: t.unread_count,
          unread_mentions_count: t.unread_mentions_count
        })));

      // Find one with unread, otherwise pick the latest
      const target = topics.find((t) => t.unread_count > 0) || topics[0];
      if(!target) {
        throw new Error('A has no topics in botforum either');
      }
      const serverBeforeUnread = target.unread_count as number;
      const topicServerId = target.id as number;
      const topMidServer = target.top_message as number;

      console.log('[step 2] target topic:', {
        id: topicServerId,
        title: target.title?.slice(0, 50),
        unread_count: serverBeforeUnread,
        top_message: topMidServer,
        read_inbox_max_id: target.read_inbox_max_id
      });

      if(serverBeforeUnread === 0) {
        console.warn('[step 2] target topic already fully read — Bug 5 still exercises early-return path');
      }

      // Apply server response into local state. For messages.forumTopics
      // applyDialogs needs the forum peerId as the second arg (used by
      // processTopics → addChannelState).
      client.managers.dialogsStorage.applyDialogs({...topicsRes, _: 'messages.forumTopics'} as any, peerId);

      // Pull topic history so messages land in storage
      const history: any = await client.apiManager.invokeApi('messages.getReplies' as any, {
        peer: inputPeerUser,
        msg_id: topicServerId,
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit: 30,
        max_id: 0,
        min_id: 0,
        hash: '0'
      } as any);
      client.managers.appMessagesManager.saveMessages(history.messages || [], {});

      // For botforum (user-peer), generateMessageId(serverId, 0) is identity
      const idsManager: any = client.managers.appMessagesIdsManager;
      const topicLocalId = idsManager.generateMessageId(topicServerId, 0 as any);
      const topMidLocal = idsManager.generateMessageId(topMidServer, 0 as any);

      // The Bug 5 fix should engage here:
      //  - getReadMaxIdIfUnread now treats botforum like forum (uses topic readMaxId)
      //  - the force-detection lookup at appMessagesManager.ts:6151 finds the topic dialog
      //  - messages.readDiscussion fires on the wire
      // Without `force: true` so we exercise the actual production path.

      console.log('[step 3] calling readHistory on topic (no force)');
      await client.managers.appMessagesManager.readHistory({
        peerId: peerId,
        maxId: topMidLocal,
        threadId: topicLocalId
      });

      await sleep(2500);

      // Re-fetch from server
      const topicsAfter: any = await client.apiManager.invokeApi('messages.getForumTopics' as any, {
        peer: inputPeerUser,
        offset_date: 0,
        offset_id: 0,
        offset_topic: 0,
        limit: 30
      } as any);
      const sameTopicAfter = (topicsAfter.topics || []).find((t: any) => t.id === topicServerId);

      console.log('[step 4] server AFTER read:', sameTopicAfter && {
        id: sameTopicAfter.id,
        unread_count: sameTopicAfter.unread_count,
        unread_mentions_count: sameTopicAfter.unread_mentions_count,
        top_message: sameTopicAfter.top_message,
        read_inbox_max_id: sameTopicAfter.read_inbox_max_id
      });

      const localTopic = client.managers.dialogsStorage.getForumTopic(peerId, topicLocalId);

      console.log('[step 5] local AFTER read:', localTopic && {
        unread_count: localTopic.unread_count,
        unread_mentions_count: localTopic.unread_mentions_count,
        read_inbox_max_id: localTopic.read_inbox_max_id
      });

      if(serverBeforeUnread > 0) {
        // The actual #380-style bug: server-side topic unread should drop to 0
        expect(sameTopicAfter?.unread_count ?? 0).toBe(0);
      }
      // Local must not exceed server (would be divergence)
      if(sameTopicAfter && localTopic) {
        expect(localTopic.unread_count).toBeLessThanOrEqual(sameTopicAfter.unread_count);
      }
    } finally {
      client.dispose();
    }
  }, 90_000);
});

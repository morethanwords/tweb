import {createDualClients, loadSeed} from './dualHarness';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';

// Regression guard for forum new-topic propagation to a cached/open list
// (reported as: "a new topic created by another account doesn't appear in the
// already-open topic list").
//
// Scenario: B is a member of the forum and has its topic list loaded (cached +
// `count` set). A creates a new topic. The server pushes the topic-create
// service message (updateNewChannelMessage w/ messageActionTopicCreate) to B —
// the same way `getChannelDifference` re-applies new channel messages.
// B's apiUpdatesManager.onUpdateNewMessage must insert the new topic into
// dialogsStorage and dispatch `dialogs_multiupdate` so the open ForumTab list
// renders it.
//
// This test feeds B that update directly (the deterministic equivalent of B
// receiving the live push) and asserts B's storage + event reflect the topic.
// It confirms the manager-level data path is correct end-to-end.

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const seedBPath = process.env.TG_API_SEED_B || './tmp/seed-b.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randomLongStr = () => String(Math.floor(Math.random() * 1e15));

describeOrSkip('server-verified forum new-topic propagation to a cached list', () => {
  test('new topic created by A appears in B cached topic list + dispatches dialogs_multiupdate', async() => {
    const seedA = loadSeed(seedAPath);
    const seedB = loadSeed(seedBPath);

    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});

    let channelId: number | undefined;
    let channelAccessHash: string | number | undefined;

    const aInputChannel = () => ({_: 'inputChannel' as const, channel_id: channelId!, access_hash: channelAccessHash!});
    const aInputPeer = () => ({_: 'inputPeerChannel' as const, channel_id: channelId!, access_hash: channelAccessHash!});

    try {
      // 0. self users (saveMessages reads getSelf().id)
      const [aMe, bMe]: any[] = await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}).then((u: any) => u[0]),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}).then((u: any) => u[0])
      ]);
      const usernameB: string | undefined = bMe?.username;
      console.log('[0] A =', aMe?.id, '| B =', bMe?.id, usernameB ? '@' + usernameB : '(no username)');
      if(!usernameB) throw new Error('B needs a username so A can add it to a fresh forum');

      const resolvedB: any = await dual.A.apiManager.invokeApi('contacts.resolveUsername', {username: usernameB} as any);
      const bResolved = resolvedB.users.find((u: any) => u.id === bMe.id);
      const bInputUser = {_: 'inputUser' as const, user_id: bResolved.id, access_hash: bResolved.access_hash};

      // 1. A creates a FORUM supergroup.
      const title = 'tweb-forum-newtopic-' + Date.now();
      const created: any = await dual.A.apiManager.invokeApi('channels.createChannel', {
        megagroup: true,
        forum: true,
        title,
        about: ''
      } as any);
      dual.A.managers.apiUpdatesManager.processUpdateMessage(created);
      const newChannel = (created.chats || []).find((c: any) => c._ === 'channel');
      channelId = newChannel?.id;
      channelAccessHash = newChannel?.access_hash;
      if(!channelId) throw new Error('forum create failed');
      const channelPeerId = (-channelId) as PeerId;
      console.log('[1] A created forum -> id', channelId, 'forum:', newChannel?.pFlags?.forum);

      // 2. A creates an existing topic (so the list is non-empty).
      const topic1Id = await dual.A.managers.appMessagesManager.createForumTopic({
        peerId: channelPeerId,
        title: 'First topic',
        iconColor: 0x6FB9F0,
        iconEmojiId: '0'
      });
      console.log('[2] A created first topic, encoded id', topic1Id);

      // 3. A invites B; B discovers its own access_hash for the channel.
      await dual.A.apiManager.invokeApi('channels.inviteToChannel', {
        channel: aInputChannel(),
        users: [bInputUser]
      } as any);
      console.log('[3] A invited B');
      await sleep(2000);

      const bDialogs: any = await dual.B.apiManager.invokeApi('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: {_: 'inputPeerEmpty'},
        limit: 50,
        hash: '0'
      } as any);
      // saving the dialog list into B's storage (so B has the forum's MAIN dialog)
      dual.B.managers.appPeersManager.saveApiPeers(bDialogs);
      dual.B.managers.dialogsStorage.applyDialogs(bDialogs as any);
      const bChannelAccessHash: string | number = (bDialogs.chats || []).find((c: any) => c.id === channelId)?.access_hash;
      if(bChannelAccessHash === undefined) throw new Error('B failed to obtain channel access_hash from dialogs');
      console.log('[3] B obtained channel access_hash; B has main dialog:',
        !!dual.B.managers.dialogsStorage.getDialogOnly(channelPeerId));

      // 4. B loads the forum topic list -> "cached and open". Sets folder.count.
      await dual.B.managers.dialogsStorage.getForumTopicById(channelPeerId, topic1Id).catch(() => {});
      await sleep(500);
      const bTopicsCacheBefore = (dual.B.managers.dialogsStorage as any).getForumTopicsCache(channelPeerId);
      console.log('[4] B cached topics count:', bTopicsCacheBefore?.topics?.size,
        '| topic1 present:', !!dual.B.managers.dialogsStorage.getForumTopic(channelPeerId, topic1Id));

      // 5. Spy on B's dialogs_multiupdate.
      const multiupdateTopicIds: number[] = [];
      dual.B.managers.rootScope.addEventListener('dialogs_multiupdate', (map: any) => {
        for(const [pid, {topics}] of map) {
          if(pid !== channelPeerId || !topics) continue;
          topics.forEach((_t: any, id: number) => multiupdateTopicIds.push(id));
        }
      });

      // 6. A creates a NEW topic; capture the updateNewChannelMessage.
      const topic2Title = 'NEW topic ' + Date.now();
      const created2: any = await dual.A.apiManager.invokeApi('messages.createForumTopic', {
        peer: aInputPeer(),
        title: topic2Title,
        icon_color: 0x6FB9F0,
        random_id: randomLongStr()
      } as any);
      const topic2ServerMsg = (created2.updates || []).find((u: any) => u._ === 'updateNewChannelMessage')?.message;
      const topic2ServerId: number = topic2ServerMsg?.id;
      console.log('[6] A created NEW topic, server msg id', topic2ServerId, 'action:', topic2ServerMsg?.action?._);
      if(!topic2ServerId) throw new Error('could not find topic2 create message');

      const topic2EncodedId = dual.B.managers.appMessagesIdsManager.generateMessageId(topic2ServerId, channelId);

      // 7. Feed B the same update the server would push to it (deterministic).
      //    Save only the USERS (for from_id) — saving the chats would clobber B's
      //    per-user channel access_hash with A's and break B's topic fetch.
      if((created2 as any).users?.length) {
        dual.B.managers.appUsersManager.saveApiUsers((created2 as any).users);
      }
      const updateForB = JSON.parse(JSON.stringify(
        (created2.updates || []).find((u: any) => u._ === 'updateNewChannelMessage')
      ));
      // the server marks the message `out` only for A; for B it isn't outgoing.
      if(updateForB?.message?.pFlags) {
        delete updateForB.message.pFlags.out;
        delete updateForB.message.pFlags.is_outgoing;
      }
      console.log('[7] feeding B updateNewChannelMessage; B isForum:',
        dual.B.managers.appChatsManager.isForum(channelId as ChatId));
      dual.B.managers.apiUpdatesManager.saveUpdate(updateForB);

      // 8. Let handleNewDialogs (pause 0) + the getForumTopicsByID fetch settle.
      await sleep(3000);

      // 9. Assert: B's storage has the new topic, and the event fired for it.
      const bTopic2 = dual.B.managers.dialogsStorage.getForumTopic(channelPeerId, topic2EncodedId);
      const bCacheAfter = (dual.B.managers.dialogsStorage as any).getForumTopicsCache(channelPeerId);
      console.log('[9] B topic2 in storage:', !!bTopic2, '| title:', bTopic2?.title,
        '| B cached topics count now:', bCacheAfter?.topics?.size,
        '| multiupdate topic ids seen:', multiupdateTopicIds);

      expect(bTopic2).toBeTruthy();
      expect(multiupdateTopicIds).toContain(topic2EncodedId);
    } finally {
      if(channelId !== undefined && channelAccessHash !== undefined) {
        try {
          await dual.A.apiManager.invokeApi('channels.deleteChannel', {channel: aInputChannel()} as any);
          console.log('[cleanup] A deleteChannel ok');
        } catch(err: any) {
          console.warn('[cleanup] A deleteChannel failed:', err?.type || err?.message || err);
        }
      }
      dual.dispose();
    }
  }, 120_000);
});

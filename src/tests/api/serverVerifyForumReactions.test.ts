import {createDualClients, loadSeed} from './dualHarness';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';

// Server-verified end-to-end test for the forum-topic reaction/mention badge.
//
// Bug: in forum topics `unread_reactions_count` never cleared. The per-message
// read path (readMessages -> updateChannelReadMessagesContents) re-dispatched a
// synthetic `updateMessageReactions` WITHOUT `top_msg_id`, so the local count
// landed on the parent forum dialog instead of the topic, and `readMessages`
// read the "had unread reactions" flag off the parent dialog (always 0 for a
// forum) so the dedicated server-side `messages.readReactions` never fired.
//
// This test creates a real forum + topic with two accounts, makes account B
// react to (and reply-mention) account A's message inside the topic, then has
// account A read them and asserts BOTH the server-side and local topic counters
// drop to 0 — for reactions AND mentions (unread_count is the control).

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const seedBPath = process.env.TG_API_SEED_B || './tmp/seed-b.json';
const describeOrSkip = ENABLED ? describe : describe.skip;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randomLongStr = () => String(Math.floor(Math.random() * 1e15));

function summarize(params: any) {
  if(!params || typeof params !== 'object') return params;
  const o: any = {};
  for(const k of Object.keys(params).slice(0, 6)) {
    const v = (params as any)[k];
    if(v == null) o[k] = v;
    else if(Array.isArray(v)) o[k] = `[len=${v.length}]`;
    else if(typeof v === 'object') o[k] = (v as any)._ || '{…}';
    else o[k] = String(v).slice(0, 40);
  }
  return o;
}

describeOrSkip('server-verified forum-topic reaction/mention reads', () => {
  test('topic unread_reactions_count + unread_mentions_count drop to 0 after readMessages', async() => {
    const seedA = loadSeed(seedAPath);
    const seedB = loadSeed(seedBPath);

    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});

    let channelId: number | undefined;
    let channelAccessHash: string | number | undefined;

    // Trace what actually goes over the wire from A (the reader). The fix is
    // proven if `messages.readReactions` (with top_msg_id) appears here.
    const realInvokeA = dual.A.apiManager.invokeApi.bind(dual.A.apiManager);
    const aCalls: Array<{method: string, params: any}> = [];
    (dual.A.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      if(method === 'messages.readReactions' || method === 'messages.readMentions') {
        aCalls.push({method, params});
        console.log('  [A → server]', method, summarize(params));
      }
      return realInvokeA(method as any, params, opts);
    };

    const aInputChannel = () => ({_: 'inputChannel' as const, channel_id: channelId!, access_hash: channelAccessHash!});
    const aInputPeer = () => ({_: 'inputPeerChannel' as const, channel_id: channelId!, access_hash: channelAccessHash!});

    try {
      // 0. Make sure each side knows its own User (saveMessages reads getSelf().id).
      const [aMe, bMe]: any[] = await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}).then((u: any) => u[0]),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}).then((u: any) => u[0])
      ]);
      const usernameA: string | undefined = aMe?.username;
      const usernameB: string | undefined = bMe?.username;
      console.log('[0] A =', aMe?.id, usernameA ? '@' + usernameA : '(no username)', '| B =', bMe?.id, usernameB ? '@' + usernameB : '(no username)');
      if(!usernameB) throw new Error('B needs a username so A can add it to a fresh forum');

      // 0b. A resolves B -> InputUser (with access_hash valid for A).
      const resolvedB: any = await dual.A.apiManager.invokeApi('contacts.resolveUsername', {username: usernameB} as any);
      const bResolved = resolvedB.users.find((u: any) => u.id === bMe.id);
      const bInputUser = {_: 'inputUser' as const, user_id: bResolved.id, access_hash: bResolved.access_hash};

      // 1. A creates a FORUM supergroup (megagroup + forum flag).
      const title = 'tweb-forum-test-' + Date.now();
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
      if(!channelId) throw new Error('forum create failed: ' + JSON.stringify(created).slice(0, 300));
      const channelPeerId = (-channelId) as PeerId;
      console.log('[1] A created forum', title, '-> id', channelId, 'forum:', newChannel?.pFlags?.forum);

      // 2. A creates a topic (manager method populates A's local topic + returns
      //    the ENCODED topic id). Derive the raw server id for API calls.
      const topicId = await dual.A.managers.appMessagesManager.createForumTopic({
        peerId: channelPeerId,
        title: 'Reactions topic',
        iconColor: 0x6FB9F0,
        iconEmojiId: '0'
      });
      const topicServerId = getServerMessageId(topicId);
      console.log('[2] A created topic, encoded id', topicId, 'server id', topicServerId);

      // 3. A posts a message INTO the topic — this is the message B will react to
      //    (unread reactions are reactions to OUR OWN messages).
      const aMsgRes: any = await dual.A.apiManager.invokeApi('messages.sendMessage', {
        peer: aInputPeer(),
        message: 'A: message inside the topic ' + Date.now(),
        random_id: randomLongStr(),
        reply_to: {_: 'inputReplyToMessage', reply_to_msg_id: topicServerId, top_msg_id: topicServerId}
      } as any);
      const aMsgUpdate = (aMsgRes.updates || []).find((u: any) =>
        u._ === 'updateNewChannelMessage' || u._ === 'updateNewMessage' || u._ === 'updateMessageID');
      const aMsgServerId: number = (aMsgUpdate?.message?.id) ?? aMsgRes.id ??
        (aMsgRes.updates || []).map((u: any) => u.message?.id).find(Boolean);
      console.log('[3] A posted in topic, msg id', aMsgServerId);
      if(!aMsgServerId) throw new Error('could not determine A message id: ' + JSON.stringify(aMsgRes).slice(0, 300));

      // 4. A adds B to the forum (A is the creator/admin). Then B discovers its
      //    OWN access_hash for the channel from its dialog list — a private
      //    supergroup's access_hash is per-user.
      await dual.A.apiManager.invokeApi('channels.inviteToChannel', {
        channel: aInputChannel(),
        users: [bInputUser]
      } as any);
      console.log('[4] A invited B');
      await sleep(2000);

      const bDialogs: any = await dual.B.apiManager.invokeApi('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: {_: 'inputPeerEmpty'},
        limit: 50,
        hash: '0'
      } as any);
      const bChannelAccessHash: string | number = (bDialogs.chats || []).find((c: any) => c.id === channelId)?.access_hash;
      if(bChannelAccessHash === undefined) throw new Error('B failed to obtain channel access_hash from dialogs');
      const bInputPeer = {_: 'inputPeerChannel' as const, channel_id: channelId!, access_hash: bChannelAccessHash};
      console.log('[4] B obtained channel access_hash');

      // 5. B reacts to A's message (-> A gets an unread reaction in the topic).
      await dual.B.apiManager.invokeApi('messages.sendReaction', {
        peer: bInputPeer,
        msg_id: aMsgServerId,
        reaction: [{_: 'reactionEmoji', emoticon: '\u{1F44D}'}]
      } as any);
      console.log('[5] B reacted to A message');

      // 6. B replies to A's message inside the topic (a reply to your message is
      //    an unread mention). Add an @username text-mention too when available.
      const mentionText = usernameA ?
        ('@' + usernameA + ' B: reply-mention') :
        'B: reply-mention';
      const mentionEntities = usernameA ?
        [{_: 'messageEntityMention', offset: 0, length: ('@' + usernameA).length}] :
        undefined;
      const bMsgRes: any = await dual.B.apiManager.invokeApi('messages.sendMessage', {
        peer: bInputPeer,
        message: mentionText,
        random_id: randomLongStr(),
        reply_to: {_: 'inputReplyToMessage', reply_to_msg_id: aMsgServerId, top_msg_id: topicServerId},
        entities: mentionEntities
      } as any);
      const bMsgServerId: number = (bMsgRes.updates || []).map((u: any) => u.message?.id).find(Boolean) ?? bMsgRes.id;
      console.log('[6] B replied/mentioned, msg id', bMsgServerId);

      // 7. Let the server fan the reaction + mention out.
      await sleep(2500);

      // 8. A loads the topic from the server (truth source AND populates A's local
      //    topic dialog with the counters). Then loads the topic history so the
      //    reaction/mention messages are in A's local message storage.
      const topicBefore = await dual.A.managers.dialogsStorage.getForumTopicById(channelPeerId, topicId);
      console.log('[8] topic BEFORE read:', {
        unread_count: topicBefore?.unread_count,
        unread_mentions_count: topicBefore?.unread_mentions_count,
        unread_reactions_count: topicBefore?.unread_reactions_count
      });

      const replies: any = await dual.A.apiManager.invokeApi('messages.getReplies', {
        peer: aInputPeer(),
        msg_id: topicServerId,
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit: 50,
        max_id: 0,
        min_id: 0,
        hash: '0'
      } as any);
      dual.A.managers.appPeersManager.saveApiPeers(replies);
      dual.A.managers.appMessagesManager.saveMessages(replies.messages, {});

      const idsMgr = dual.A.managers.appMessagesIdsManager;
      const aMsgLocalMid = idsMgr.generateMessageId(aMsgServerId, channelId);
      const bMsgLocalMid = bMsgServerId ? idsMgr.generateMessageId(bMsgServerId, channelId) : undefined;

      // Sanity: confirm A actually sees the unread reaction + mention locally.
      const aMsgLocal: any = dual.A.managers.appMessagesManager.getMessageByPeer(channelPeerId, aMsgLocalMid);
      const bMsgLocal: any = bMsgLocalMid && dual.A.managers.appMessagesManager.getMessageByPeer(channelPeerId, bMsgLocalMid);
      const aMsgUnreadReaction = aMsgLocal?.reactions?.recent_reactions?.some((r: any) => r.pFlags?.unread);
      console.log('[8] local A msg unread reaction =', !!aMsgUnreadReaction,
        '| local B msg mentioned/media_unread =', !!bMsgLocal?.pFlags?.mentioned, '/', !!bMsgLocal?.pFlags?.media_unread);

      expect(topicBefore?.unread_reactions_count ?? 0).toBeGreaterThanOrEqual(1);

      // 9. A reads the content of both messages — the exact path bubbles.ts drives
      //    when the messages scroll into view. Then a history read to fully catch up.
      const readMids = [aMsgLocalMid, bMsgLocalMid].filter(Boolean) as number[];
      await dual.A.managers.appMessagesManager.readMessages(channelPeerId, readMids);
      await dual.A.managers.appMessagesManager.readHistory({
        peerId: channelPeerId,
        maxId: Math.max(...readMids),
        threadId: topicId,
        force: true
      });

      // 10. Let the server register the reads.
      await sleep(2500);

      // 11. Truth source: re-fetch the topic straight from the server.
      const after: any = await dual.A.apiManager.invokeApi('messages.getForumTopicsByID', {
        peer: aInputPeer(),
        topics: [topicServerId]
      } as any);
      const serverTopic = (after.topics || []).find((t: any) => t._ === 'forumTopic');
      console.log('[11] topic AFTER read — SERVER:', {
        unread_count: serverTopic?.unread_count,
        unread_mentions_count: serverTopic?.unread_mentions_count,
        unread_reactions_count: serverTopic?.unread_reactions_count
      });

      // 12. Local state on A's side.
      const localTopic: any = dual.A.managers.dialogsStorage.getForumTopic(channelPeerId, topicId);
      console.log('[12] topic AFTER read — LOCAL:', {
        unread_count: localTopic?.unread_count,
        unread_mentions_count: localTopic?.unread_mentions_count,
        unread_reactions_count: localTopic?.unread_reactions_count
      });
      console.log('[trace] A dedicated read calls:', aCalls.map((c) => c.method + '(top_msg_id=' + c.params?.top_msg_id + ')'));

      // The reported bug: reactions in a topic.
      expect(serverTopic?.unread_reactions_count ?? 0).toBe(0);
      expect(localTopic?.unread_reactions_count ?? 0).toBe(0);
      // The dedicated topic-scoped server reset must have fired.
      expect(aCalls.some((c) => c.method === 'messages.readReactions' && c.params?.top_msg_id === topicServerId)).toBe(true);

      // The other counters must clear too (control + sibling counter).
      expect(serverTopic?.unread_mentions_count ?? 0).toBe(0);
      expect(localTopic?.unread_mentions_count ?? 0).toBe(0);
      expect(serverTopic?.unread_count ?? 0).toBe(0);
      expect(localTopic?.unread_count ?? 0).toBe(0);
    } finally {
      if(channelId !== undefined && channelAccessHash !== undefined) {
        try {
          await dual.A.apiManager.invokeApi('channels.deleteChannel', {
            channel: aInputChannel()
          } as any);
          console.log('[cleanup] A deleteChannel ok');
        } catch(err: any) {
          console.warn('[cleanup] A deleteChannel failed:', err?.type || err?.message || err);
        }
      }
      dual.dispose();
    }
  }, 120_000);
});

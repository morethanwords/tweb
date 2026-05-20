import {createDualClients, loadSeed} from './dualHarness';

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
    else o[k] = String(v).slice(0, 30);
  }
  return o;
}

describeOrSkip('server-verified mention reads (issue #380)', () => {
  test('Bug 6 e2e: server-side unread_mentions_count drops to 0 after readMessages', async() => {
    const seedA = loadSeed(seedAPath);
    const seedB = loadSeed(seedBPath);

    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});

    let createdChatId: number | undefined;

    // Trace B's outgoing API calls so we can see what actually went over the wire.
    const realInvokeB = dual.B.apiManager.invokeApi.bind(dual.B.apiManager);
    (dual.B.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
      console.log('  [B → server]', method, summarize(params));
      const p = realInvokeB(method as any, params, opts) as Promise<any>;
      p.then(
        (r: any) => {
          console.log('  [B ← server]', method, 'OK', r?._ || (Array.isArray(r) ? `[${r.length}]` : typeof r));
        },
        (err: any) => {
          console.warn('  [B ← server]', method, 'ERR', err?.type || err?.message || err);
        }
      );
      return p;
    };

    try {
      // 0. Make sure each side knows its own User (saveMessages reads getSelf().id)
      await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]})
      ]);

      // 1. B's username
      const bMe: any = (await dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}))[0];
      const usernameB = bMe?.username as string | undefined;
      if(!usernameB) throw new Error('B has no username; needed to add to a fresh group');

      console.log('[step 1] B is', bMe?.id, '@' + usernameB);

      // 2. A resolves B by username -> InputUser with access_hash
      const resolved: any = await dual.A.apiManager.invokeApi('contacts.resolveUsername' as any, {
        username: usernameB
      } as any);
      const bResolvedUser = resolved.users.find((u: any) => u.id === bMe.id);
      const bInputUser = {
        _: 'inputUser' as const,
        user_id: bResolvedUser.id,
        access_hash: bResolvedUser.access_hash
      };

      console.log('[step 2] A resolved @' + usernameB, '-> id', bResolvedUser.id);

      // 3. A creates a small group with B as member
      const title = 'tweb-test-' + Date.now();
      const created: any = await dual.A.apiManager.invokeApi('messages.createChat' as any, {
        users: [bInputUser],
        title,
        ttl_period: 0
      } as any);

      const updates = created.updates || created;
      const newChat = (updates.chats || []).find((c: any) => c._ === 'chat' || c._ === 'channel');
      createdChatId = newChat?.id;

      console.log('[step 3] A created chat', title, '-> id', createdChatId);

      if(!createdChatId) {
        throw new Error('Failed to create chat: ' + JSON.stringify(updates).slice(0, 300));
      }

      // 4. A sends message with @mention entity
      const messageText = '@' + usernameB + ' test mention #' + Date.now();
      await dual.A.apiManager.invokeApi('messages.sendMessage' as any, {
        peer: {_: 'inputPeerChat', chat_id: createdChatId},
        message: messageText,
        random_id: randomLongStr(),
        entities: [{
          _: 'messageEntityMention',
          offset: 0,
          length: ('@' + usernameB).length
        }]
      } as any);

      console.log('[step 4] A sent:', messageText);

      // 5. Give server a moment to fan out the update
      await sleep(2000);

      // 6. B fetches the dialog from server (truth source)
      const bDialogPeer = {
        _: 'inputDialogPeer',
        peer: {_: 'inputPeerChat', chat_id: createdChatId}
      };
      const bDialogsBefore: any = await dual.B.apiManager.invokeApi('messages.getPeerDialogs' as any, {
        peers: [bDialogPeer]
      } as any);
      const serverBefore = bDialogsBefore.dialogs[0];

      console.log('[step 6] server BEFORE read:', {
        unread_count: serverBefore?.unread_count,
        unread_mentions_count: serverBefore?.unread_mentions_count,
        top_message: serverBefore?.top_message
      });

      expect(serverBefore?.unread_mentions_count).toBeGreaterThanOrEqual(1);

      // 7. Apply the dialogs response into B's local state so the local-apply
      //    path (the one Bug 6 fixes) actually has the dialog + message present.
      dual.B.managers.dialogsStorage.applyDialogs(bDialogsBefore);

      const groupPeerId = (-createdChatId) as PeerId;

      // 8. Pull the actual chat history (so the mention message lands in
      //    historyMessagesStorage — same as bubbles.ts does on chat open).
      const history: any = await dual.B.apiManager.invokeApi('messages.getHistory' as any, {
        peer: {_: 'inputPeerChat', chat_id: createdChatId},
        offset_id: 0,
        offset_date: 0,
        add_offset: 0,
        limit: 30,
        max_id: 0,
        min_id: 0,
        hash: '0'
      } as any);
      dual.B.managers.appMessagesManager.saveMessages(history.messages, {});

      // Find the actual mention text message in history (top_message can be
      // a "user added" service message inserted by the server after createChat).
      const mentionMsg = (history.messages as any[]).find((m) =>
        m._ === 'message' &&
        (m.pFlags?.mentioned || m.entities?.some((e: any) => e._ === 'messageEntityMention'))
      );
      if(!mentionMsg) {
        console.warn('[debug] history.messages =', history.messages.map((m: any) => ({_: m._, id: m.id, action: m.action?._, mentioned: m.pFlags?.mentioned})));
        throw new Error('Could not find mention message in history');
      }
      const mentionServerMid = mentionMsg.id;
      const mentionLocalMid = dual.B.managers.appMessagesIdsManager.generateMessageId(mentionServerMid, 0 as any);

      console.log('[step 8] mention message id:', mentionServerMid, 'local mid:', mentionLocalMid);

      // 9. B fires real readMessages (no stub). This is the path #380 covers.
      // The fix in readMessages should also fire messages.readMentions
      // automatically when any of the read mids is a mention.
      await dual.B.managers.appMessagesManager.readMessages(groupPeerId, [mentionLocalMid]);

      // also fire history-read so the dialog is fully marked read
      await dual.B.managers.appMessagesManager.readHistory({
        peerId: groupPeerId,
        maxId: mentionLocalMid,
        force: true
      });

      // 10. Give server time to register the read
      await sleep(2000);

      // 11. Re-fetch the dialog from server to learn the truth
      const bDialogsAfter: any = await dual.B.apiManager.invokeApi('messages.getPeerDialogs' as any, {
        peers: [bDialogPeer]
      } as any);
      const serverAfter = bDialogsAfter.dialogs[0];

      console.log('[step 11] server AFTER read:', {
        unread_count: serverAfter?.unread_count,
        unread_mentions_count: serverAfter?.unread_mentions_count,
        top_message: serverAfter?.top_message
      });

      // 12. Local state on B side
      const localDialog = dual.B.managers.dialogsStorage.getDialogOnly(groupPeerId);

      console.log('[step 12] local AFTER read:', {
        unread_count: localDialog?.unread_count,
        unread_mentions_count: localDialog?.unread_mentions_count
      });

      expect(serverAfter?.unread_mentions_count ?? 0).toBe(0);
      expect(localDialog?.unread_mentions_count ?? 0).toBe(0);
    } finally {
      // Cleanup: A (creator) deletes the chat for both sides.
      if(createdChatId !== undefined) {
        try {
          await dual.A.apiManager.invokeApi('messages.deleteChat' as any, {chat_id: createdChatId} as any);

          console.log('[cleanup] A deleteChat ok');
        } catch(err: any) {
          console.warn('[cleanup] A deleteChat failed:', err?.type || err?.message || err);
        }

        // B also clears its inbox copy (without revoke — non-admins cannot revoke chat)
        try {
          await dual.B.apiManager.invokeApi('messages.deleteHistory' as any, {
            peer: {_: 'inputPeerChat', chat_id: createdChatId},
            max_id: 0
          } as any);
        } catch{}
      }

      dual.dispose();
    }
  }, 90_000);
});

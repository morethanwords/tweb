import {createDualClients, loadSeed} from './dualHarness';

// Verifies that a private dialog disappears from local state (dialogsStorage +
// 'dialog_drop' event, which every dialog list in the UI listens to) when:
//   1. the dialog is deleted from ANOTHER SESSION of the same account
//      (simulated by a raw messages.deleteHistory that bypasses the manager
//      stack, so the client only learns about it via updates/getDifference);
//   2. the OTHER SIDE deletes the dialog with revoke=true (delete for both).

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

function trace(client: any, tag: string) {
  const realInvoke = client.apiManager.invokeApi.bind(client.apiManager);
  (client.apiManager as any).invokeApi = (method: string, params: any, opts: any) => {
    console.log(`  [${tag} → server]`, method, summarize(params));
    const p = realInvoke(method as any, params, opts) as Promise<any>;
    p.then(
      (r: any) => {
        let extra = '';
        if(method === 'messages.getPeerDialogs') {
          extra = ' dialogs=' + JSON.stringify((r.dialogs || []).map((d: any) => ({
            _: d._, top_message: d.top_message, unread: d.unread_count
          })));
        }
        console.log(`  [${tag} ← server]`, method, 'OK', (r?._ || typeof r) + extra);
      },
      (err: any) => console.warn(`  [${tag} ← server]`, method, 'ERR', err?.type || err?.message || err)
    );
    return p;
  };
  return realInvoke;
}

describeOrSkip('dialog deletion propagation (other session / other side)', () => {
  test('dialog drops locally on remote deleteHistory', async() => {
    const seedA = loadSeed(seedAPath);
    const seedB = loadSeed(seedBPath);
    const dual = await createDualClients({seedA, seedB, testDc: process.env.TG_API_PROD_DC !== '1'});

    // A stray AUTH_KEY_DUPLICATED/SESSION_REVOKED makes apiManager.logOut()
    // revoke the seed's auth keys on EVERY dc — never allow that in tests.
    (dual.A.managers.apiManager as any).logOut = () => console.warn('  [A] logOut suppressed');
    (dual.B.managers.apiManager as any).logOut = () => console.warn('  [B] logOut suppressed');

    const realInvokeA = trace(dual.A, 'A');
    const realInvokeB = trace(dual.B, 'B');

    try {
      // 0. selves (saveMessages reads getSelf().id)
      await Promise.all([
        dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}),
        dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]})
      ]);

      // 1. A resolves B
      const bMe: any = (await dual.B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}))[0];
      const aMe: any = (await dual.A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}))[0];
      if(!bMe?.username) throw new Error('B has no username');
      const resolved: any = await dual.A.apiManager.invokeApi('contacts.resolveUsername' as any, {username: bMe.username} as any);
      const bUser = resolved.users.find((u: any) => u.id === bMe.id);
      const bInputPeer = {_: 'inputPeerUser' as const, user_id: bUser.id, access_hash: bUser.access_hash};
      const bPeerId = bUser.id.toPeerId(false) as PeerId;

      console.log('[setup] A =', aMe.id, ' B =', bMe.id, '@' + bMe.username, ' bPeerId =', bPeerId);

      // 2. Live updates on A (the observer side in both scenarios)
      dual.A.managers.apiUpdatesManager.attach();
      await sleep(3000);

      // Trace every update A applies
      const updatesA: any = dual.A.managers.apiUpdatesManager;
      const realSaveUpdate = updatesA.saveUpdate.bind(updatesA);
      updatesA.saveUpdate = (u: any) => {
        console.log('  [A update]', u._, u.messages ? `messages=[len=${u.messages.length}]` : '');
        return realSaveUpdate(u);
      };

      // dialog_drop listener — this event is what dialog lists in the UI react to
      const drops: PeerId[] = [];
      (dual.A.managers.rootScope as any).addEventListener('dialog_drop', (dialog: any) => {
        console.log('  [A event] dialog_drop peerId =', dialog?.peerId);
        drops.push(dialog?.peerId);
      });

      const loadDialogOnA = async() => {
        const peerDialogs: any = await dual.A.apiManager.invokeApi('messages.getPeerDialogs' as any, {
          peers: [{_: 'inputDialogPeer', peer: bInputPeer}]
        } as any);
        dual.A.managers.dialogsStorage.applyDialogs(peerDialogs);
        const history: any = await dual.A.apiManager.invokeApi('messages.getHistory' as any, {
          peer: bInputPeer, offset_id: 0, offset_date: 0, add_offset: 0,
          limit: 50, max_id: 0, min_id: 0, hash: '0'
        } as any);
        dual.A.managers.appMessagesManager.saveMessages(history.messages, {});
        return {dialog: peerDialogs.dialogs[0], historyCount: history.count ?? history.messages.length};
      };

      const waitForDrop = async(timeoutMs: number) => {
        const t0 = Date.now();
        while(Date.now() - t0 < timeoutMs) {
          if(!dual.A.managers.dialogsStorage.getDialogOnly(bPeerId)) return true;
          await sleep(500);
        }
        return !dual.A.managers.dialogsStorage.getDialogOnly(bPeerId);
      };

      const deleteHistoryLoop = async(invoke: any, peer: any, revoke: boolean) => {
        for(;;) {
          const affected: any = await invoke('messages.deleteHistory', {
            peer, max_id: 0, ...(revoke ? {revoke: true} : {})
          });
          console.log('  [deleteHistory] pts =', affected.pts, 'pts_count =', affected.pts_count, 'offset =', affected.offset);
          if(!affected.offset) break;
        }
      };

      // ============ CASE 1: deleted from "another session" of account A ============
      console.log('\n===== CASE 1: delete from another session (same account) =====');

      await dual.A.apiManager.invokeApi('messages.sendMessage' as any, {
        peer: bInputPeer, message: 'tweb-test-dialog-delete case1 #' + Date.now(), random_id: randomLongStr()
      } as any);
      await sleep(2000);

      const before1 = await loadDialogOnA();
      console.log('[case1] dialog before:', summarize(before1.dialog), 'history count =', before1.historyCount);
      expect(dual.A.managers.dialogsStorage.getDialogOnly(bPeerId)).toBeTruthy();

      // raw call = the manager stack does NOT know about it (as if another session did it)
      await deleteHistoryLoop(realInvokeA, bInputPeer, false);

      // the other session's deletion reaches us via getDifference / pushed updates
      updatesA.forceGetDifference();

      const dropped1 = await waitForDrop(20_000);
      const eventFired1 = drops.includes(bPeerId);
      console.log('[case1] dialog dropped from dialogsStorage:', dropped1, '| dialog_drop event fired:', eventFired1);

      expect(dropped1).toBe(true);
      expect(eventFired1).toBe(true);

      // ============ CASE 2: the OTHER SIDE deletes the dialog (revoke) ============
      console.log('\n===== CASE 2: other side deletes with revoke =====');
      drops.length = 0;

      await dual.A.apiManager.invokeApi('messages.sendMessage' as any, {
        peer: bInputPeer, message: 'tweb-test-dialog-delete case2 #' + Date.now(), random_id: randomLongStr()
      } as any);
      await sleep(2000);

      const before2 = await loadDialogOnA();
      console.log('[case2] dialog before:', summarize(before2.dialog), 'history count =', before2.historyCount);
      expect(dual.A.managers.dialogsStorage.getDialogOnly(bPeerId)).toBeTruthy();

      // B finds A's access_hash from its own dialog list
      const bDialogs: any = await dual.B.apiManager.invokeApi('messages.getDialogs' as any, {
        offset_date: 0, offset_id: 0, offset_peer: {_: 'inputPeerEmpty'}, limit: 20, hash: '0'
      } as any);
      const aUserFromB = (bDialogs.users || []).find((u: any) => u.id === aMe.id);
      if(!aUserFromB) throw new Error('B cannot find A in its dialogs');
      const aInputPeerFromB = {_: 'inputPeerUser' as const, user_id: aUserFromB.id, access_hash: aUserFromB.access_hash};

      await deleteHistoryLoop(realInvokeB, aInputPeerFromB, true);

      // first give the live push a chance, then fall back to getDifference
      let dropped2 = await waitForDrop(15_000);
      let via = 'live push';
      if(!dropped2) {
        console.log('[case2] not dropped after live-push window, forcing getDifference');
        updatesA.forceGetDifference();
        dropped2 = await waitForDrop(10_000);
        via = 'getDifference';
      }
      const eventFired2 = drops.includes(bPeerId);
      console.log('[case2] dialog dropped:', dropped2, '(via ' + via + ') | dialog_drop event fired:', eventFired2);

      expect(dropped2).toBe(true);
      expect(eventFired2).toBe(true);
    } finally {
      dual.dispose();
    }
  }, 180_000);
});

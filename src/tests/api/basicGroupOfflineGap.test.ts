import {createTestClient} from './harness';
import {loadSeed} from './dualHarness';
import {SliceEnd} from '@helpers/slicedArray';
import pause from '@helpers/schedulers/pause';
import {randomLong} from '@helpers/random';

// "A basic group shows no new messages" (2026-09-28): the other member posted a message with a link,
// and the same account read the chat and replied from another device. The web client's dialog,
// history top and read cursor stayed on the message before, although the messages were known.
// Both ways they can reach the client are replayed here: live, and missed then fetched by the
// getDifference a reconnect ends with (a dead socket is simulated by dropping every pushed update).
//
// A  — the web client under test: managers, live updates
// A2 — another session of the same account ("the phone"): raw requests only
// B  — the other member of the group: raw requests only
//
// TG_API_SEED_A2 has to be an independent session of account A (a tmp/preview-sessions/*.json
// minted for it), never the one TG_API_SEED points at.

const ENABLED = process.env.TG_API_E2E === '1';
const seedAPath = process.env.TG_API_SEED || './tmp/seed.json';
const seedA2Path = process.env.TG_API_SEED_A2;
const seedBPath = process.env.TG_API_SEED_B || './tmp/seed-b.json';
const describeOrSkip = ENABLED && seedA2Path ? describe : describe.skip;

async function waitFor(check: () => boolean, timeoutMs: number) {
  const started = Date.now();
  while(!check()) {
    if(Date.now() - started > timeoutMs) return false;
    await pause(250);
  }
  return true;
}

describeOrSkip('basic group: messages from the other member and from another session', () => {
  test('the dialog, history top and read cursor follow them, live and after a missed stretch', async() => {
    const testDc = process.env.TG_API_PROD_DC !== '1';
    const A = await createTestClient({seed: loadSeed(seedAPath), accountNumber: 1, testDc});
    const B = await createTestClient({seed: loadSeed(seedBPath), accountNumber: 2, testDc});
    const A2 = await createTestClient({seed: loadSeed(seedA2Path), accountNumber: 3, testDc});
    const clients = {A, B, A2};

    // * a stray AUTH_KEY_DUPLICATED/SESSION_REVOKED would log the seed out on every dc
    for(const [tag, client] of Object.entries(clients)) {
      (client.managers.apiManager as any).logOut = () => console.warn(`  [${tag}] logOut suppressed`);
    }

    let chatId: ChatId;
    try {
      const [[aMe], [bMe]] = await Promise.all([
        A.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}) as Promise<any[]>,
        B.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]}) as Promise<any[]>,
        A2.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]})
      ]);
      if(!bMe.username) throw new Error('B has no username');
      const resolved: any = await A.apiManager.invokeApi('contacts.resolveUsername', {username: bMe.username});
      A.managers.appUsersManager.saveApiUsers(resolved.users);
      console.log('[setup] A =', aMe.id, 'B =', bMe.id);

      const managersA = A.managers;
      managersA.apiUpdatesManager.attach();
      await waitFor(() => !managersA.apiUpdatesManager.updatesState.syncLoading, 15000);

      const applied: string[] = [];
      const realSaveUpdate = managersA.apiUpdatesManager.saveUpdate.bind(managersA.apiUpdatesManager);
      (managersA.apiUpdatesManager as any).saveUpdate = (update: any, options: any) => {
        const id = update.message?.id ?? update.max_id ?? '';
        applied.push(`${update._}${id ? ' ' + id : ''}`);
        return realSaveUpdate(update, options);
      };

      let away = false;
      const dropped: string[] = [];
      const realProcessor = managersA.apiUpdatesManager.processUpdateMessage;
      A.apiManager.setUpdatesProcessor((updates: any) => {
        if(away) {
          dropped.push(updates._ === 'updates' ? updates.updates.map((u: any) => u._).join(',') : updates._);
          return;
        }

        return realProcessor(updates);
      });

      ({chatId} = await managersA.appChatsManager.createChat('tweb-test-offline-gap ' + Date.now(), [bMe.id]));
      const peerId = chatId.toPeerId(true);
      const inputPeer = {_: 'inputPeerChat' as const, chat_id: chatId};
      console.log('[setup] chat', chatId);

      const send = (client: typeof A, message: string) => client.apiManager.invokeApi('messages.sendMessage', {
        peer: inputPeer,
        message,
        random_id: randomLong()
      });

      // * a basic group lives in each account's own message id space, so every client
      // * has to look the id up on its own side
      const getLastId = async(client: typeof A) => {
        const history: any = await client.apiManager.invokeApi('messages.getHistory', {
          peer: inputPeer,
          offset_id: 0,
          offset_date: 0,
          add_offset: 0,
          limit: 1,
          max_id: 0,
          min_id: 0,
          hash: 0
        });
        return history.messages[0].id as number;
      };

      // * the other side may not have the message yet right after sendMessage returns
      const waitForNewId = async(client: typeof A, after: number) => {
        for(let i = 0; i < 40; ++i) {
          const id = await getLastId(client);
          if(id > after) return id;
          await pause(250);
        }

        throw new Error(`no message after ${after}`);
      };

      const getLocal = () => {
        const dialog = managersA.dialogsStorage.getDialogOnly(peerId);
        const historyStorage = managersA.appMessagesManager.getHistoryStorage(peerId);
        const first = historyStorage.history.first;
        return {
          top_message: dialog?.top_message,
          read_inbox_max_id: dialog?.read_inbox_max_id,
          unread_count: dialog?.unread_count,
          maxId: historyStorage.maxId,
          sliceHead: Array.from(first).slice(0, 6),
          sliceBottomEnd: first.isEnd(SliceEnd.Bottom)
        };
      };

      const getServer = async() => {
        const result: any = await A.apiManager.invokeApi('messages.getPeerDialogs', {
          peers: [{_: 'inputDialogPeer', peer: inputPeer}]
        });
        const {top_message, read_inbox_max_id, unread_count} = result.dialogs[0];
        return {top_message, read_inbox_max_id, unread_count};
      };

      // * the chat is open on the web client, its history loaded to the bottom
      const createdId = await getLastId(A2);
      await send(B, 'Как у вас дела?');
      const firstId = await waitForNewId(A2, createdId);
      await waitFor(() => managersA.dialogsStorage.getDialogOnly(peerId)?.top_message === firstId, 15000);
      await managersA.appMessagesManager.getHistory({peerId, offsetId: 0, limit: 20});
      console.log('[before]', getLocal());

      const runScenario = async(name: string, goAway: boolean) => {
        const lastSeenId = managersA.dialogsStorage.getDialogOnly(peerId).top_message;
        applied.length = dropped.length = 0;
        away = goAway;

        await send(B, 'В выходные прям совсем грустно будет https://telegram.org/blog');
        const incomingId = await waitForNewId(A2, lastSeenId);
        await pause(1000);
        await A2.apiManager.invokeApi('messages.readHistory', {peer: inputPeer, max_id: incomingId});
        const outgoingIds: number[] = [];
        for(const text of ['+16 примерно', 'Ну вот так уже последние 3 дня', 'С Нью-Йорком в этот раз не повезло)']) {
          const previousId = outgoingIds[outgoingIds.length - 1] ?? incomingId;
          await send(A2, text);
          outgoingIds.push(await waitForNewId(A2, previousId));
          await pause(500);
        }
        await pause(2000);

        if(goAway) {
          away = false;
          managersA.apiUpdatesManager.forceGetDifference();
          await waitFor(() => !managersA.apiUpdatesManager.updatesState.syncLoading, 15000);
        }

        // * the other member reads the replies once the web client is back
        await B.apiManager.invokeApi('messages.readHistory', {peer: inputPeer, max_id: 0});
        await pause(3000);

        const lastId = outgoingIds[outgoingIds.length - 1];
        const local = getLocal();
        const server = await getServer();
        const incoming = managersA.appMessagesManager.getMessageByPeer(peerId, incomingId);
        console.log(`[${name}] ids`, {lastSeenId, incomingId, outgoingIds});
        console.log(`[${name}] dropped while away`, dropped);
        console.log(`[${name}] applied`, applied);
        console.log(`[${name}] local`, local, 'incoming unread =', !!incoming?.pFlags?.unread);
        console.log(`[${name}] server`, server);

        expect.soft(local.top_message, `${name}: dialog.top_message`).toBe(server.top_message);
        expect.soft(local.maxId, `${name}: historyStorage.maxId`).toBe(lastId);
        expect.soft(local.sliceHead[0], `${name}: history slice head`).toBe(lastId);
        expect.soft(local.read_inbox_max_id, `${name}: read_inbox_max_id`).toBe(server.read_inbox_max_id);
        expect.soft(!!incoming?.pFlags?.unread, `${name}: incoming still unread`).toBe(false);
      };

      await runScenario('live', false);
      await runScenario('missed, then difference', true);
    } finally {
      if(chatId) {
        await A.apiManager.invokeApi('messages.deleteChat', {chat_id: chatId}).catch((err: any) => {
          console.warn('[cleanup] deleteChat failed', err?.type || err);
        });
      }

      for(const client of Object.values(clients)) client.dispose();
    }
  }, 180000);
});

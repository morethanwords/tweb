import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;

const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

describeOrSkip('pinned orders vs folders', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;
  let managers: any;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({
      seed,
      testDc: process.env.TG_API_PROD_DC !== '1'
    });

    // A stray AUTH_KEY_DUPLICATED/SESSION_REVOKED makes apiManager.logOut()
    // kill the authorization behind the seed — never from a test.
    (client.apiManager as any).logOut = () => console.warn('  logOut suppressed');

    managers = client.managers;
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  test('a chat the shipped build archived comes back pinned to the main folder', async() => {
    await managers.appMessagesManager.getTopMessages({limit: 100, folderId: 0});

    const pinned = managers.dialogsStorage.getFolderDialogs(0, false)
    .filter((d: any) => d.pFlags?.pinned);
    console.log('\npinned in folder 0:', pinned.map((d: any) => d.peerId));
    expect(pinned.length).toBeGreaterThan(0);

    const peerId = pinned[0].peerId;

    // reproduce the damage the shipped build persisted: the dialog stamped folder 1,
    // its pin moved into the archive's order, and the load-time prune having dropped
    // it from the main folder's order
    const dialog = managers.dialogsStorage.getDialogOnly(peerId);
    dialog.folder_id = 1;
    const order0 = managers.dialogsStorage.getPinnedOrders(0);
    order0.splice(order0.indexOf(peerId), 1);
    managers.dialogsStorage.getPinnedOrders(1).push(peerId);
    console.log('poisoned:', {
      folder_id: dialog.folder_id,
      order0: [...managers.dialogsStorage.getPinnedOrders(0)],
      order1: [...managers.dialogsStorage.getPinnedOrders(1)]
    });

    // what any next dialogs answer for this peer does
    await managers.appMessagesManager.reloadConversation(peerId);

    const healed = managers.dialogsStorage.getDialogOnly(peerId);
    const result = {
      folder_id: healed.folder_id,
      pinned: !!healed.pFlags?.pinned,
      order0: [...managers.dialogsStorage.getPinnedOrders(0)],
      order1: [...managers.dialogsStorage.getPinnedOrders(1)],
      inFolder0: managers.dialogsStorage.getFolderDialogs(0, false).some((d: any) => d.peerId === peerId),
      inFolder1: managers.dialogsStorage.getFolderDialogs(1, false).some((d: any) => d.peerId === peerId)
    };
    console.log('healed:', result);

    expect(result.folder_id).toEqual(0);
    expect(result.inFolder0).toBe(true);
    expect(result.inFolder1).toBe(false);
    expect(result.order1).not.toContain(peerId);
    expect(result.order0).toContain(peerId);
  }, 120_000);

  test('archiving a pinned chat frees its slot in the main folder', async() => {
    await managers.appMessagesManager.getTopMessages({limit: 100, folderId: 0});

    const pinned = managers.dialogsStorage.getFolderDialogs(0, false)
    .filter((d: any) => d.pFlags?.pinned);
    const peerId = pinned[0].peerId;
    const before = managers.dialogsStorage.getVisiblePinnedCount(0);

    // the update the server sends when the chat is archived from another device
    managers.apiUpdatesManager.processLocalUpdate({
      _: 'updateFolderPeers',
      folder_peers: [{
        _: 'folderPeer',
        peer: managers.appPeersManager.getOutputPeer(peerId),
        folder_id: 1
      }]
    });

    const after = managers.dialogsStorage.getVisiblePinnedCount(0);
    console.log('\nvisible pinned count in folder 0:', {before, after});
    console.log('order0:', [...managers.dialogsStorage.getPinnedOrders(0)]);

    expect(after).toEqual(before - 1);
    expect(managers.dialogsStorage.getPinnedOrders(0)).not.toContain(peerId);
  }, 120_000);
});

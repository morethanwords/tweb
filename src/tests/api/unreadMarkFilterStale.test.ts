import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

// Repro for: a read dialog lingers in an `exclude_read` chat folder after its
// unread-mark is cleared from another client. The filter index (folder.dialogs /
// dialog[indexKey]) is not recomputed by onUpdateDialogUnreadMark, so the list
// keeps showing the dialog until something else re-processes it (e.g. opening it,
// which runs readHistory -> processDialogForFilters).
describeOrSkip('unread_mark filter index staleness', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({seed, testDc: false});
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  test('clearing unread_mark removes the dialog from an exclude_read folder index', () => {
    const m: any = client.managers.appMessagesManager;
    const dialogsStorage: any = client.managers.dialogsStorage;
    const filtersStorage: any = client.managers.filtersStorage;
    const appUsersManager: any = client.managers.appUsersManager;

    const userId = 777000; // Telegram service notifications user id; harmless synthetic peer
    const peerId = userId;

    // make the peer a known contact user so it can match a `contacts` filter category
    appUsersManager.saveApiUsers([{
      _: 'user',
      id: userId,
      access_hash: '0',
      first_name: 'Filter',
      last_name: 'Test',
      pFlags: {contact: true}
    }]);

    // a fully READ dialog (no unread messages, no unread_mark)
    const dialog: any = {
      _: 'dialog',
      peerId,
      peer: {_: 'peerUser', user_id: userId},
      top_message: 10,
      read_inbox_max_id: 10,
      read_outbox_max_id: 10,
      unread_count: 0,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: {_: 'peerNotifySettings'},
      folder_id: 0,
      pFlags: {},
      draft: undefined
    };
    dialogsStorage.dialogs[peerId] = dialog;

    // a chat folder (filter id 2) with exclude_read + contacts category
    filtersStorage.saveDialogFilter({
      _: 'dialogFilter',
      id: 2,
      title: {_: 'textWithEntities', text: 'Unread', entities: []},
      pFlags: {exclude_read: true, contacts: true},
      pinned_peers: [],
      include_peers: [],
      exclude_peers: [],
      pinnedPeerIds: [],
      includePeerIds: [],
      excludePeerIds: []
    } as any, false);

    const indexKey = dialogsStorage.getDialogIndexKeyByFilterId(2);
    const folderKey = peerId; // getDialogKey(dialog) === dialog.peerId (number)
    const snapshot = () => {
      const folder = dialogsStorage.getFolder(2);
      return {
        messages: folder.unreadMessagesCount,
        inPeerIds: folder.unreadPeerIds.has(folderKey),
        peerIdsSize: folder.unreadPeerIds.size
      };
    };

    // sanity: while read, the dialog must NOT be in the exclude_read folder
    dialogsStorage.processDialogForFilters(dialog);
    expect(dialogsStorage.getDialogIndex(dialog, indexKey)).toBeUndefined();
    const baseline = snapshot();
    console.log('[read] folder counters:', baseline);

    // mark as unread (this is how a read chat enters an exclude_read folder).
    // The handler itself must update the filter index (no manual re-process).
    (m as any).onUpdateDialogUnreadMark({
      _: 'updateDialogUnreadMark',
      peer: {_: 'dialogPeer', peer: {_: 'peerUser', user_id: userId}},
      pFlags: {unread: true}
    });
    expect(dialog.pFlags.unread_mark).toBe(true);
    const indexWhenMarked = dialogsStorage.getDialogIndex(dialog, indexKey);
    const marked = snapshot();
    console.log('[mark unread] index in folder:', indexWhenMarked, 'counters:', marked);
    expect(indexWhenMarked).not.toBeUndefined(); // should appear in the folder
    // counter must increment by exactly 1 (no double-count from release + processDialogForFilters)
    expect(marked.messages).toBe(baseline.messages + 1);
    expect(marked.inPeerIds).toBe(true);

    // now clear unread_mark, as if read/unmarked from ANOTHER client
    (m as any).onUpdateDialogUnreadMark({
      _: 'updateDialogUnreadMark',
      peer: {_: 'dialogPeer', peer: {_: 'peerUser', user_id: userId}},
      pFlags: {}
    });
    expect(dialog.pFlags.unread_mark).toBeUndefined();

    const indexAfterClear = dialogsStorage.getDialogIndex(dialog, indexKey);
    const cleared = snapshot();
    console.log('[clear unread] index in folder (should be undefined):', indexAfterClear, 'counters:', cleared);

    // Bug was: index stayed set (stale) -> dialog lingered in the Unread folder.
    expect(indexAfterClear).toBeUndefined();
    // mark -> clear cycle must net to zero (no counter drift)
    expect(cleared.messages).toBe(baseline.messages);
    expect(cleared.inPeerIds).toBe(false);
    expect(cleared.peerIdsSize).toBe(baseline.peerIdsSize);
  });
});

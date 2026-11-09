import {AppMessagesManager} from '@appManagers/appMessagesManager';
import getDialogsPaginationOffsets, {DialogsPaginationOffsets} from '@appManagers/utils/dialogs/getDialogsPaginationOffsets';
import DialogsStorage from '@lib/storages/dialogs';
import {Dialog, Message, MessagesDialogs} from '@layer';
import '@helpers/peerIdPolyfill';

// Regression test: "hundreds of dialogs missing from All Chats" (bugs.telegram.org/c/66799).
//
// The server can return a dialog out of its top message's date order: a channel's direct messages
// chat (monoforum) the account hasn't written to for a year is ordered by the parent channel's
// activity, so it comes on page 2 among dialogs of today. The chat list was paged by the OLDEST date
// seen, with no offset id or peer, so the next page started a year back and every dialog in between
// was never loaded. Now the list is paged like tdesktop does: by the date, id and peer of the top
// message of the LAST dialog of the previous page, in the server's response order.

const DAY = 86400;
const NOW = 1792000000;
const SELF_ID = 1;

type ServerDialog = {
  userId: number,
  topMessage: number,
  // * the date the server orders the dialog by
  orderDate: number,
  // * the date of the dialog's top message
  messageDate: number,
  pinned?: boolean
};

const makeDialog = (d: ServerDialog): Dialog.dialog => ({
  _: 'dialog',
  pFlags: d.pinned ? {pinned: true} : {},
  peer: {_: 'peerUser', user_id: d.userId},
  top_message: d.topMessage,
  read_inbox_max_id: d.topMessage,
  read_outbox_max_id: d.topMessage,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  unread_poll_votes_count: 0,
  notify_settings: {_: 'peerNotifySettings'}
});

const makeMessage = (d: ServerDialog): Message.message => ({
  _: 'message',
  pFlags: {},
  id: d.topMessage,
  peer_id: {_: 'peerUser', user_id: d.userId},
  date: d.messageDate,
  message: ''
} as Message.message);

const makePage = (dialogs: ServerDialog[]) => ({
  dialogs: dialogs.map(makeDialog),
  messages: dialogs.map(makeMessage)
});

// * every dialog is a private chat with its own top message id, so (date, id, peer) is unique
const makeServerDialogs = (total: number, outOfOrderAt: number) => {
  const dialogs: ServerDialog[] = [];
  for(let i = 0; i < total; ++i) {
    const date = NOW - i * 60;
    dialogs.push({userId: 1000 + i, topMessage: 10 + i, orderDate: date, messageDate: date});
  }

  // * the monoforum: ordered among today's dialogs, but its top message is a year old
  const outOfOrder = dialogs[outOfOrderAt];
  outOfOrder.messageDate = NOW - 365 * DAY;
  return dialogs;
};

// * the server returns the dialogs ordered after the offset by their ORDER date, like
// * messages.getDialogs does: the offset message's date is compared with the dialogs' order dates
const serveDialogs = (
  dialogs: ServerDialog[],
  offset: {date: number, id: number, peerId: number},
  limit: number
) => {
  if(!offset.date) {
    return dialogs.slice(0, limit);
  }

  const index = dialogs.findIndex((d) => d.orderDate < offset.date || (
    d.orderDate === offset.date &&
    offset.peerId &&
    (d.topMessage < offset.id || (d.topMessage === offset.id && d.userId < offset.peerId))
  ));
  return index === -1 ? [] : dialogs.slice(index, index + limit);
};

const loadAll = (
  dialogs: ServerDialog[],
  nextOffset: (page: ServerDialog[]) => {date: number, id: number, peerId: number}
) => {
  const loaded = new Set<number>();
  let offset = {date: 0, id: 0, peerId: 0};
  for(let pages = 0; pages < 100; ++pages) {
    const page = serveDialogs(dialogs, offset, 100);
    if(!page.length) {
      break;
    }

    page.forEach((d) => loaded.add(d.userId));
    offset = nextOffset(page);
  }

  return loaded;
};

describe('getDialogsPaginationOffsets', () => {
  test('anchors on the LAST dialog of the page, not on the oldest one', () => {
    const page = [
      {userId: 100, topMessage: 1, orderDate: NOW, messageDate: NOW},
      // * out of order: a year old top message among today's dialogs
      {userId: 200, topMessage: 2, orderDate: NOW - 60, messageDate: NOW - 365 * DAY},
      {userId: 300, topMessage: 3, orderDate: NOW - 120, messageDate: NOW - 120}
    ];
    const {dialogs, messages} = makePage(page);

    expect(getDialogsPaginationOffsets(dialogs, messages)).toEqual<DialogsPaginationOffsets>({
      date: NOW - 120,
      id: 3,
      peerId: (300 as UserId).toPeerId(false)
    });
  });

  test('skips pinned dialogs, folders and dialogs without their top message', () => {
    const page = [
      {userId: 100, topMessage: 1, orderDate: NOW, messageDate: NOW},
      {userId: 200, topMessage: 2, orderDate: NOW - 60, messageDate: NOW - 60},
      {userId: 300, topMessage: 3, orderDate: NOW - 120, messageDate: NOW - 120},
      {userId: 400, topMessage: 4, orderDate: NOW - 180, messageDate: NOW - 180, pinned: true}
    ];
    const {dialogs: pageDialogs, messages} = makePage(page);
    // * the top message of 300 is missing from the response
    messages.splice(2, 1);
    const dialogs: Dialog[] = [...pageDialogs, {_: 'dialogFolder'} as Dialog.dialogFolder];

    expect(getDialogsPaginationOffsets(dialogs, messages)).toEqual<DialogsPaginationOffsets>({
      date: NOW - 60,
      id: 2,
      peerId: (200 as UserId).toPeerId(false)
    });
  });

  test('matches the top message by its peer, not only by its id', () => {
    const {dialogs, messages} = makePage([
      {userId: 100, topMessage: 5, orderDate: NOW, messageDate: NOW}
    ]);
    // * another chat's message with the same id
    messages.unshift(makeMessage({userId: 999, topMessage: 5, orderDate: 0, messageDate: NOW - DAY}));

    expect(getDialogsPaginationOffsets(dialogs, messages).date).toBe(NOW);
  });

  test('returns nothing when no dialog can anchor the next page', () => {
    const {dialogs, messages} = makePage([
      {userId: 100, topMessage: 1, orderDate: NOW, messageDate: NOW, pinned: true}
    ]);

    expect(getDialogsPaginationOffsets(dialogs, messages)).toBeUndefined();
    expect(getDialogsPaginationOffsets([], [])).toBeUndefined();
  });

  test('loads every dialog when one comes out of its date order', () => {
    const TOTAL = 350;
    const dialogs = makeServerDialogs(TOTAL, 150);

    // * the old way: the oldest date of everything seen, without an offset id or peer
    let oldestDate = Infinity;
    const byOldestDate = loadAll(dialogs, (page) => {
      page.forEach((d) => oldestDate = Math.min(oldestDate, d.messageDate));
      return {date: oldestDate, id: 0, peerId: 0};
    });
    expect(byOldestDate.size).toBeLessThan(TOTAL);

    const byLastDialog = loadAll(dialogs, (page) => {
      const {dialogs, messages} = makePage(page);
      const offsets = getDialogsPaginationOffsets(dialogs, messages);
      return {date: offsets.date, id: offsets.id, peerId: +(offsets.peerId as any as number)};
    });
    expect(byLastDialog.size).toBe(TOTAL);
  });
});

describe('chat list pagination in getTopMessages', () => {
  const setup = (options: {
    dialogsOffsetDate: {[folderId: number]: number},
    dialogsPaginationOffsets: {[folderId: number]: DialogsPaginationOffsets},
    response: MessagesDialogs
  }) => {
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      allDialogsLoaded: {},
      dialogs: {},
      dialogsOffsetDate: options.dialogsOffsetDate,
      dialogsPaginationOffsets: options.dialogsPaginationOffsets,
      folders: {},
      pinnedOrders: {0: []},
      appCommunitiesManager: {
        getCommunityDialogsCount: () => 0,
        handlePinnedDialogsOrder: vi.fn(),
        sanitizePinnedDialogsOrder: (order: PeerId[]) => order
      },
      appMessagesManager: {scheduleHandleNewDialogs: vi.fn()},
      appPeersManager: {
        getPeerId: (peer: Dialog.dialog['peer']) => (peer as any).user_id.toPeerId(false),
        isBotforum: () => false,
        peerId: (SELF_ID as UserId).toPeerId(false)
      },
      appStateManager: {pushToState: vi.fn()},
      saveDialog: vi.fn(),
      setDialogsLoaded: vi.fn(),
      getFolderDialogs: (): never[] => []
    });

    // * keep the response out of the dialogs storage: only the request and the offsets matter here
    const filterDialogsForStorage = storage.filterDialogsForStorage.bind(storage);
    vi.spyOn(storage, 'filterDialogsForStorage').mockImplementation((dialogs, onPinnedOrder) => {
      const filtered = filterDialogsForStorage(dialogs, onPinnedOrder);
      filtered.length = 0;
      return filtered;
    });

    const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult(options.response)));
    const manager = new AppMessagesManager();
    const log = Object.assign(vi.fn(), {
      bindPrefix: () => log,
      error: vi.fn(),
      warn: vi.fn()
    });
    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      appCommunitiesManager: {getCommunityDialogsCount: () => 0},
      appDraftsManager: {addMissedDialogs: vi.fn(), getDraftsClock: () => 0},
      appNotificationsManager: {getSettingsClock: () => 0},
      appPeersManager: {
        getInputPeerById: (peerId: PeerId) => peerId ? {_: 'inputPeerUser', user_id: peerId.toUserId()} : {_: 'inputPeerEmpty'}
      },
      dialogsStorage: storage,
      log,
      middleware: {get: () => () => true},
      rootScope: {dispatchEvent: vi.fn()},
      saveApiResult: vi.fn(),
      timeManager: {getServerTimeOffset: () => 0}
    });

    return {storage, manager, invokeApiSingleProcess};
  };

  const response = (page: ServerDialog[]): MessagesDialogs.messagesDialogsSlice => ({
    _: 'messages.dialogsSlice',
    count: 1000,
    chats: [],
    users: [],
    ...makePage(page)
  });

  const page = [
    {userId: 100, topMessage: 1, orderDate: NOW, messageDate: NOW},
    {userId: 200, topMessage: 2, orderDate: NOW - 60, messageDate: NOW - 365 * DAY},
    {userId: 300, topMessage: 3, orderDate: NOW - 120, messageDate: NOW - 120}
  ];

  test('requests the next page from the stored offsets and advances them to the last dialog', async() => {
    const stored: DialogsPaginationOffsets = {date: NOW + 60, id: 9, peerId: (900 as UserId).toPeerId(false)};
    const {storage, manager, invokeApiSingleProcess} = setup({
      dialogsOffsetDate: {0: NOW - 365 * DAY},
      dialogsPaginationOffsets: {0: stored},
      response: response(page)
    });

    await manager.getTopMessages({limit: 20, folderId: 0});

    expect(invokeApiSingleProcess.mock.calls[0][0].params).toMatchObject({
      folder_id: 0,
      offset_date: NOW + 60,
      offset_id: 9,
      offset_peer: {_: 'inputPeerUser', user_id: 900}
    });
    expect(storage.getDialogsPaginationOffsets(0)).toEqual<DialogsPaginationOffsets>({
      date: NOW - 120,
      id: 3,
      peerId: (300 as UserId).toPeerId(false)
    });
  });

  test('starts from the top while no dialog of the folder is loaded, even with stale offsets', async() => {
    const {manager, invokeApiSingleProcess} = setup({
      dialogsOffsetDate: {},
      dialogsPaginationOffsets: {0: {date: NOW - DAY, id: 9, peerId: (900 as UserId).toPeerId(false)}},
      response: response(page)
    });

    await manager.getTopMessages({limit: 20, folderId: 0});

    expect(invokeApiSingleProcess.mock.calls[0][0].params).toMatchObject({
      offset_date: 0,
      offset_id: 0,
      offset_peer: {_: 'inputPeerEmpty'}
    });
  });
});

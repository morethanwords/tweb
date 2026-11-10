import getDialogsPaginationOffsets, {DialogsPaginationOffsets} from '@appManagers/utils/dialogs/getDialogsPaginationOffsets';
import {GLOBAL_FOLDER_ID} from '@lib/storages/dialogs';
import {ONE_DAY as DAY} from '@helpers/date';
import {createDialogsStorage, makeDialog as makeUserDialog} from '@/tests/helpers/dialogsStorage';
import PeersStorage from '@lib/storages/peers';
import {createTopMessagesHarness} from '@/tests/helpers/topMessages';
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

const NOW = 1792000000;

type ServerDialog = {
  userId: number,
  topMessage: number,
  // * the date the server orders the dialog by
  orderDate: number,
  // * the date of the dialog's top message
  messageDate: number,
  pinned?: boolean
};

const makeDialog = (d: ServerDialog): Dialog.dialog => makeUserDialog(d.userId, {
  pFlags: d.pinned ? {pinned: true} : {},
  top_message: d.topMessage,
  read_inbox_max_id: d.topMessage,
  read_outbox_max_id: d.topMessage
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
  offset: DialogsPaginationOffsets,
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
  nextOffset: (page: ServerDialog[]) => DialogsPaginationOffsets
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

// * the second dialog is out of order: a year old top message among today's dialogs
const outOfOrderPage: ServerDialog[] = [
  {userId: 100, topMessage: 1, orderDate: NOW, messageDate: NOW},
  {userId: 200, topMessage: 2, orderDate: NOW - 60, messageDate: NOW - 365 * DAY},
  {userId: 300, topMessage: 3, orderDate: NOW - 120, messageDate: NOW - 120}
];

describe('getDialogsPaginationOffsets', () => {
  test('anchors on the LAST dialog of the page, not on the oldest one', () => {
    const {dialogs, messages} = makePage(outOfOrderPage);

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
  }) => createTopMessagesHarness({
    response: options.response,
    storageFields: {
      dialogsOffsetDate: options.dialogsOffsetDate,
      dialogsPaginationOffsets: options.dialogsPaginationOffsets
    },
    getInputPeerById: (peerId: PeerId) => peerId ? {_: 'inputPeerUser', user_id: peerId.toUserId()} : {_: 'inputPeerEmpty'}
  });

  const response = (page: ServerDialog[]): MessagesDialogs.messagesDialogsSlice => ({
    _: 'messages.dialogsSlice',
    count: 1000,
    chats: [],
    users: [],
    ...makePage(page)
  });

  test('requests the next page from the stored offsets and advances them to the last dialog', async() => {
    const stored: DialogsPaginationOffsets = {date: NOW + 60, id: 9, peerId: (900 as UserId).toPeerId(false)};
    const {storage, manager, invokeApiSingleProcess} = setup({
      dialogsOffsetDate: {0: NOW - 365 * DAY},
      dialogsPaginationOffsets: {0: stored},
      response: response(outOfOrderPage)
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
      response: response(outOfOrderPage)
    });

    await manager.getTopMessages({limit: 20, folderId: 0});

    expect(invokeApiSingleProcess.mock.calls[0][0].params).toMatchObject({
      offset_date: 0,
      offset_id: 0,
      offset_peer: {_: 'inputPeerEmpty'}
    });
  });

  test('resumes the global list after a reload, when only the real folders were restored', async() => {
    const stored: DialogsPaginationOffsets = {date: NOW - 300, id: 7, peerId: (700 as UserId).toPeerId(false)};
    const {manager, invokeApiSingleProcess} = setup({
      dialogsOffsetDate: {0: NOW - 365 * DAY},
      dialogsPaginationOffsets: {[GLOBAL_FOLDER_ID]: stored},
      response: response(outOfOrderPage)
    });

    await manager.getTopMessages({limit: 20, folderId: GLOBAL_FOLDER_ID});

    expect(invokeApiSingleProcess.mock.calls[0][0].params).toMatchObject({
      offset_date: NOW - 300,
      offset_id: 7,
      offset_peer: {_: 'inputPeerUser', user_id: 700}
    });
  });

  test('starts the global list from the top while no real folder is loaded, even with stored offsets', async() => {
    const {manager, invokeApiSingleProcess} = setup({
      dialogsOffsetDate: {},
      dialogsPaginationOffsets: {[GLOBAL_FOLDER_ID]: {date: NOW - 300, id: 7, peerId: (700 as UserId).toPeerId(false)}},
      response: response(outOfOrderPage)
    });

    await manager.getTopMessages({limit: 20, folderId: GLOBAL_FOLDER_ID});

    expect(invokeApiSingleProcess.mock.calls[0][0].params).toMatchObject({
      offset_date: 0,
      offset_id: 0,
      offset_peer: {_: 'inputPeerEmpty'}
    });
  });
});

describe('the peer of the stored offsets', () => {
  const peerA = (900 as UserId).toPeerId(false);
  const peerB = (901 as UserId).toPeerId(false);
  const offsets = (peerId: PeerId): DialogsPaginationOffsets => ({date: NOW, id: 5, peerId});

  const setup = () => {
    const peersStorage = new PeersStorage();
    const storage = createDialogsStorage({peersStorage: {
      requestPeer: peersStorage.requestPeer.bind(peersStorage),
      releasePeer: peersStorage.releasePeer.bind(peersStorage),
      requestPeersForKey: peersStorage.requestPeersForKey.bind(peersStorage)
    }});
    return {peersStorage, storage};
  };

  test('is needed once the offsets are set', () => {
    const {peersStorage, storage} = setup();
    storage.setDialogsPaginationOffsets(0, offsets(peerA));

    expect(peersStorage.isPeerNeeded(peerA)).toBe(true);
  });

  test('is released when new offsets of the folder replace it, unless another key holds it', () => {
    const {peersStorage, storage} = setup();
    storage.setDialogsPaginationOffsets(0, offsets(peerA));
    peersStorage.requestPeer(peerB, 'dialog');
    storage.setDialogsPaginationOffsets(0, offsets(peerB));

    expect(peersStorage.isPeerNeeded(peerA)).toBe(false);
    expect(peersStorage.isPeerNeeded(peerB)).toBe(true);

    peersStorage.requestPeer(peerB, 'topPeer');
    storage.setDialogsPaginationOffsets(0, offsets(peerA));
    expect(peersStorage.isPeerNeeded(peerB)).toBe(true);
  });

  test('is kept per folder', () => {
    const {peersStorage, storage} = setup();
    storage.setDialogsPaginationOffsets(0, offsets(peerA));
    storage.setDialogsPaginationOffsets(GLOBAL_FOLDER_ID, offsets(peerB));
    storage.setDialogsPaginationOffsets(0, offsets(peerB));

    expect(peersStorage.isPeerNeeded(peerA)).toBe(false);
    expect(peersStorage.isPeerNeeded(peerB)).toBe(true);
  });

  test('is released when the offsets are reset', () => {
    const {peersStorage, storage} = setup();
    storage.setDialogsPaginationOffsets(0, offsets(peerA));
    storage.setDialogsPaginationOffsets(GLOBAL_FOLDER_ID, offsets(peerB));
    Object.assign(storage as any, {storage: {clear: () => {}}});
    storage.clear();

    expect(peersStorage.isPeerNeeded(peerA)).toBe(false);
    expect(peersStorage.isPeerNeeded(peerB)).toBe(false);

    storage.setDialogsPaginationOffsets(0, offsets(peerA));
    storage.clear(true);

    expect(peersStorage.isPeerNeeded(peerA)).toBe(false);
  });

  test('is requested when the offsets are restored from the state', async() => {
    const {peersStorage, storage} = setup();
    Object.assign(storage as any, {
      appStateManager: {
        getState: () => Promise.resolve({
          pinnedOrders: {},
          allDialogsLoaded: {},
          dialogsPaginationOffsets: {0: offsets(peerA), [GLOBAL_FOLDER_ID]: offsets(peerB)}
        }),
        pushToState: () => {}
      },
      appStoragesManager: {
        loadStorage: () => Promise.resolve({results: [], storage: {getCache: () => ({})}})
      }
    });

    await (storage as any).after();

    expect(peersStorage.isPeerNeeded(peerA)).toBe(true);
    expect(peersStorage.isPeerNeeded(peerB)).toBe(true);
  });
});

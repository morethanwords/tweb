import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {makeChannelIds} from '@/tests/helpers/channelIds';
import pause from '@helpers/schedulers/pause';
import {logger, LogTypes} from '@lib/logger';
import {Update} from '@layer';
import createDeferredCalls from '@/tests/helpers/deferredCalls';
import {stubModifyMessage} from '@/tests/helpers/modifyMessageStub';

// A read is never undone: an update that reads less than the chat is read already — the echo of an earlier read of
// this tab, overtaken by a later one applied here, or another client's read that comes late — leaves the read cursors
// and the unread count where they are (tdesktop: History::applyInboxReadUpdate, setInboxReadTill takes the max).

const {channelId, peerId, idsManager, mid} = makeChannelIds();

function setup({isBroadcast = true}: {isBroadcast?: boolean} = {}) {
  const manager = new AppMessagesManager();
  const {calls, invokeApi} = createDeferredCalls();
  const histories: {[key: string]: any} = {};
  const dialog = {
    _: 'dialog',
    peerId,
    top_message: mid(70),
    read_inbox_max_id: mid(40),
    read_outbox_max_id: mid(40),
    unread_count: 30,
    unread_mentions_count: 0,
    pFlags: {}
  } as any;

  Object.assign(manager as any, {
    log: logger('MESSAGES', LogTypes.None),
    threadsToReplies: {},
    apiManager: {invokeApi},
    apiUpdatesManager: {processLocalUpdate: (update: Update) => (manager as any).onUpdateReadHistory(update)},
    appMessagesIdsManager: idsManager,
    appPeersManager: {
      isChannel: () => true,
      isMonoforum: () => false,
      isBotforum: () => false,
      isBroadcast: () => isBroadcast,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeer', peerId}),
      getOutputPeer: (peerId: PeerId) => ({_: 'peerChannel', channel_id: peerId.toChatId()}),
      getPeerString: (peerId: PeerId) => '' + peerId
    },
    appChatsManager: {
      isForum: () => false,
      isMonoforum: () => false,
      getChannelInput: (chatId: ChatId) => ({_: 'inputChannel', channel_id: chatId})
    },
    dialogsStorage: {
      getForumTopic: (): undefined => undefined,
      prepareDialogUnreadCountModifying: () => () => {},
      processDialogForFilters: () => {},
      setDialogToState: () => {}
    },
    rootScope: {dispatchEvent: vi.fn()}
  });
  vi.spyOn(manager, 'getDialogOnly').mockImplementation((_peerId) => _peerId === peerId ? dialog : undefined);
  const storage = new Map<number, any>();
  vi.spyOn(manager, 'getHistoryMessagesStorage').mockReturnValue(storage as any);
  stubModifyMessage(manager);
  vi.spyOn(manager, 'getHistoryStorage').mockImplementation((peerId, threadId) => histories[`${peerId}_${threadId}`] ??= {});
  vi.spyOn(manager, 'getReadMaxIdIfUnread').mockImplementation(() => dialog.read_inbox_max_id < dialog.top_message ? dialog.read_inbox_max_id : 0);
  vi.spyOn(manager, 'getMessageByPeer').mockReturnValue(undefined);
  vi.spyOn(manager, 'reloadConversation').mockResolvedValue(undefined);

  const historyStorage = () => histories[`${peerId}_undefined`];
  return {manager, calls, dialog, historyStorage, storage};
}

const readInbox = (maxId: number, stillUnreadCount: number | undefined): Update.updateReadChannelInbox => ({
  _: 'updateReadChannelInbox',
  channel_id: channelId,
  max_id: maxId,
  still_unread_count: stillUnreadCount,
  pts: 1
});

describe('a read update that reads less than the chat is read', () => {
  test('takes the unread flag off what it reads and leaves the counters', () => {
    const {manager, dialog, storage} = setup();
    (manager as any).onUpdateReadHistory(readInbox(70, 0));
    // * one the cursor passed while it was not loaded here, loaded since with its flag
    const message = {_: 'message', mid: mid(45), peerId, pFlags: {unread: true}};
    storage.set(message.mid, message);

    (manager as any).onUpdateReadHistory(readInbox(50, undefined));
    expect(message.pFlags.unread).toBeUndefined();
    expect(dialog.unread_count).toBe(0);
    expect(dialog.read_inbox_max_id).toBe(mid(70));
  });

  test('leaves the inbox cursor and the unread count', () => {
    const {manager, dialog, historyStorage} = setup();
    (manager as any).onUpdateReadHistory(readInbox(70, 0));
    expect(dialog.read_inbox_max_id).toBe(mid(70));
    expect(dialog.unread_count).toBe(0);

    (manager as any).onUpdateReadHistory(readInbox(50, 20));
    expect(dialog.read_inbox_max_id).toBe(mid(70));
    expect(historyStorage().readMaxId).toBe(mid(70));
    expect(dialog.unread_count).toBe(0);
  });

  test('leaves the outbox cursor, and still marks the messages it reads as read', () => {
    const {manager, dialog, historyStorage, storage} = setup();
    const readOutbox = (maxId: number): Update.updateReadChannelOutbox => ({_: 'updateReadChannelOutbox', channel_id: channelId, max_id: maxId});
    (manager as any).onUpdateReadHistory(readOutbox(70));
    // * one of ours that the cursor passed while it was not loaded here, loaded since with its flag
    const message = {_: 'message', mid: mid(45), peerId, pFlags: {out: true, unread: true}};
    storage.set(message.mid, message);

    (manager as any).onUpdateReadHistory(readOutbox(50));
    expect(dialog.read_outbox_max_id).toBe(mid(70));
    expect(historyStorage().readOutboxMaxId).toBe(mid(70));
    expect(message.pFlags.unread).toBeUndefined();
  });

  test('of a group that is no forum, whose cursors a read of a thread moves too, is applied as before', () => {
    const {manager, dialog, historyStorage} = setup({isBroadcast: false});
    dialog.read_inbox_max_id = mid(70);
    dialog.read_outbox_max_id = mid(70);

    (manager as any).onUpdateReadHistory(readInbox(50, 20));
    expect(dialog.read_inbox_max_id).toBe(mid(50));
    expect(dialog.unread_count).toBe(20);

    (manager as any).onUpdateReadHistory({_: 'updateReadChannelOutbox', channel_id: channelId, max_id: 50});
    expect(historyStorage().readOutboxMaxId).toBe(mid(50));
  });

  test('the echo of a read overtaken by a later one does not keep the later one from the server', async() => {
    const {manager, calls, dialog} = setup();

    void manager.readHistory({peerId, maxId: mid(50)});
    // * read on while the first is on its way: applied here, sent once the first is answered
    void manager.readHistory({peerId, maxId: mid(70)});
    expect(calls.map(({params}) => params.max_id)).toEqual([50]);
    expect(dialog.unread_count).toBe(0);

    // * the server tells of the first read before it answers it
    (manager as any).onUpdateReadHistory(readInbox(50, 20));
    expect(dialog.read_inbox_max_id).toBe(mid(70));
    expect(dialog.unread_count).toBe(0);

    calls[0].deferred.resolve(true);
    await pause(0);
    expect(calls.map(({params}) => params.max_id)).toEqual([50, 70]);
  });
});

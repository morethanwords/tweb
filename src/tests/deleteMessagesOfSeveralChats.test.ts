import '@helpers/peerIdPolyfill';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {Message} from '@layer';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';

// A server id of a private chat or a basic group names one message account-wide, so one `updateDeleteMessages` can
// name messages of several chats: clearing the call log (`messages.deletePhoneCallHistory`) deletes the calls of every
// chat at once. Each chat has to lose its own messages, not all of them looked for in one chat.

const alicePeerId = (41 as UserId).toPeerId(false);
const bobPeerId = (42 as UserId).toPeerId(false);
const groupPeerId = (77 as ChatId).toPeerId(true);

function setup() {
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: vi.fn()} as any);

  const manager = new AppMessagesManager();
  const dispatchEvent = vi.fn();
  Object.assign(manager as any, {
    messagesStorageByPeerId: {},
    groupedMessagesStorage: {},
    deletedMessages: new Set(),
    missingMessages: new Set(),
    pendingByRandomId: {},
    appPeersManager: {isChannel: () => false, isForum: () => false, isMonoforum: () => false, isBotforum: () => false},
    appChatsManager: {isForum: () => false, isBotforum: () => false},
    appMessagesIdsManager: new AppMessagesIdsManager(),
    appWidgetsManager: {deleteWidgetStorageByLegacyMids: vi.fn()},
    appTranslationsManager: {resetMessageTranslations: vi.fn()},
    monoforumDialogsStorage: {getDialogByParent: (): undefined => undefined},
    dialogsStorage: {getAnyDialog: (): undefined => undefined},
    rootScope: {dispatchEvent}
  });
  vi.spyOn(manager as any, 'getDialogOnly').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'clearSearchCountersCache').mockImplementation(() => {});
  vi.spyOn(manager as any, 'forgetAnchoredEphemeralsAtMids').mockImplementation(() => {});
  vi.spyOn(manager as any, 'invalidateRichMessage').mockImplementation(() => {});
  vi.spyOn(manager as any, 'fixDialogUnreadMentionsIfNoMessage').mockImplementation(() => {});
  vi.spyOn(manager as any, 'updateMessageRepliesIfNeeded').mockImplementation(() => {});
  vi.spyOn(manager as any, 'updateMessageContextForDeletion').mockImplementation(() => {});

  // * the mids of each chat's history slices
  const histories = new Map<PeerId, number[]>();
  const historyOf = (peerId: PeerId) => {
    if(!histories.has(peerId)) histories.set(peerId, []);
    return histories.get(peerId);
  };
  vi.spyOn(manager, 'getHistoryStorage').mockImplementation((peerId: PeerId) => {
    return {history: {delete: (mid: number) => indexOfAndSplice(historyOf(peerId), mid)}} as any;
  });

  // * a call in the chat, kept the way a loaded message is kept
  const call = (peerId: PeerId, id: number) => {
    const message = {
      _: 'messageService',
      id,
      mid: id,
      peerId,
      pFlags: {out: true},
      date: 0,
      action: {_: 'messageActionPhoneCall', call_id: id, pFlags: {}}
    } as any as Message.messageService;
    manager.setMessageToStorage(manager.getHistoryMessagesStorage(peerId), message);
    historyOf(peerId).push(id);
    return message;
  };

  const deletedIn = () => dispatchedEvents(dispatchEvent, 'history_delete')
  .map(({peerId, msgs}) => [peerId, [...msgs].sort((a: number, b: number) => a - b)]);

  return {manager, call, histories, deletedIn};
}

describe('an updateDeleteMessages that names messages of several chats', () => {
  test('each chat loses its own messages', () => {
    const {manager, call, histories, deletedIn} = setup();
    call(alicePeerId, 5);
    call(bobPeerId, 6);
    call(alicePeerId, 7);
    call(groupPeerId, 8);

    (manager as any).onUpdateDeleteMessages({_: 'updateDeleteMessages', messages: [5, 6, 7, 8], pts: 1, pts_count: 4});

    expect(manager.getMessageByPeer(alicePeerId, 5)).toBeUndefined();
    expect(manager.getMessageByPeer(alicePeerId, 7)).toBeUndefined();
    expect(manager.getMessageByPeer(bobPeerId, 6)).toBeUndefined();
    expect(manager.getMessageByPeer(groupPeerId, 8)).toBeUndefined();
    expect(histories.get(alicePeerId)).toEqual([]);
    expect(histories.get(bobPeerId)).toEqual([]);
    expect(histories.get(groupPeerId)).toEqual([]);
    expect(deletedIn().sort(([a], [b]) => +a - +b)).toEqual([
      [groupPeerId, [8]],
      [alicePeerId, [5, 7]],
      [bobPeerId, [6]]
    ]);
  });

  test('the ids of messages not loaded anywhere still go with the batch, and the widgets are told of it once', () => {
    const {manager, call, deletedIn} = setup();
    call(alicePeerId, 5);
    call(bobPeerId, 6);

    const deleted = (manager as any).onUpdateDeleteMessages({_: 'updateDeleteMessages', messages: [5, 6, 9], pts: 1, pts_count: 3});

    expect([...deleted].sort()).toEqual([5, 6]);
    expect(deletedIn().map(([peerId]) => peerId).sort()).toEqual([alicePeerId, bobPeerId].sort());
    const widgets = (manager as any).appWidgetsManager.deleteWidgetStorageByLegacyMids;
    expect(widgets).toHaveBeenCalledOnce();
    expect(widgets.mock.calls[0][0]).toEqual([5, 6, 9]);
  });
});

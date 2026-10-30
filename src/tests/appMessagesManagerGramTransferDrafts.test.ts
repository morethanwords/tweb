/*
 * The messages manager's side of a Gram transfer's local "sending" message: what the draft looks like, how the
 * served message replaces it (updateMessageID, or by content when that answer was lost), and how it fails or
 * leaves. The manager runs for real; what it reaches outside the pending-message path is stubbed.
 */

import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {TimeManager} from '@lib/mtproto/timeManager';
import {AppMessagesManager, MessagesStorage} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';
import type {Message, MessageAction} from '@layer';

const SELF_ID = 999 as UserId;
const USER_ID = 42 as UserId;
const PEER_ID = USER_ID.toPeerId(false);
const TOP_MESSAGE = 100;
// * one account, two spellings (tdlib's test vector)
const NON_BOUNCEABLE = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
const BOUNCEABLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';

function makeManager() {
  const manager = new AppMessagesManager();
  const storage = Object.assign(new Map(), {
    peerId: PEER_ID,
    type: 'history',
    key: `${PEER_ID}_history`
  }) as MessagesStorage;
  const history = createHistoryStorage(`history_${PEER_ID}` as any);
  history.history.unshift(TOP_MESSAGE);
  const dialog = {_: 'dialog', peerId: PEER_ID, top_message: TOP_MESSAGE, pFlags: {}};
  const dispatchEvent = vi.fn();
  const processLocalUpdate = vi.fn();
  const invalidateSuggestion = vi.fn();
  const getPeerId = (peer: any): PeerId => (+peer.user_id as UserId).toPeerId(false);

  Object.assign(manager as any, {
    tempMids: {},
    historiesStorage: {[PEER_ID]: history},
    appPeersManager: {
      peerId: SELF_ID.toPeerId(false),
      getPeerId,
      getOutputPeer: (peerId: PeerId) => ({_: 'peerUser', user_id: peerId.toUserId()}),
      isChannel: () => false,
      isBroadcast: () => false,
      isAnyChat: () => false,
      isMonoforum: () => false
    },
    appUsersManager: {
      getSelf: () => ({id: SELF_ID}),
      isBot: () => false
    },
    appPromoManager: {invalidateSuggestion},
    appMessagesIdsManager: new AppMessagesIdsManager(),
    timeManager: new TimeManager(),
    rootScope: {myId: SELF_ID, dispatchEvent},
    apiUpdatesManager: {processLocalUpdate},
    dialogsStorage: {getDialogOnly: () => dialog},
    getHistoryMessagesStorage: () => storage,
    getGlobalHistoryMessagesStorage: () => storage,
    getHistoryStorage: () => history,
    // * what the real one does for the fields this path reads
    saveMessage: (message: any, options: {storage: MessagesStorage, isOutgoing?: true}) => {
      message.peerId = getPeerId(message.peer_id);
      message.fromId = message.from_id ? getPeerId(message.from_id) : message.peerId;
      message.mid = message.id;
      message.storageKey = options.storage.key;
      if(options.isOutgoing) message.pFlags.is_outgoing = true;
      options.storage.set(message.mid, message);
      return message;
    },
    setMessageToStorage: (_storage: MessagesStorage, message: any) => storage.set(message.mid, message),
    deleteMessageFromStorage: (_storage: MessagesStorage, mid: number) => storage.delete(mid),
    setDialogTopMessage: vi.fn(),
    updateMessageContextForInserting: vi.fn(),
    updateMessageContextForDeletion: vi.fn(),
    updateMessageContext: vi.fn(),
    handleReleasingMessage: vi.fn()
  });

  const events = (name: string) => dispatchEvent.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);
  return {manager: manager as any, storage, history, events, processLocalUpdate, invalidateSuggestion};
}

function served(id: number, action: Partial<MessageAction.messageActionGramTransfer> = {}): Message.messageService {
  return {
    _: 'messageService',
    pFlags: {out: true},
    id,
    mid: id,
    peerId: PEER_ID,
    from_id: {_: 'peerUser', user_id: SELF_ID},
    peer_id: {_: 'peerUser', user_id: USER_ID},
    date: 0,
    action: {
      _: 'messageActionGramTransfer',
      pFlags: {},
      amount: '-1500000000',
      peer_address: BOUNCEABLE,
      transaction_id: '1:hash',
      ...action
    }
  };
}

/** what onUpdateNewMessage does with a served message before it reaches the pending check */
function receive(context: ReturnType<typeof makeManager>, message: Message.messageService) {
  context.storage.set(message.mid, message);
  return context.manager.checkPendingMessage(message);
}

function createDraft(context: ReturnType<typeof makeManager>, randomId: string, options: Partial<{comment: string, commentEncrypted: boolean}> = {}) {
  const tempId: number = context.manager.createGramTransferDraft({
    peerId: PEER_ID,
    randomId,
    amount: '1500000000',
    address: NON_BOUNCEABLE,
    ...options
  });
  return {tempId, message: context.storage.get(tempId) as Message.messageService};
}

describe('Gram transfer drafts in the messages manager', () => {
  it('puts a sending service message into the recipient\'s chat', () => {
    const context = makeManager();
    const {tempId, message} = createDraft(context, '111', {comment: 'secret', commentEncrypted: true});

    expect(tempId).toBeGreaterThan(TOP_MESSAGE);
    expect(Number.isInteger(tempId)).toBe(false);
    expect(message).toMatchObject({
      _: 'messageService',
      pending: true,
      random_id: '111',
      pFlags: {out: true, is_outgoing: true},
      action: {
        _: 'messageActionGramTransfer',
        amount: '1500000000',
        peer_address: NON_BOUNCEABLE,
        transaction_id: '',
        comment: 'secret',
        pFlags: {comment_encrypted: true}
      }
    });
    expect(message.error).toBeUndefined();
    expect(context.events('history_append')).toEqual([{storageKey: context.storage.key, message}]);
    expect(context.manager.pendingTopMsgs[PEER_ID]).toBe(tempId);
  });

  it('is replaced by the served message updateMessageID names', () => {
    const context = makeManager();
    const {tempId} = createDraft(context, '111');
    context.manager.onUpdateMessageId({_: 'updateMessageID', id: 101, random_id: '111'});
    receive(context, served(101));

    expect(context.events('message_sent')).toMatchObject([{tempId, mid: 101}]);
    expect(context.storage.has(tempId)).toBe(false);
    expect(context.manager.gramTransferDrafts.size).toBe(0);
  });

  it('is replaced by content when no updateMessageID came, but only by a message newer than the chat held', () => {
    const context = makeManager();
    const {tempId} = createDraft(context, '111');
    receive(context, served(TOP_MESSAGE));
    expect(context.events('message_sent')).toEqual([]);

    receive(context, served(102, {amount: '-1500000001'}));
    expect(context.events('message_sent')).toEqual([]);

    receive(context, served(103));
    expect(context.events('message_sent')).toMatchObject([{tempId, mid: 103}]);
    expect(context.manager.gramTransferDrafts.size).toBe(0);
  });

  it('fails with the reason, and is no longer taken by content', () => {
    const context = makeManager();
    const {tempId, message} = createDraft(context, '111');
    expect(context.manager.failGramTransferDraft('111', 'WALLET_TRANSFER_EXPIRED')).toBe(true);

    expect(message.error?.type).toBe('WALLET_TRANSFER_EXPIRED');
    expect(context.events('message_error')).toMatchObject([{tempId, peerId: PEER_ID}]);
    expect(context.manager.failGramTransferDraft('111', 'WALLET_TRANSFER_EXPIRED')).toBe(false);

    receive(context, served(101));
    expect(context.events('message_sent')).toEqual([]);
  });

  it('leaves the chat when it is dropped', () => {
    const context = makeManager();
    const {tempId} = createDraft(context, '111');
    expect(context.manager.dropGramTransferDraft('111')).toBe(true);

    expect(context.processLocalUpdate).toHaveBeenCalledWith(expect.objectContaining({_: 'updateDeleteMessages', messages: [tempId]}));
    expect(context.storage.has(tempId)).toBe(false);
    expect(context.manager.pendingByRandomId['111']).toBeUndefined();
  });

  it('goes when updateMessageID names a message the chat already has', () => {
    const context = makeManager();
    const {tempId} = createDraft(context, '111');
    context.storage.set(101, served(101));
    context.manager.onUpdateMessageId({_: 'updateMessageID', id: 101, random_id: '111'});

    expect(context.storage.has(tempId)).toBe(false);
    expect(context.manager.pendingByMessageId[101]).toBeUndefined();
  });
});

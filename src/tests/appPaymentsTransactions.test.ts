import {describe, expect, it, vi} from 'vitest';
import AppPaymentsManager from '@appManagers/appPaymentsManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {AppPeersManager} from '@appManagers/appPeersManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {MessageMedia, PaymentsStarsStatus, StarsTransaction, StarsTransactionPeer} from '@layer';
import '@helpers/peerIdPolyfill';

const SELF = (1 as UserId).toPeerId(false);
const CHANNEL = (20 as ChatId).toPeerId(true);
const BUYER = (3 as UserId).toPeerId(false);

function transaction(overrides: Partial<StarsTransaction> = {}): StarsTransaction {
  return {
    _: 'starsTransaction',
    pFlags: {},
    id: 'transaction',
    amount: {_: 'starsAmount', amount: '-1', nanos: 0},
    date: 1700000000,
    peer: {_: 'starsTransactionPeer', peer: {_: 'peerChannel', channel_id: CHANNEL.toChatId()}},
    ...overrides
  };
}

function harness(history: StarsTransaction[]) {
  const status: PaymentsStarsStatus = {
    _: 'payments.starsStatus',
    balance: {_: 'starsAmount', amount: '1', nanos: 0},
    history,
    chats: [],
    users: []
  };
  const saveApiPeers = vi.fn();
  const getPeerId = vi.fn((peer) => {
    if(!peer) throw new Error('A special transaction peer is not a Telegram peer');
    return peer._ === 'peerChannel' ? peer.channel_id.toPeerId(true) : peer.user_id.toPeerId(false);
  });
  const wrapGift = vi.fn((gift) => ({raw: gift, sticker: {...gift.sticker, id: 'cached-sticker'}}));
  const saveMessageMedia = vi.fn((message: {media?: MessageMedia}) => {
    if(message.media._ === 'messageMediaEmpty') delete message.media;
  });
  const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult(status)));
  const ids = new AppMessagesIdsManager();
  const manager = new AppPaymentsManager();
  Object.assign(manager, {
    rootScope: {myId: SELF},
    apiManager: {invokeApiSingleProcess},
    appPeersManager: {
      saveApiPeers,
      getPeerId,
      getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerSelf', peerId}),
      isChannel: (peerId: PeerId) => peerId === CHANNEL
    },
    appMessagesIdsManager: ids,
    appMessagesManager: {saveMessageMedia},
    appGiftsManager: {wrapGift}
  });
  return {manager, status, saveApiPeers, getPeerId, wrapGift, saveMessageMedia, invokeApiSingleProcess, ids};
}

describe('Stars and Gram transaction normalization', () => {
  it('accepts every special transaction peer without treating it as a Telegram peer', async() => {
    const types: StarsTransactionPeer['_'][] = [
      'starsTransactionPeerAppStore',
      'starsTransactionPeerPlayMarket',
      'starsTransactionPeerFragment',
      'starsTransactionPeerPremiumBot',
      'starsTransactionPeerAds',
      'starsTransactionPeerAPI',
      'starsTransactionPeerUnsupported'
    ];
    const transactions = types.map((type) => transaction({peer: {_: type} as StarsTransactionPeer}));
    const h = harness(transactions);
    expect(await h.manager.getStarsTransactions()).toBe(h.status);
    expect(h.getPeerId).not.toHaveBeenCalled();
    expect(h.saveApiPeers).toHaveBeenCalledWith(h.status);
  });

  it('removes unsupported media from history and caches the surviving media and gift', async() => {
    const photo = {_: 'messageMediaPhoto', pFlags: {}} as MessageMedia;
    const entry = transaction({
      msg_id: 10,
      giveaway_post_id: 12,
      extended_media: [{_: 'messageMediaEmpty'}, photo, {_: 'messageMediaEmpty'}],
      stargift: {_: 'starGift', id: 'gift'} as StarsTransaction['stargift']
    });
    const h = harness([entry]);
    await h.manager.getStarsTransactions();
    expect(entry.extended_media).toEqual([photo]);
    expect(entry.msg_id).toBe(h.ids.generateMessageId(10, CHANNEL.toChatId()));
    expect(entry.giveaway_post_id).toBe(h.ids.generateMessageId(12, CHANNEL.toChatId()));
    expect(h.wrapGift).toHaveBeenCalledWith(entry.stargift);
    expect((entry.stargift as {sticker: {id: string}}).sticker.id).toBe('cached-sticker');
    expect(h.saveMessageMedia).toHaveBeenCalledWith(
      {media: photo}, 'media', {type: 'starsTransaction', peerId: CHANNEL, mid: entry.msg_id}
    );
  });

  it('normalizes incoming channel media against the ledger owner and preserves the buyer', async() => {
    const peer: StarsTransactionPeer = {_: 'starsTransactionPeer', peer: {_: 'peerUser', user_id: BUYER.toUserId()}};
    const entry = transaction({
      peer,
      amount: {_: 'starsAmount', amount: '1', nanos: 0},
      msg_id: 10,
      extended_media: [{_: 'messageMediaPhoto', pFlags: {}}]
    });
    const h = harness([entry]);
    await h.manager.getPeerStarsStatus(CHANNEL, true);
    expect(h.invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'payments.getStarsStatus',
      params: {peer: {_: 'inputPeerSelf', peerId: CHANNEL}, ton: true}
    }));
    expect(entry.peer).toBe(peer);
    expect(entry.msg_id).toBe(h.ids.generateMessageId(10, CHANNEL.toChatId()));
    expect(h.saveMessageMedia).toHaveBeenCalledWith(
      expect.anything(), 'media', {type: 'starsTransaction', peerId: CHANNEL, mid: entry.msg_id}
    );
  });

  it('uses the channel owner for an incoming zero-count paid-message entry', async() => {
    const entry = transaction({
      peer: {_: 'starsTransactionPeer', peer: {_: 'peerUser', user_id: BUYER.toUserId()}},
      amount: {_: 'starsAmount', amount: '0', nanos: 1},
      paid_messages: 0,
      msg_id: 10
    });
    const h = harness([entry]);
    await h.manager.getStarsTransactions('', true, false, CHANNEL);
    expect(entry.msg_id).toBe(h.ids.generateMessageId(10, CHANNEL.toChatId()));
  });

  it('loads the correct TON refund under its owner and normalizes the by-ID response', async() => {
    const entry = transaction({
      amount: {_: 'starsTonAmount', amount: '1000000000'},
      pFlags: {refund: true},
      giveaway_post_id: 12
    });
    const h = harness([entry]);
    expect(await h.manager.getStarsTransactionsByID(entry.id, true, true, CHANNEL)).toBe(entry);
    expect(h.invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'payments.getStarsTransactionsByID',
      params: {
        peer: {_: 'inputPeerSelf', peerId: CHANNEL},
        ton: true,
        id: [{_: 'inputStarsTransaction', id: entry.id, pFlags: {refund: true}}]
      }
    }));
    expect(h.saveApiPeers).toHaveBeenCalledWith(h.status);
    expect(entry.giveaway_post_id).toBe(h.ids.generateMessageId(12, CHANNEL.toChatId()));
  });

  it('keeps pagination, direction and currency attached to the selected owner', async() => {
    const h = harness([]);
    await h.manager.getStarsTransactions('next', false, true, CHANNEL);
    expect(h.invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'payments.getStarsTransactions',
      params: {
        peer: {_: 'inputPeerSelf', peerId: CHANNEL},
        offset: 'next', inbound: false, outbound: true, ton: true, limit: 30
      }
    }));
  });
});

/**
 * A cold session knows its own id but has not been sent its own `User` yet, so the user cache is
 * empty. Every read of our own stars ledger used to build its peer out of that cache and threw
 * `Cannot read properties of undefined (reading 'access_hash')` in the worker — opening Settings
 * reads the balance, so it crashed there first.
 */
function coldSessionHarness() {
  const status: PaymentsStarsStatus = {
    _: 'payments.starsStatus',
    balance: {_: 'starsAmount', amount: '1', nanos: 0},
    chats: [],
    users: []
  };
  const rootScope = {myId: SELF};
  const appUsersManager = new AppUsersManager();
  Object.assign(appUsersManager, {rootScope, users: {}, saveApiUsers: vi.fn()});
  const appPeersManager = new AppPeersManager();
  Object.assign(appPeersManager, {rootScope, appUsersManager, appChatsManager: {saveApiChats: vi.fn()}});
  const invokeApiSingleProcess = vi.fn(({processResult}) => Promise.resolve(processResult?.(status) ?? status));
  const manager = new AppPaymentsManager();
  Object.assign(manager, {
    rootScope,
    apiManager: {invokeApiSingleProcess},
    appPeersManager,
    appMessagesIdsManager: new AppMessagesIdsManager()
  });
  const sentPeers = () => invokeApiSingleProcess.mock.calls.map(([options]) => options.params.peer);
  return {manager, appUsersManager, appPeersManager, status, invokeApiSingleProcess, sentPeers};
}

describe('Stars ledger reads on a session that has not been sent its own user yet', () => {
  it('loads the star and TON balances instead of throwing on the empty user cache', async() => {
    const h = coldSessionHarness();

    expect(await h.manager.getStarsStatus(true)).toBe(h.status);
    expect(await h.manager.getStarsStatusTon(true)).toBe(h.status);

    expect(h.sentPeers()).toEqual([{_: 'inputPeerSelf'}, {_: 'inputPeerSelf'}]);
    expect(h.invokeApiSingleProcess.mock.calls[1][0].params.ton).toBe(true);
  });

  it('names us with inputPeerSelf for every read of our own ledger', async() => {
    const h = coldSessionHarness();

    await h.manager.getPeerStarsStatus(SELF);
    await h.manager.getStarsTransactions();
    await h.manager.getStarsTransactionsByID('transaction');
    await h.manager.getStarsSubscriptions();
    await h.manager.changeStarsSubscription('subscription', true);
    await h.manager.fulfillStarsSubscription('subscription');

    expect(h.sentPeers()).toEqual(Array(6).fill({_: 'inputPeerSelf'}));
  });

  it('still addresses another peer\'s ledger explicitly', async() => {
    const h = coldSessionHarness();
    h.appUsersManager.saveApiUsers = vi.fn();
    Object.assign(h.appPeersManager, {
      appChatsManager: {
        saveApiChats: vi.fn(),
        getInputPeer: (chatId: ChatId) => ({_: 'inputPeerChannel', channel_id: chatId, access_hash: 'hash'}),
        isChannel: () => true
      },
      isCommunity: () => false
    });

    await h.manager.getPeerStarsStatus(CHANNEL);
    expect(h.sentPeers()).toEqual([{_: 'inputPeerChannel', channel_id: CHANNEL.toChatId(), access_hash: 'hash'}]);
  });

  it('names us with inputPeerSelf and inputUserSelf while our own user is missing', () => {
    const h = coldSessionHarness();
    const selfUserId = SELF.toUserId();

    expect(h.appPeersManager.getInputPeerById(SELF)).toEqual({_: 'inputPeerSelf'});
    expect(h.appUsersManager.getUserInput(selfUserId)).toEqual({_: 'inputUserSelf'});

    // * once the server has sent it, the explicit peer comes back - some methods reject inputPeerSelf
    Object.assign(h.appUsersManager.getUsers(), {
      [selfUserId]: {_: 'user', id: selfUserId, access_hash: 'hash', pFlags: {self: true}}
    });
    expect(h.appPeersManager.getInputPeerById(SELF)).toEqual({
      _: 'inputPeerUser',
      user_id: selfUserId,
      access_hash: 'hash'
    });
  });

  it('does not invent an access_hash for a user it has never seen', () => {
    const h = coldSessionHarness();
    // * a missing non-self user is a real bug at the call site, so it must not turn into a
    // * silently malformed inputPeerUser
    expect(() => h.appPeersManager.getInputPeerById(BUYER)).toThrow();
  });
});

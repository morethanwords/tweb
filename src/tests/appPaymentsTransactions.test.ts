import {describe, expect, it, vi} from 'vitest';
import AppPaymentsManager from '@appManagers/appPaymentsManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
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

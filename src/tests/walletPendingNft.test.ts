/*
 * A collectible on its way leaves the wallet window's grid the moment the transfer is accepted, and stays out of it
 * while the server still lists it. When the transfer's transaction turns out to have failed on the chain, the
 * collectible is still the wallet's: it is back in the grid. Nothing here talks to a server.
 */

import {createRoot} from 'solid-js';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {WalletNftItem, WalletTransaction} from '@layer';

const fake = vi.hoisted(() => {
  const nft = {_: 'walletNftItem', address: 'EQ-nft', name: 'Cat #1'} as any;
  const wallet = {
    getStatus: async() => ({presence: 'ready', date: Date.now(), state: {_: 'walletState', address: 'EQ-wallet', balance: '5000000000'}}),
    getCachedStatus: async(): Promise<any> => undefined,
    getRates: async(): Promise<any> => undefined,
    getHistoryCache: async(): Promise<any> => undefined,
    getTransactions: async() => ({transactions: [] as any[], next_offset: ''}),
    getNfts: async() => ({items: [nft], next_offset: ''}),
    getPendingTransfers: async(): Promise<any[]> => [],
    addPendingTransfer: async() => {},
    updatePendingTransfer: async() => {},
    removePendingTransfer: async() => {},
    getTransactionsByMsgHash: async(): Promise<{transactions: any[]}> => ({transactions: []})
  };

  const session = {
    getDeviceMode: async() => 'full',
    getParkedState: async() => ({wallets: [] as any[]}),
    friendlyAddress: async(address: string) => address,
    resolvePendingSend: async(): Promise<any> => undefined
  };

  return {nft: nft as WalletNftItem, wallet, session};
});

vi.mock('@lib/rootScope', () => ({default: {
  managers: {appWalletManager: fake.wallet},
  addEventListener: () => {},
  removeEventListener: () => {}
}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getAppConfig: () => ({})}}));
vi.mock('@lib/wallet/walletSession', () => ({default: {get: () => fake.session}}));
vi.mock('@lib/wallet/stream', () => ({
  default: class {
    public start() {}
    public stop() {}
  },
  normalizeWalletHash: (hash: string) => hash
}));
vi.mock('@components/wallet/fiat', () => ({readWalletCurrency: () => 'USD', writeWalletCurrency: () => {}}));
vi.mock('@components/wallet/sendAnimation', () => ({waitWalletSendSettled: async() => {}}));

import {createWalletStore, WalletStore} from '@components/wallet/store';

/** the transaction the transfer's message made: `failed` when the chain refused it */
function transaction(failed: boolean): WalletTransaction {
  return {
    _: 'walletTransaction',
    pFlags: failed ? {failed: true} : {},
    id: 'tx-1',
    amount: '-50000000',
    fee: '1000',
    date: Math.floor(Date.now() / 1000),
    tx_hash: 'hash-1',
    peer: {_: 'inputPeerEmpty'},
    nft: fake.nft
  } as any as WalletTransaction;
}

let dispose: () => void;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.useRealTimers();
});

/** the window open with one collectible, which was just sent: accepted, out of the grid, "Sending" in the history */
async function sendCollectible() {
  let store: WalletStore;
  dispose = createRoot((dispose) => {
    store = createWalletStore();
    return dispose;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(store.nfts.items().map((item) => item.address)).toEqual(['EQ-nft']);

  store.nfts.remove(fake.nft.address);
  store.pending.add({id: 'send-1', nanograms: '50000000', address: 'EQ-recipient', date: Date.now(), msgHash: 'msg-1', nft: fake.nft});
  expect(store.nfts.items()).toEqual([]);
  return store;
}

describe('a collectible sent from the wallet window', () => {
  it('comes back to the grid when its transfer failed on the chain', async() => {
    fake.wallet.getTransactionsByMsgHash = async() => ({transactions: [transaction(true)]});
    const store = await sendCollectible();

    await vi.advanceTimersByTimeAsync(1000);
    expect(store.pending.list()).toEqual([]);
    expect(store.nfts.items().map((item) => item.address)).toEqual(['EQ-nft']);
  });

  it('stays out of the grid when it left', async() => {
    fake.wallet.getTransactionsByMsgHash = async() => ({transactions: [transaction(false)]});
    const store = await sendCollectible();

    await vi.advanceTimersByTimeAsync(1000);
    expect(store.pending.list()).toEqual([]);
    expect(store.nfts.items()).toEqual([]);
  });
});

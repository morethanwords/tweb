/*
 * The wallet window's history, page by page: a fresh first page that shares nothing with the list shown (a window
 * that started from the cache of an older one) replaces the list, and a page asked for the old list meanwhile is
 * dropped — its cursor would make the next page skip everything between the two. Nothing here talks to a server.
 */

import {createRoot} from 'solid-js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {WalletTransaction} from '@layer';

const fake = vi.hoisted(() => {
  type Page = {transactions: any[], next_offset: string};
  const pages: Array<{offset: string, resolve: (page: Page) => void}> = [];
  const wallet = {
    getStatus: async() => ({presence: 'ready', date: Date.now(), state: {_: 'walletState', address: 'EQ-wallet', balance: '5000000000'}}),
    getCachedStatus: async(): Promise<any> => undefined,
    getRates: async(): Promise<any> => undefined,
    getHistoryCache: async(): Promise<any> => undefined,
    getTransactions: (offset: string) => new Promise<Page>((resolve) => pages.push({offset, resolve})),
    getNfts: async() => ({items: [] as any[], next_offset: ''}),
    getPendingTransfers: async(): Promise<any[]> => [],
    getTransactionsByMsgHash: async() => ({transactions: [] as any[]})
  };

  const session = {
    getDeviceMode: async() => 'full',
    getParkedState: async() => ({wallets: [] as any[]}),
    friendlyAddress: async(address: string) => address,
    resolvePendingSend: async(): Promise<any> => undefined
  };

  return {pages, wallet, session};
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

const settle = () => new Promise((resolve) => setTimeout(resolve));

function transaction(id: string, date: number): WalletTransaction {
  return {
    _: 'walletTransaction',
    pFlags: {},
    id,
    amount: '-1000000000',
    fee: '1000',
    date,
    tx_hash: 'hash-' + id,
    peer: {_: 'inputPeerEmpty'}
  } as any as WalletTransaction;
}

const page = (ids: string[], date: number, next: string) => ({
  transactions: ids.map((id, index) => transaction(id, date - index)),
  next_offset: next
});

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  fake.pages.length = 0;
});

describe('the wallet window\'s history', () => {
  it('drops a page asked for a list that a fresh first page replaced since', async() => {
    // * the last window kept a first page that is long out of date
    fake.wallet.getHistoryCache = async() => ({
      history: {items: page(['old1', 'old2'], 1000, '').transactions, nextOffset: 'old-next', ended: false}
    });

    let store: WalletStore;
    dispose = createRoot((dispose) => {
      store = createWalletStore();
      return dispose;
    });
    await settle();

    // * the cache shows at once and its first page is asked again; the user scrolls on meanwhile
    expect(fake.pages.map((request) => request.offset)).toEqual(['']);
    store.history.loadMore();
    expect(fake.pages.map((request) => request.offset)).toEqual(['', 'old-next']);

    // * more came than a page holds: nothing of the fresh first page is known, it replaces the list
    fake.pages[0].resolve(page(['new1', 'new2'], 2000, 'new-next'));
    await settle();
    expect(store.history.transactions().map((transaction) => transaction.id)).toEqual(['new1', 'new2']);

    // * the old list's next page comes late: it belongs to no list shown now
    fake.pages[1].resolve(page(['old3', 'old4'], 900, 'old-next-2'));
    await settle();
    expect(store.history.transactions().map((transaction) => transaction.id)).toEqual(['new1', 'new2']);
    expect(store.history.loading()).toBe(false);

    // * and the next page goes on from the fresh one
    store.history.loadMore();
    expect(fake.pages[2].offset).toBe('new-next');
  });
});

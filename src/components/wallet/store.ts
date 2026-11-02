/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, batch, createMemo, createSignal, onCleanup} from 'solid-js';
import type {WalletNftItem, WalletTransaction} from '@layer';
import type {WalletRates, WalletSentTransfer, WalletStatus} from '@appManagers/appWalletManager';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import apiManagerProxy from '@lib/apiManagerProxy';
import WalletSession, {WalletDeviceMode, WalletParkedState} from '@lib/wallet/walletSession';
import WalletStream, {normalizeWalletHash, WalletStreamEvent} from '@lib/wallet/stream';
import {isWalletPendingExpired, mergeWalletPending, WalletHistoryCache, WalletPendingTransfer} from '@lib/wallet/historyCache';
import {absNanos, compareNanos} from '@components/wallet/format';
import {readWalletCurrency, writeWalletCurrency} from '@components/wallet/fiat';
import {waitWalletSendSettled} from '@components/wallet/sendAnimation';
import {getGramTransferFailure, getUnknownTransferVerdict} from '@lib/wallet/transferMessages';
import {getAppWindow} from '@helpers/appWindow';
import noop from '@helpers/noop';

/**
 * Everything the wallet window shows, alive while the window is open. It starts from what the last window left (the
 * manager keeps it, across a reload too) and polls only while the page is visible: the server pushes balance changes
 * too, polling covers what a push can miss.
 */

export type {WalletPendingTransfer};

export type WalletHistoryItem =
  | {key: string, transaction: WalletTransaction, pending?: undefined}
  | {key: string, pending: WalletPendingTransfer, transaction?: undefined};

/** a transfer in read off the provider's stream: shown until the server lists it, or its trace is rolled back */
type WalletStreamRow = {hash: string, traceId: string, transaction: WalletTransaction, date: number};

export type WalletConfig = {
  minNanos: string,
  gaslessMinNanos: string,
  gaslessDaily: number,
  explorerUrl: string,
  usdPerGram: number
};

const POLL_INTERVAL = 5e3;
const HISTORY_REFRESH_INTERVAL = 30e3;
const HISTORY_PAGE = 50;
/** a page of nothing but hidden dust is skipped, but not forever */
const MAX_HIDDEN_PAGES = 20;
/** a transfer read off the stream that the server never lists goes after this */
const STREAM_ROW_LIFETIME = 120e3;
/** how often the chain is asked about a transfer whose outcome is unknown */
const JOURNAL_CHECK_INTERVAL = 15e3;
/** after a failed page of collectibles, the next try waits this long: a scroll asks for one on every frame */
const NFTS_RETRY_DELAY = 3e3;
/** a collectible's transfer reaches the server's list of the wallet's collectibles a moment after its history */
const NFTS_REFRESH_DELAY = 2e3;

/** the fiat currency the user picked for the wallet (fiat.ts: a chat's lines read it without the store) */
export {readWalletCurrency as readCurrency};

export function createWalletStore() {
  const session = WalletSession.get();
  // * the window's account session: the window closes with it
  const managers = bindManagersToSession(rootScope.managers);

  const [status, setStatus] = createSignal<WalletStatus>({presence: 'unknown', date: 0});
  const [deviceMode, setDeviceMode] = createSignal<WalletDeviceMode>('unknown');
  const [parked, setParked] = createSignal<WalletParkedState>({wallets: []});
  const [rates, setRates] = createSignal<WalletRates>();
  const [currency, _setCurrency] = createSignal(readWalletCurrency());
  const [config, setConfig] = createSignal<WalletConfig>({
    minNanos: '100000000',
    gaslessMinNanos: '100000000',
    gaslessDaily: 5,
    explorerUrl: 'https://tonviewer.com',
    usdPerGram: 0
  });
  const [friendlyAddress, setFriendlyAddress] = createSignal<string>();
  const [transactions, setTransactions] = createSignal<WalletTransaction[]>([]);
  const [pending, setPending] = createSignal<WalletPendingTransfer[]>([]);
  const [historyLoading, setHistoryLoading] = createSignal(false);
  const [historyEnded, setHistoryEnded] = createSignal(false);
  const [historyError, setHistoryError] = createSignal<string>();
  const [historyLoaded, setHistoryLoaded] = createSignal(false);
  // * transfers in read off the provider's stream (lib/wallet/stream.ts), until the server lists them: by their hash
  const [streamRows, setStreamRows] = createSignal<WalletStreamRow[]>([]);

  let offset = '';
  let historyDate = 0;
  let disposed = false;
  let historyAddress: string;
  // * one per wallet: a list answer asked for an earlier wallet is dropped, it would merge into this one's
  let walletEpoch = 0;
  // * one per history list: a page asked for a list that a fresh first page replaced since is dropped, its cursor
  // * would skip what lies between the two
  let historyRevision = 0;

  const setCurrency = (code: string) => {
    _setCurrency(code);
    writeWalletCurrency(code);
  };

  const fiatPerGram = createMemo(() => {
    const value = rates()?.rates[currency()];
    return value || 0;
  });

  const isHidden = (transaction: WalletTransaction) => {
    if(transaction.pFlags.key_change || transaction.nft) {
      return false;
    }

    return compareNanos(absNanos(transaction.amount), config().minNanos) < 0;
  };

  const visibleTransactions = createMemo(() => transactions().filter((transaction) => !isHidden(transaction)));
  const hiddenCount = createMemo(() => transactions().length - visibleTransactions().length);
  const listedHashes = () => new Set(transactions().map((transaction) => normalizeWalletHash(transaction.tx_hash)));
  // * the history's rows and, among them by date, what the stream brought that the server does not list yet
  const shownTransactions = createMemo(() => {
    const list = visibleTransactions(), rows = streamRows();
    if(!rows.length) return list;
    const listed = listedHashes();
    const extra = rows.filter((row) => !listed.has(row.hash) && !isHidden(row.transaction)).map((row) => row.transaction);
    return extra.length ? [...extra, ...list].sort((a, b) => b.date - a.date) : list;
  });

  // * the row wrappers are kept between recomputations: <For> re-mounts a row whose object changed, and a
  // * re-mounted "Sending" row would drop its flight
  let wrappers = new Map<string, WalletHistoryItem>();
  const pendingById = createMemo(() => new Map(pending().map((transfer) => [transfer.id, transfer])));
  const items: Accessor<WalletHistoryItem[]> = createMemo(() => {
    const next = new Map<string, WalletHistoryItem>();
    const wrap = (item: WalletHistoryItem) => {
      const cached = wrappers.get(item.key);
      const same = cached && cached.transaction === item.transaction && cached.pending === item.pending;
      const value = same ? cached : item;
      next.set(item.key, value);
      return value;
    };

    // * a "Sending" row keeps its wrapper while its transfer changes (a late receipt, a failure): the row reads the
    // * transfer through it, and the send animation playing in the row goes on
    const out: WalletHistoryItem[] = pending().map((transfer) => {
      const key = 'pending_' + transfer.id;
      const cached = wrappers.get(key);
      const value: WalletHistoryItem = cached?.pending ? cached : {key, get pending() {
        return pendingById().get(transfer.id) || transfer;
      }};
      next.set(key, value);
      return value;
    });
    for(const transaction of shownTransactions()) {
      out.push(wrap({key: transaction.id, transaction}));
    }

    wrappers = next;
    return out;
  });

  // MARK: Status

  const applyStatus = async(value: WalletStatus) => {
    // * an answer that is no status (a window torn down mid-request) changes nothing
    if(!value?.presence) return;
    const previous = status();
    setStatus(value);
    const state = value.state;
    if(!state) {
      setDeviceMode('unknown');
      return;
    }

    if(historyAddress && historyAddress !== state.address) {
      // * another wallet now: nothing of the old history applies (its "Sending" rows neither), and a load still
      // * running for it is let go
      ++walletEpoch;
      batch(() => {
        setTransactions([]);
        setPending([]);
        setHistoryEnded(false);
        setHistoryLoaded(false);
        setHistoryLoading(false);
        setHistoryError(undefined);
        setNfts([]);
        setNftsEnded(false);
        setNftsLoading(false);
        setNftsError(false);
        setNftsHidden(new Set<string>());
        setStreamRows([]);
      });
      offset = '';
      nftsOffset = '';
      removedPending.clear();
    }

    historyAddress = state.address;
    startStream(state.address);
    session.getDeviceMode(value).then(setDeviceMode, () => setDeviceMode('unknown'));
    // * the chain is asked what the old wallets hold when the window opens and when the wallet changes
    refreshParked(previous.state?.address !== state.address).catch(() => {});
    session.friendlyAddress(state.address).then(setFriendlyAddress, () => setFriendlyAddress(state.address));

    // * the lists start from what the last window left of them: nothing is asked before that is read
    if(!listsRestore) {
      listsRestore = restoreLists(state.address);
      return;
    } else if(!listsRestored) {
      return;
    }

    const loaded = historyLoaded();
    loadLists();
    if(loaded && previous.state && previous.state.balance !== state.balance) {
      refreshHead();
    }
  };

  // * the first pages when the window opens, and a failed page again on the poll after it
  const loadLists = () => {
    if((!nftItems().length || nftsError()) && !nftsEnded()) {
      loadMoreNfts();
    }

    if(!historyLoaded()) {
      loadMore();
    }
  };

  // MARK: Cache

  let listsRestore: Promise<void>, listsRestored = false;
  /**
   * What the manager kept of the wallet's lists and "Sending" rows (lib/wallet/historyCache.ts) shows at once; then
   * the server is asked, as for a window that starts empty
   */
  const restoreLists = async(address: string) => {
    const epoch = walletEpoch;
    const cache = await managers.appWalletManager.getHistoryCache(address).catch((): WalletHistoryCache => undefined);
    listsRestored = true;
    if(disposed) return;
    if(!cache || epoch !== walletEpoch) {
      loadLists();
      return;
    }

    const history = cache.history && !historyLoaded() && cache.history;
    const nfts = cache.nfts && !nftItems().length && cache.nfts;
    batch(() => {
      if(history) {
        mergeTransactions(history.items, true);
        offset = history.nextOffset;
        setHistoryEnded(history.ended);
        setHistoryLoaded(true);
      }

      if(nfts) applyNftsPage(nfts.items, nfts.nextOffset, '');
      adoptPending(cache.pending);
    });

    loadLists();
    // * what the cache showed is asked again at once
    if(history) refreshHead();
    if(nfts) loadNfts(true);
    // * its first page held nothing but hidden dust: the history goes on to where something shows
    if(history && !historyEnded() && !visibleTransactions().length) loadMore();
    if(pending().length) checkPending();
  };

  const refreshStatus = (force?: boolean) => {
    return managers.appWalletManager.getStatus(force).then((value) => {
      if(!disposed) applyStatus(value);
      return value;
    });
  };

  const refreshDeviceMode = () => {
    return session.getDeviceMode(status()).then((mode) => {
      setDeviceMode(mode);
      return mode;
    });
  };

  /**
   * Keys of other wallets this device still holds (tdesktop's conflict), with what those wallets hold
   */
  function refreshParked(refresh?: boolean) {
    return session.getParkedState(status(), refresh).then((value) => {
      if(!disposed) setParked(value);
      return value;
    });
  }

  // MARK: History

  // * what a row shows: a transaction that did not change keeps its object, so its row is not rebuilt
  const sameTransaction = (a: WalletTransaction, b: WalletTransaction) => {
    return a.amount === b.amount &&
      a.fee === b.fee &&
      a.date === b.date &&
      a.tx_hash === b.tx_hash &&
      a.comment === b.comment &&
      !!a.pFlags.failed === !!b.pFlags.failed &&
      !!a.pFlags.gasless === !!b.pFlags.gasless &&
      a.peer._ === b.peer._;
  };

  // * the fresh copy wins: a transaction seen first as preliminary gets its hash, fee and status later
  const mergeTransactions = (incoming: WalletTransaction[], _append?: boolean) => {
    const current = transactions();
    const byId = new Map<string, WalletTransaction>(current.map((transaction) => [transaction.id, transaction]));
    let changed = false, nftMoved = false;
    for(const transaction of incoming) {
      const existing = byId.get(transaction.id);
      if(existing && sameTransaction(existing, transaction)) continue;
      byId.set(transaction.id, transaction);
      changed = true;
      nftMoved ||= !existing && !!transaction.nft;
    }

    // * a collectible came or went while the window is open: the grid asks the server again (iOS)
    if(nftMoved && !_append && historyLoaded()) scheduleNftsRefresh();
    if(!changed) return;
    setHistory([...byId.values()].sort((a, b) => b.date - a.date));
  };

  const setHistory = (list: WalletTransaction[]) => {
    batch(() => {
      setTransactions(list);
      // * what the stream brought is the server's copy now
      if(streamRows().length) {
        const listed = new Set(list.map((transaction) => normalizeWalletHash(transaction.tx_hash)));
        setStreamRows((rows) => {
          const kept = rows.filter((row) => !listed.has(row.hash));
          return kept.length === rows.length ? rows : kept;
        });
      }
    });
  };

  async function loadMore() {
    if(historyLoading() || historyEnded() || status().presence !== 'ready') {
      return;
    }

    const epoch = walletEpoch, revision = historyRevision;
    const current = () => !disposed && epoch === walletEpoch && revision === historyRevision;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      let hiddenPages = 0;
      for(;;) {
        const result = await managers.appWalletManager.getTransactions(offset, HISTORY_PAGE);
        if(!current()) return;
        historyDate = Date.now();
        mergeTransactions(result.transactions, true);
        const next = result.next_offset;
        const ended = !next || next === offset || !result.transactions.length;
        offset = next || offset;
        if(ended) {
          setHistoryEnded(true);
          break;
        }

        const anyVisible = result.transactions.some((transaction) => !isHidden(transaction));
        if(anyVisible || ++hiddenPages >= MAX_HIDDEN_PAGES) {
          break;
        }
      }
    } catch(err) {
      if(current()) setHistoryError((err as ApiError).type || 'ERROR');
    } finally {
      if(epoch === walletEpoch) {
        setHistoryLoaded(true);
        setHistoryLoading(false);
      }
    }
  }

  async function refreshHead() {
    if(status().presence !== 'ready') {
      return;
    }

    const epoch = walletEpoch;
    try {
      const result = await managers.appWalletManager.getTransactions('', HISTORY_PAGE);
      if(disposed || epoch !== walletEpoch) return;
      historyDate = Date.now();
      // * nothing of the first page is known: more came meanwhile than a page holds (a window that started from the
      // * cache of an older one), and the list starts over from it rather than keep a gap (Android TransactionsList)
      const known = new Set(transactions().map((transaction) => transaction.id));
      if(known.size && result.transactions.length && !result.transactions.some((transaction) => known.has(transaction.id))) {
        ++historyRevision;
        offset = result.next_offset || '';
        batch(() => {
          setHistory(result.transactions.slice().sort((a, b) => b.date - a.date));
          setHistoryEnded(!result.next_offset);
          setHistoryLoaded(true);
        });
        return;
      }

      mergeTransactions(result.transactions, false);
      if(!historyLoaded()) {
        offset = result.next_offset || '';
        setHistoryEnded(!result.next_offset);
        setHistoryLoaded(true);
      }
    } catch(err) {}
  }

  // MARK: Collectibles

  // * what the server lists, page by page
  const [nftItems, setNfts] = createSignal<WalletNftItem[]>([]);
  const [nftsLoading, setNftsLoading] = createSignal(false);
  const [nftsEnded, setNftsEnded] = createSignal(false);
  const [nftsError, setNftsError] = createSignal(false);
  // * sent collectibles: hidden until the server stops listing them (iOS `suppressedCollectibleAddresses`)
  const [nftsHidden, setNftsHidden] = createSignal<ReadonlySet<string>>(new Set());
  const nfts = createMemo(() => {
    const hidden = nftsHidden();
    return hidden.size ? nftItems().filter((item) => !hidden.has(item.address)) : nftItems();
  });
  let nftsOffset = '';
  // * one per list: a refresh lets go of a page still on its way for the list it replaces
  let nftsEpoch = 0;
  let nftsFailedAt = 0;
  let nftsRefreshTimer: number;
  // * `<wallet>:<list>` of the refresh under way
  let nftsRefreshing: string;

  // * an item that did not change keeps its object, so its tile is not rebuilt
  const sameNft = (a: WalletNftItem, b: WalletNftItem) => {
    const url = (item: WalletNftItem, key: 'image' | 'image_small' | 'lottie') => item[key]?.url;
    return a.name === b.name &&
      a.description === b.description &&
      a.collection_address === b.collection_address &&
      a.extra?.data === b.extra?.data &&
      url(a, 'image') === url(b, 'image') &&
      url(a, 'image_small') === url(b, 'image_small') &&
      url(a, 'lottie') === url(b, 'lottie') &&
      a.attributes?.length === b.attributes?.length;
  };

  const applyNftsPage = (items: WalletNftItem[], next: string, from: string) => {
    const known = new Map(nftItems().map((item) => [item.address, item]));
    const page = new Map<string, WalletNftItem>();
    for(const item of items) {
      const old = known.get(item.address);
      page.set(item.address, old && sameNft(old, item) ? old : item);
    }

    const list = from ?
      [...nftItems(), ...[...page.values()].filter((item) => !known.has(item.address))] :
      [...page.values()];
    const ended = !next || next === from || !items.length;
    nftsOffset = next || from;
    batch(() => {
      setNfts(list);
      setNftsEnded(ended);
      setNftsError(false);
      // * the whole list is known: a hidden collectible the server no longer lists has left for good
      if(ended && nftsHidden().size) {
        const listed = new Set(list.map((item) => item.address));
        setNftsHidden((hidden) => new Set([...hidden].filter((address) => listed.has(address))));
      }
    });
  };

  /**
   * A page of the list, from where the last one ended or (`refresh`) from the start: a refresh replaces the
   * list with its first page, as iOS does, so a collectible that came or went shows; it runs quietly, and a
   * page asked for meanwhile waits for it. A failed load keeps the list and is tried again later — on scroll,
   * on the next poll — not more often than every few seconds.
   */
  async function loadNfts(refresh?: boolean) {
    if(status().presence !== 'ready') return;
    const refreshing = nftsRefreshing === `${walletEpoch}:${nftsEpoch}`;
    if(!refresh && (refreshing || nftsLoading() || nftsEnded() || (nftsError() && Date.now() - nftsFailedAt < NFTS_RETRY_DELAY))) return;
    const epoch = walletEpoch, listEpoch = refresh ? ++nftsEpoch : nftsEpoch;
    const current = () => !disposed && epoch === walletEpoch && listEpoch === nftsEpoch;
    const from = refresh ? '' : nftsOffset;
    if(refresh) {
      nftsRefreshing = `${epoch}:${listEpoch}`;
      // * a page on its way for the old list is let go
      setNftsLoading(false);
    } else {
      setNftsLoading(true);
    }

    try {
      const result = await managers.appWalletManager.getNfts(from);
      if(!current()) return;
      applyNftsPage(result.items, result.next_offset, from);
    } catch(err) {
      // * a refresh that failed leaves the list as it was
      if(!current() || refresh) return;
      nftsFailedAt = Date.now();
      setNftsError(true);
    } finally {
      if(current()) {
        if(refresh) nftsRefreshing = undefined;
        else setNftsLoading(false);
      }
    }
  }

  const loadMoreNfts = () => loadNfts();

  // * a burst of history updates is one refresh; the server's list follows the chain a moment later
  const scheduleNftsRefresh = () => {
    clearTimeout(nftsRefreshTimer);
    nftsRefreshTimer = window.setTimeout(() => !disposed && loadNfts(true), NFTS_REFRESH_DELAY);
  };

  const hideNft = (address: string, hidden: boolean) => {
    setNftsHidden((set) => {
      if(set.has(address) === hidden) return set;
      const next = new Set(set);
      if(hidden) next.add(address);
      else next.delete(address);
      return next;
    });
  };

  // MARK: Pending transfers

  // * every change of a row goes to the manager too, which keeps the rows past this window — a send from a chat
  // * closes it at once — and past a reload; the calls still go after the window closed
  const addPending = (transfer: WalletPendingTransfer) => {
    setPending((list) => [transfer, ...list]);
    managers.appWalletManager.addPendingTransfer(historyAddress, transfer).catch(noop);
    // * the receipt may already have come with the transaction in it
    setTimeout(() => checkPending(), sentTransactions.has(transfer.msgHash) ? 0 : 1000);
  };

  const updatePending = (id: string, patch: Partial<Omit<WalletPendingTransfer, 'id'>>) => {
    // * a collectible whose transfer failed is still the wallet's: back in the grid
    const nft = patch.failed && pending().find((transfer) => transfer.id === id)?.nft;
    if(nft) hideNft(nft.address, false);
    setPending((list) => list.map((transfer) => transfer.id === id ? {...transfer, ...patch} : transfer));
    managers.appWalletManager.updatePendingTransfer(historyAddress, id, patch).catch(noop);
  };

  // * the rows this window let go: a copy of the manager's from before that must not bring one back
  const removedPending: Set<string> = new Set();
  const removePending = (id: string) => {
    removedPending.add(id);
    setPending((list) => list.filter((transfer) => transfer.id !== id));
    managers.appWalletManager.removePendingTransfer(historyAddress, id).catch(noop);
  };

  /**
   * The manager's rows into this window's: the ones another window (a tab, an earlier window) added, and what any of
   * them learnt of a row since — its receipt, its failure. A collectible on its way leaves the grid, a failed one
   * comes back.
   */
  const adoptPending = (remote: WalletPendingTransfer[]) => {
    const current = pending();
    const next = mergeWalletPending(current, remote || [], removedPending);
    if(next === current) return;
    const before = new Map(current.map((transfer) => [transfer.id, transfer]));
    batch(() => {
      for(const transfer of next) {
        const previous = before.get(transfer.id);
        if(!transfer.nft) continue;
        if(!previous && !transfer.failed) hideNft(transfer.nft.address, true);
        else if(previous && !previous.failed && transfer.failed) hideNft(transfer.nft.address, false);
      }

      setPending(next);
    });
  };

  const syncPending = async(epoch: number) => {
    const remote = await managers.appWalletManager.getPendingTransfers(historyAddress).catch((): WalletPendingTransfer[] => undefined);
    if(remote && !disposed && epoch === walletEpoch) adoptPending(remote);
  };

  // * the transaction a transfer's receipt was found to have made, by the transfer's id: what it became, exactly
  const settledTransfers: Map<string, string> = new Map();

  /**
   * A sent transfer is shown as "Sending" until the server finds the transaction its message made. The receipt
   * is the external message hash, not the transaction hash, so only the server can match them.
   */
  let checkingPending: Promise<void>;
  const checkPending = (): Promise<void> => {
    // * the poll and a receipt can ask at once: one pass at a time, a second one waits for it and runs again
    const promise = checkingPending = (checkingPending || Promise.resolve()).then(checkPendingOnce).finally(() => {
      if(checkingPending === promise) checkingPending = undefined;
    });
    return promise;
  };

  const checkPendingOnce = async() => {
    const epoch = walletEpoch;
    if(historyAddress) await syncPending(epoch);
    if(disposed || epoch !== walletEpoch) return;
    const now = Date.now();
    // * a row that never got a receipt (or never found its transaction) goes after the send's own window
    pending().filter((transfer) => isWalletPendingExpired(transfer, now)).forEach((transfer) => removePending(transfer.id));
    const transfers = pending().filter((transfer) => transfer.msgHash && !transfer.failed);
    for(const transfer of transfers) {
      try {
        const sent = sentTransactions.get(transfer.msgHash);
        const result = sent ? {transactions: [sent]} : await managers.appWalletManager.getTransactionsByMsgHash([transfer.msgHash]);
        if(disposed || epoch !== walletEpoch) return;
        const found = result.transactions.filter((transaction) => !transaction.pFlags.incoming && !transaction.pFlags.key_change);
        if(found.length) {
          // * the row plays its ending (stars, the gem into the icon) before the transaction takes its place
          sentTransactions.delete(transfer.msgHash);
          settledTransfers.set(transfer.id, found[0].id);
          await waitWalletSendSettled(transfer.id);
          if(disposed || epoch !== walletEpoch) return;
          removePending(transfer.id);
          // * a collectible whose transfer failed on the chain is still the wallet's: back in the grid
          if(transfer.nft && found[0].pFlags.failed) hideNft(transfer.nft.address, false);
          mergeTransactions(found, false);
        }
      } catch(err) {}
    }

    await checkUnknownPending(epoch);
  };

  /**
   * A row with no receipt — its outcome unknown — is settled by the engine's journal, which asks the chain (and
   * frees the engine for the next transfer once it concludes); not on every poll, it costs several requests.
   */
  let journalCheckedAt = 0;
  const checkUnknownPending = async(epoch: number) => {
    const unknown = pending().filter((transfer) => !transfer.msgHash && !transfer.failed);
    if(!unknown.length || Date.now() - journalCheckedAt < JOURNAL_CHECK_INTERVAL) {
      return;
    }

    journalCheckedAt = Date.now();
    const snapshot = await session.resolvePendingSend(status()).catch((): undefined => undefined);
    for(const transfer of unknown) {
      if(disposed || epoch !== walletEpoch) return;
      const verdict = getUnknownTransferVerdict(transfer.id, snapshot, transfer.gasless);
      if(verdict === 'failed') {
        updatePending(transfer.id, {failed: true});
        // * as the desktop client does on a terminal failure: the chat's message says so too, it is not just dropped
        if(transfer.draftRandomId) {
          managers.appMessagesManager.failGramTransferDraft(
            transfer.draftRandomId,
            getGramTransferFailure(snapshot.phase, transfer.gasless)
          );
        }
      } else if(verdict === 'done') {
        // * the history shows what happened instead: the transaction, or nothing that left
        await refreshHead();
        await waitWalletSendSettled(transfer.id);
        if(disposed || epoch !== walletEpoch) return;
        removePending(transfer.id);
      }
    }
  };

  // MARK: Stream

  // * the provider's live stream: what is safe to show of a frame shows at once, the rest makes the window ask the
  // * server the moment it happens; polling stays for when it is down
  let stream: WalletStream, streamAddress: string;
  const streamTimers: number[] = [];
  // * a burst of frames is one refresh; a hidden page is caught up by the poll when it comes back
  let streamRefresh: number;
  const onStreamEvent = (event: WalletStreamEvent) => {
    if(disposed) return;
    applyStreamEvent(event);
    if(getAppWindow().document.visibilityState !== 'visible') return;
    clearTimeout(streamRefresh);
    streamRefresh = window.setTimeout(() => {
      if(disposed) return;
      refreshStatus(true);
      refreshHead();
    }, 300);
    if(event.type === 'transactions') {
      scheduleHistoryRechecks();
    }
  };

  // * a fresh transaction reaches the server's history a moment later
  const scheduleHistoryRechecks = () => {
    [3e3, 10e3].forEach((delay) => streamTimers.push(window.setTimeout(() => !disposed && refreshHead(), delay)));
  };

  /**
   * A finalized balance goes to the manager, which every window and the settings read (Android takes only those, iOS
   * a confirmed one too — that can still be rolled back); plain transfers in from finalized traces show until the
   * server lists them; the trace of a message this wallet sent has its "Sending" row looked up now, not on the next
   * poll — settled by the server's answer, as any row is. What a frame cannot vouch for (its comment, who sent it)
   * comes with the server's copy.
   */
  const applyStreamEvent = (event: WalletStreamEvent) => {
    switch(event.type) {
      case 'state': {
        if(event.finality === 'finalized') managers.appWalletManager.applyStreamBalance(streamAddress, event.balance).catch(noop);
        break;
      }

      case 'transactions': {
        if(event.incoming.length) addStreamRows(event.traceId, event.incoming);
        const trace = normalizeWalletHash(event.traceId);
        if(event.outgoing && pending().some((transfer) => transfer.msgHash && !transfer.failed && normalizeWalletHash(transfer.msgHash) === trace)) {
          checkPending();
        }

        break;
      }

      case 'invalidated': {
        // * rolled back: what it brought was never there
        const trace = normalizeWalletHash(event.traceId);
        setStreamRows((rows) => {
          const kept = rows.filter((row) => normalizeWalletHash(row.traceId) !== trace);
          return kept.length === rows.length ? rows : kept;
        });
        break;
      }
    }
  };

  const addStreamRows = (traceId: string, incoming: WalletTransaction[]) => {
    const listed = listedHashes(), known = new Set(streamRows().map((row) => row.hash));
    const fresh = incoming
    .map((transaction): WalletStreamRow => ({hash: normalizeWalletHash(transaction.tx_hash), traceId, transaction, date: Date.now()}))
    .filter((row) => row.hash && !listed.has(row.hash) && !known.has(row.hash));
    if(fresh.length) setStreamRows((rows) => [...fresh, ...rows]);
  };

  const pruneStreamRows = () => {
    const now = Date.now();
    setStreamRows((rows) => {
      const kept = rows.filter((row) => now - row.date < STREAM_ROW_LIFETIME);
      return kept.length === rows.length ? rows : kept;
    });
  };

  const startStream = (address: string) => {
    if(streamAddress === address) return;
    stream?.stop();
    streamAddress = address;
    stream = new WalletStream(managers, address, onStreamEvent);
    stream.start();
  };

  // MARK: Wiring

  const onStatus = (value: WalletStatus) => {
    if(!disposed) applyStatus(value);
  };

  // * a receipt that already carries the transaction: kept for the pending row it belongs to, which may not
  // * exist yet — the receipt comes with the server's answer, before the send call returns
  const sentTransactions: Map<string, WalletTransaction> = new Map();
  const onTransferSent = (sent: WalletSentTransfer) => {
    if(sent.transaction) sentTransactions.set(sent.msgHash, sent.transaction);
    if(pending().some((transfer) => transfer.msgHash === sent.msgHash)) {
      checkPending();
      return;
    }

    if(sent.own !== false || !listsRestored) return;
    // * another session of the account sent it. A transfer of this window's whose outcome is unknown may be it: the
    // * journal is asked now, and the history tells them apart; otherwise its transaction shows at once (Android, iOS),
    // * or the history is asked for it
    if(pending().some((transfer) => !transfer.msgHash && !transfer.failed)) {
      journalCheckedAt = 0;
      checkPending();
      refreshHead();
    } else if(sent.transaction) {
      sentTransactions.delete(sent.msgHash);
      mergeTransactions([sent.transaction], false);
    } else {
      refreshHead();
      scheduleHistoryRechecks();
    }
  };

  rootScope.addEventListener('wallet_status', onStatus);
  rootScope.addEventListener('wallet_transfer_sent', onTransferSent);

  const tick = () => {
    if(getAppWindow().document.visibilityState !== 'visible') {
      return;
    }

    pruneStreamRows();
    refreshStatus();
    if(Date.now() - historyDate > HISTORY_REFRESH_INTERVAL || pending().length) {
      refreshHead();
    }

    checkPending();
  };

  const interval = window.setInterval(tick, POLL_INTERVAL);

  Promise.resolve(apiManagerProxy.getAppConfig()).then((appConfig) => {
    setConfig({
      minNanos: String(appConfig.wallet_transfer_min_nanos ?? 100000000),
      gaslessMinNanos: String(appConfig.wallet_gasless_min_nanos ?? 100000000),
      gaslessDaily: appConfig.wallet_gasless_daily_transfers ?? 5,
      explorerUrl: appConfig.ton_blockchain_explorer_url || 'https://tonviewer.com',
      usdPerGram: appConfig.ton_usd_rate || 0
    });
  });

  // * no rates, no fiat: the lines that show it stay empty
  managers.appWalletManager.getRates().then(setRates, () => {});
  const cached = managers.appWalletManager.getCachedStatus();
  cached.then((value) => {
    if(value?.presence && value.presence !== 'unknown' && !disposed && status().presence === 'unknown') {
      applyStatus(value);
    }
  });
  refreshStatus(true);

  const dispose = () => {
    disposed = true;
    clearInterval(interval);
    stream?.stop();
    streamTimers.forEach((timer) => clearTimeout(timer));
    clearTimeout(streamRefresh);
    rootScope.removeEventListener('wallet_status', onStatus);
    rootScope.removeEventListener('wallet_transfer_sent', onTransferSent);
  };

  onCleanup(dispose);

  return {
    session,
    managers,
    /** the window is still up: what a closed one asked for (a prompt over it) is not shown after it */
    isOpen: () => !disposed,
    status,
    deviceMode,
    refreshDeviceMode,
    refreshStatus,
    rates,
    currency,
    setCurrency,
    fiatPerGram,
    config,
    friendlyAddress,
    history: {
      items,
      transactions,
      hiddenCount,
      loading: historyLoading,
      loaded: historyLoaded,
      ended: historyEnded,
      error: historyError,
      loadMore,
      refreshHead
    },
    nfts: {
      items: nfts,
      loading: nftsLoading,
      ended: nftsEnded,
      error: nftsError,
      loadMore: loadMoreNfts,
      // * a sent collectible leaves the grid at once: the server lists it until the chain moved it, and a
      // * refresh before that must not bring it back
      remove: (address: string) => hideNft(address, true)
    },
    parked,
    refreshParked,
    pending: {
      list: pending,
      add: addPending,
      update: updatePending,
      remove: removePending,
      /** the id of the transaction a sent transfer turned out to be, once its receipt was matched */
      settledAs: (id: string) => settledTransfers.get(id)
    },
    dispose
  };
}

export type WalletStore = ReturnType<typeof createWalletStore>;

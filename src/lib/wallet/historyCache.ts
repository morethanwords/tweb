/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {User, WalletNftItem, WalletTransaction} from '@layer';
import {canonicalTonAddress, GRAM_TRANSFER_RESOLUTION_TIMEOUT} from '@lib/wallet/transferMessages';

/**
 * What the wallet window showed last, kept for the account by the managers' worker (appWalletManager) and on disk:
 * a window that opens again starts from it and then asks the server, and a transfer still "Sending" outlives the
 * window and a reload of the page (iOS WalletStoredState, tdesktop's submitted transfer store). Everything here is
 * pure: the manager keeps the cache, the window's store reads and feeds it.
 */

export type WalletPendingTransfer = {
  id: string,
  /** positive, what left the wallet */
  nanograms: string,
  userId?: UserId,
  address: string,
  /** what the user typed: kept in memory only, never on disk (a private comment went out encrypted) */
  comment?: string,
  /** unix ms, this device's clock */
  date: number,
  msgHash?: string,
  failed?: boolean,
  /** signed with a fee-free twin: the twin taking its seqno is how it succeeds */
  gasless?: boolean,
  /** the whole balance went: what arrives is it less the fee the chain took, not less the quote */
  sendAll?: boolean,
  /** the chat's "sending" message of a transfer to a Telegram user: the journal's failure fails it too */
  draftRandomId?: string,
  /** a collectible's transfer: the row shows it instead of an amount */
  nft?: WalletNftItem
};

/** the start of a list as the server gave it last: the window goes on from `nextOffset` */
export type WalletListHead<T> = {
  items: T[],
  nextOffset: string,
  ended: boolean
};

export type WalletHistoryCache = {
  /** the wallet it belongs to: another wallet's lists and rows never show */
  address: string,
  /** the first page of the history */
  history?: WalletListHead<WalletTransaction>,
  /** the first page of the collectibles */
  nfts?: WalletListHead<WalletNftItem>,
  /** newest first */
  pending: WalletPendingTransfer[]
};

/** on disk: the cache and the users its rows name, so a page loaded again can draw them before any answer */
export type WalletStoredHistory = {
  version: number,
  address: string,
  history?: WalletListHead<WalletTransaction>,
  nfts?: WalletListHead<WalletNftItem>,
  pending: WalletPendingTransfer[],
  users: User[]
};

const STORED_VERSION = 1;

/**
 * How long a "Sending" row may wait: the engine's validity window plus the margin for the chain (tdesktop's
 * StaleSubmittedRecord, 300 + 60 s), not iOS's 90 s for the UI — a transfer can still go out until the contract
 * refuses it, and a row gone before that would hide money that may yet leave
 */
export const WALLET_PENDING_LIFETIME = GRAM_TRANSFER_RESOLUTION_TIMEOUT;
/** rows kept at most (tdesktop kSubmittedTransferMaxRecords) */
export const WALLET_PENDING_LIMIT = 64;
/** a page of a list kept at most: the window's own pages are 50 transfers and 20 collectibles */
const LIST_LIMIT = 100;

export function createWalletHistory(address: string): WalletHistoryCache {
  return {address, pending: []};
}

export function isSameWalletAddress(a: string, b: string) {
  if(!a || !b) return false;
  if(a === b) return true;
  const canonical = canonicalTonAddress(a);
  return !!canonical && canonical === canonicalTonAddress(b);
}

/** the same page as the server gave it before */
export function isSameWalletList<T>(a: WalletListHead<T>, b: WalletListHead<T>) {
  return !!a && !!b && a.nextOffset === b.nextOffset && a.ended === b.ended && JSON.stringify(a.items) === JSON.stringify(b.items);
}

/**
 * A row past the send's window can no longer turn up and goes; so does one dated that far ahead, which only a clock
 * set back since the send can make
 */
export function isWalletPendingExpired(transfer: Pick<WalletPendingTransfer, 'date'>, now: number) {
  return !(Math.abs(now - transfer.date) <= WALLET_PENDING_LIFETIME);
}

/** drops the rows that expired; true when any did */
export function pruneWalletHistory(cache: WalletHistoryCache, now: number) {
  const pending = cache.pending.filter((transfer) => !isWalletPendingExpired(transfer, now));
  if(pending.length === cache.pending.length) {
    return false;
  }

  cache.pending = pending;
  return true;
}

/**
 * This window's rows and the manager's (other windows feed it) as one list: every row either knows — less the ones
 * this window let go itself — each with what either learnt. A receipt or a failure only ever comes, never goes, so a
 * copy that is behind cannot undo one. The same array when nothing changed.
 */
export function mergeWalletPending(
  local: WalletPendingTransfer[],
  remote: WalletPendingTransfer[],
  removed: ReadonlySet<string>
): WalletPendingTransfer[] {
  const byId = new Map(remote.map((transfer) => [transfer.id, transfer]));
  let changed = false;
  const out = local.map((transfer) => {
    const other = byId.get(transfer.id);
    if(!other) return transfer;
    byId.delete(transfer.id);
    const msgHash = transfer.msgHash || other.msgHash;
    const failed = transfer.failed || other.failed;
    if(msgHash === transfer.msgHash && failed === transfer.failed) return transfer;
    changed = true;
    return {...transfer, msgHash, failed};
  });

  for(const transfer of byId.values()) {
    if(removed.has(transfer.id)) continue;
    out.push(transfer);
    changed = true;
  }

  return changed ? out.sort((a, b) => b.date - a.date) : local;
}

/**
 * Transfers the server has not listed yet put at the head of its first page (another session's, from its receipt):
 * nothing is cut off the end, the next page still starts where the server said
 */
export function mergeWalletHistoryHead(head: WalletListHead<WalletTransaction>, transactions: WalletTransaction[]) {
  const known = new Set(head.items.map((transaction) => transaction.id));
  const fresh = transactions.filter((transaction) => !known.has(transaction.id));
  if(!fresh.length) {
    return head;
  }

  return {...head, items: [...fresh, ...head.items].sort((a, b) => b.date - a.date)};
}

/** the ids of the users the cache's rows name */
export function getWalletHistoryUserIds(cache: WalletHistoryCache) {
  const ids: Set<UserId> = new Set();
  cache.history?.items.forEach((transaction) => {
    if(transaction.peer._ === 'walletTransactionPeerUser') ids.add(transaction.peer.user_id.toUserId());
  });
  cache.pending.forEach((transfer) => transfer.userId && ids.add(transfer.userId));
  return [...ids];
}

// * a list is never cut short: what lay between the cut and the server's next page would be skipped
const fitList = <T>(head: WalletListHead<T>) => head && head.items.length <= LIST_LIMIT ? head : undefined;

/**
 * What is written to disk. No comment of a "Sending" row: one sent private went out encrypted, and its text stays in
 * memory (tdesktop's stored projection keeps no encrypted comment either); the row gets it back from the transfer once
 * the server lists it.
 */
export function toStoredWalletHistory(cache: WalletHistoryCache, users: User[]): WalletStoredHistory {
  return {
    version: STORED_VERSION,
    address: cache.address,
    history: fitList(cache.history),
    nfts: fitList(cache.nfts),
    pending: cache.pending.slice(0, WALLET_PENDING_LIMIT).map(({comment, ...transfer}) => transfer),
    users
  };
}

const isString = (value: any): value is string => typeof(value) === 'string';
const isNanos = (value: any) => (isString(value) && /^\d{1,30}$/.test(value)) || (Number.isSafeInteger(value) && value >= 0);

function isTransaction(value: any): value is WalletTransaction {
  return value?._ === 'walletTransaction' &&
    isString(value.id) &&
    Number.isFinite(value.date) &&
    isString(value.peer?._) &&
    !!value.pFlags && typeof(value.pFlags) === 'object' &&
    (isString(value.amount) || Number.isFinite(value.amount));
}

function isNft(value: any): value is WalletNftItem {
  return value?._ === 'wallet.nftItem' && isString(value.address);
}

function isPending(value: any): value is WalletPendingTransfer {
  return isString(value?.id) &&
    isNanos(value.nanograms) &&
    isString(value.address) &&
    Number.isFinite(value.date) &&
    (value.msgHash === undefined || isString(value.msgHash)) &&
    (value.nft === undefined || isNft(value.nft));
}

function readList<T>(value: any, isItem: (item: any) => item is T): WalletListHead<T> {
  if(!value || !Array.isArray(value.items) || !isString(value.nextOffset)) {
    return;
  }

  return {items: value.items.filter(isItem), nextOffset: value.nextOffset, ended: !!value.ended};
}

/**
 * The cache as written by `toStoredWalletHistory`, or nothing for anything else (another version, a broken entry);
 * the rows that expired meanwhile are left out
 */
export function readStoredWalletHistory(value: any, now: number): {cache: WalletHistoryCache, users: User[]} {
  if(!value || value.version !== STORED_VERSION || !isString(value.address) || !value.address || !Array.isArray(value.pending)) {
    return;
  }

  const cache: WalletHistoryCache = {
    address: value.address,
    history: readList(value.history, isTransaction),
    nfts: readList(value.nfts, isNft),
    pending: value.pending.filter(isPending).slice(0, WALLET_PENDING_LIMIT)
  };
  pruneWalletHistory(cache, now);

  const users = Array.isArray(value.users) ? value.users.filter((user: any) => user?._ === 'user' && user.id) : [];
  return {cache, users};
}

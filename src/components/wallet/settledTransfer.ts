/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt from 'big-integer';
import type {WalletTransaction} from '@layer';
import type {WalletPendingTransfer} from '@lib/wallet/historyCache';
import {absNanos} from '@components/wallet/format';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';

/** a chain's clock and this device's may differ: a settled transfer may be dated a little before it was sent */
const SETTLED_CLOCK_SKEW = 15;

/**
 * The amount is this row's: the very amount it sent, or for the whole balance, one off the quote by no more than
 * the fee the transfer paid (that fee is what took the quote's place)
 */
function isSettledAmount(transaction: WalletTransaction, pending: WalletPendingTransfer) {
  const amount = bigInt(absNanos(transaction.amount)), sent = bigInt(pending.nanograms);
  if(!pending.sendAll) {
    return amount.equals(sent);
  }

  return amount.subtract(sent).abs().lesserOrEquals(bigInt(absNanos(transaction.fee || 0)));
}

/**
 * The transaction a "Sending" row turned into, once the row left. A row whose receipt was matched knows it exactly
 * (`settledId`: the store's match of its message). One settled without a receipt is the one after the send that
 * went the same way to the same address with its amount (`isSettledAmount`) or its collectible — and only when
 * exactly one did: two such transfers to one address stay "Sending" rather than show the other one. A row that
 * failed became nothing: a later transfer of the same kind is another attempt, never its outcome.
 */
export function findSettledTransfer(transactions: WalletTransaction[], pending: WalletPendingTransfer, settledId?: string) {
  if(settledId) {
    return transactions.find((transaction) => transaction.id === settledId);
  }

  if(pending.failed) {
    return;
  }

  const address = canonicalTonAddress(pending.address);
  const since = Math.floor(pending.date / 1000) - SETTLED_CLOCK_SKEW;
  let found: WalletTransaction;
  for(const transaction of transactions) {
    if(transaction.date < since) break;
    const peer = transaction.peer;
    if(
      transaction.pFlags.incoming ||
      transaction.pFlags.key_change ||
      !transaction.nft !== !pending.nft ||
      peer._ === 'walletTransactionPeerUnsupported' ||
      canonicalTonAddress(peer.address) !== address
    ) continue;

    const same = pending.nft ? transaction.nft.address === pending.nft.address : isSettledAmount(transaction, pending);
    if(!same) continue;
    if(found) return;
    found = transaction;
  }

  return found;
}

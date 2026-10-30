/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MessageAction} from '@layer';
import I18n, {LangPackKey} from '@lib/langPack';
import {formatGramsCut} from '@components/wallet/format';

/**
 * The words of a Gram transfer where its card is not: under a sender's name (a chat list row, a notification) and
 * in a reaction to it. The chat's own line is messageActionTextNewUnsafe's.
 */

type GramTransfer = MessageAction.messageActionGramTransfer;

/** iOS: a transfer's amount outside the wallet has at most three decimals, cut, never rounded up */
const DECIMALS = 3;

/** `1.5 Grams`, unsigned: the unit agrees with the number written — 1.0004 reads "1 Gram", as iOS writes it */
export function formatTransferGrams(nanos: string | number) {
  const amount = formatGramsCut(nanos, DECIMALS);
  const ticker = I18n.format('Wallet.Card.Ticker', true, [+amount.replace(/,/g, '')]);
  return I18n.format('Wallet.GramsAmount', true, [amount, ticker]);
}

/** the comment anyone may read, on one line (tdesktop: commentText); an encrypted one says nothing here (Android) */
export function getTransferPublicComment(transfer: GramTransfer) {
  if(transfer.pFlags.comment_encrypted) return;
  return transfer.comment?.replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * The line under the sender's name, without the name and without fiat: "sent you 1.5 Grams" in, "You sent 1.5
 * Grams" out (Android messageTextShort, iOS incomingGramTransferPreview); the service account's names nobody. A
 * notification marks an incoming amount with the gem (iOS) and ends with the comment (Android, tdesktop).
 */
export function wrapGramTransferCompactText(options: {
  transfer: GramTransfer,
  out: boolean,
  /** the service account's transfer */
  anonymous: boolean,
  notification?: boolean
}) {
  const {transfer, out, anonymous, notification} = options;
  const amount = (notification && !out ? '💎' : '') + formatTransferGrams(transfer.amount);
  const key: LangPackKey = out ? 'Wallet.Action.SentUnknown' : (anonymous ? 'Wallet.Action.ReceivedUnknown' : 'Wallet.Action.ReceivedCompact');
  const text = I18n.format(key, true, [amount]);
  const comment = notification && !out && getTransferPublicComment(transfer);
  return comment ? I18n.format('Wallet.Action.WithComment', true, [text, comment]) : text;
}

/** "❤ to your 1.5 Grams transfer: For the coffee" (Android PushReactGramTransfer, iOS REACT_GRAM_TRANSFER) */
export function wrapGramTransferReactionText(reaction: string, transfer: GramTransfer) {
  const amount = formatTransferGrams(transfer.amount);
  const comment = getTransferPublicComment(transfer);
  return comment ?
    I18n.format('Wallet.Notification.ReactedComment', true, [reaction, amount, comment]) :
    I18n.format('Wallet.Notification.Reacted', true, [reaction, amount]);
}

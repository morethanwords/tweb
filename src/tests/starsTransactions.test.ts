import type {StarsTransaction} from '@layer';
import {readFileSync} from 'node:fs';
import '@helpers/peerIdPolyfill';
import {createTransactionFixtures} from '@components/popupSandbox/transactionFixtures';
import {getStarsTransactionPresentation, getStarsTransactionMessagePeerId} from '@appManagers/utils/payments/starsTransaction';

const fixtures = createTransactionFixtures();
const transaction = (id: string) => fixtures.find((entry) => entry.id === id).transaction;
const present = (id: string) => getStarsTransactionPresentation(transaction(id));

describe('Stars and Gram transaction classification', () => {
  test.each([
    ['search', 'search'], ['premium', 'premium'], ['live-message', 'live'], ['live-reaction', 'live'],
    ['messages', 'messages'], ['messages-income', 'messages'], ['api', 'api'],
    ['affiliate-income', 'affiliate'], ['auction', 'auction'], ['auction-refund', 'auction'],
    ['prepaid-upgrade', 'prepaidUpgrade'], ['upgrade', 'upgrade'], ['upgrade-refund', 'upgrade'],
    ['remove-description', 'giftDescription'], ['gift-sent', 'gift'], ['gift-converted', 'gift'],
    ['gift-transfer', 'transfer'], ['gift-transfer-refund', 'transfer'], ['provider-Unsupported', 'unsupported'],
    ['business', 'business'], ['ads-proceeds', 'adsProceeds'], ['giveaway', 'giveaway'],
    ['media', 'media'], ['reaction', 'reaction'], ['subscription', 'subscription'],
    ['subscription-minute', 'subscription'], ['balance-gift-sent', 'starsGift'],
    ['balance-gift-received', 'starsGift'], ['withdrawal', 'withdrawal'], ['withdrawal-refund', 'withdrawal'],
    ['empty-media', 'payment'], ['message-link', 'payment'], ['payment', 'payment']
  ])('%s has the correct operation type', (id, kind) => {
    expect(present(`stars/${id}`).kind).toBe(kind);
  });

  test('refunds reverse the original operation, without reversing the displayed balance change', () => {
    expect(present('stars/gift-refund')).toMatchObject({incoming: true, outgoing: true, titleKey: 'StarsGiftSent', statusKey: 'StarsRefunded'});
    expect(present('stars/gift-conversion-refund')).toMatchObject({incoming: false, outgoing: false, titleKey: 'Stars.Transaction.GiftConverted', statusKey: 'StarsRefunded'});
  });

  test.each(['stars', 'gram'])('distinguishes purchases, sales and refunds in %s', (currency) => {
    for(const [scenario, key] of [
      ['resale-expense', 'Stars.Transaction.GiftPurchase'],
      ['resale-income', 'Stars.Transaction.GiftSale'],
      ['resale-income-refund', 'Stars.Transaction.GiftPurchase'],
      ['resale-expense-refund', 'Stars.Transaction.GiftSale']
    ]) expect(present(`${currency}/${scenario}`).titleKey).toBe(key);
  });

  test.each(['stars', 'gram'])('an offer remains distinguishable from a resale in %s', (currency) => {
    for(const direction of ['income', 'expense']) {
      for(const suffix of ['', '-refund']) {
        expect(present(`${currency}/offer-${direction}${suffix}`).kind).toBe('offer');
      }
    }
  });

  test('live reactions win over ordinary paid message fees', () => {
    expect(present('stars/live-reaction')).toMatchObject({titleKey: 'Stars.Transaction.LiveReaction', titleArgs: [2]});
    expect(present('stars/messages')).toMatchObject({titleKey: 'PaidMessages.FeeForMessages', titleArgs: [3]});
  });

  test('a one-nanostar debit is outgoing, with no floating point sign loss', () => {
    expect(present('stars/negative-nanostar')).toMatchObject({incoming: false, outgoing: true});
  });

  test('a free received collectible is a transfer rather than a sale', () => {
    const entry = {...transaction('stars/gift-transfer'), amount: {_: 'starsAmount', amount: 0, nanos: 0} as const};
    expect(getStarsTransactionPresentation(entry)).toMatchObject({kind: 'transfer', titleKey: 'Stars.Transaction.GiftTransfer'});
  });

  test.each([false, true])('recognizes collectible sale proceeds without the resale flag, refund=%s', (refund) => {
    const entry = {
      ...transaction('stars/gift-transfer'),
      pFlags: refund ? {refund: true} as const : {},
      amount: {_: 'starsAmount', amount: 0, nanos: refund ? -1 : 1} as const
    };
    expect(getStarsTransactionPresentation(entry)).toMatchObject({kind: 'resale', titleKey: 'Stars.Transaction.GiftSale'});
  });

  test.each([false, true])('message links keep the seller peer for media transactions with refund=%s', (refund) => {
    const ownerId = (-100) as PeerId;
    const counterpartyId = 777002 as PeerId;
    const purchase = {...transaction('stars/media'), pFlags: refund ? {refund: true} as const : {}, amount: {_: 'starsAmount', amount: refund ? 10 : -10, nanos: 0} as const};
    const sale = {...purchase, amount: {_: 'starsAmount', amount: refund ? -10 : 10, nanos: 0} as const};
    expect(getStarsTransactionMessagePeerId(purchase, ownerId)).toBe(counterpartyId);
    expect(getStarsTransactionMessagePeerId(sale, ownerId)).toBe(ownerId);
  });

  test('preserves status priority refund, failure, pending', () => {
    const entry = {...transaction('stars/payment'), pFlags: {refund: true, failed: true, pending: true} as const};
    expect(getStarsTransactionPresentation(entry).statusKey).toBe('StarsRefunded');
    entry.pFlags = {failed: true, pending: true} as typeof entry.pFlags;
    expect(getStarsTransactionPresentation(entry).statusKey).toBe('StarsFailed');
    expect(present('stars/pending').statusKey).toBe('StarsPending');
  });

  test('all fixture currencies come from the amount constructor', () => {
    for(const {transaction: entry} of fixtures) {
      expect(getStarsTransactionPresentation(entry).ton).toBe(entry.amount._ === 'starsTonAmount');
    }
  });

  test('every current transaction flag and field has a fixture', () => {
    const schema = readFileSync('src/layer.d.ts', 'utf8').split('export type starsTransaction = {')[1].split('\n  };')[0];
    const fields = [...schema.matchAll(/^    (\w+)\??:/gm)].map((match) => match[1]).filter((field) => field !== 'flags');
    const flags = [...schema.matchAll(/^      (\w+)\?: true/gm)].map((match) => match[1]);
    for(const field of fields) expect(fixtures.some(({transaction: entry}) => field in entry), field).toBe(true);
    for(const flag of flags) expect(fixtures.some(({transaction: entry}) => entry.pFlags[flag as keyof typeof entry.pFlags]), flag).toBe(true);
  });

  test('every peer constructor has a fixture', () => {
    const schema = readFileSync('src/layer.d.ts', 'utf8').split('export type StarsTransactionPeer = ')[1].split(';')[0];
    const constructors = [...schema.matchAll(/StarsTransactionPeer\.(\w+)/g)].map((match) => match[1]);
    expect(constructors).toHaveLength(8);
    for(const type of constructors) expect(fixtures.some(({transaction: entry}) => entry.peer._ === type), type).toBe(true);
  });
});


test('personal paid-message receipts open the sender chat, not Saved Messages', () => {
  const transaction: StarsTransaction = {
    _: 'starsTransaction', id: 'personal-message', date: 1, pFlags: {},
    amount: {_: 'starsAmount', amount: 1, nanos: 0},
    peer: {_: 'starsTransactionPeer', peer: {_: 'peerUser', user_id: 20}},
    paid_messages: 1, msg_id: 10
  };
  expect(getStarsTransactionMessagePeerId(transaction, 10, 10)).toBe(20);
  expect(getStarsTransactionMessagePeerId(transaction, 30, 10)).toBe(30);
});

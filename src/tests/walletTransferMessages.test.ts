/*
 * The chat's local "sending" message of a Gram transfer (tdesktop wallet_transfer_messages.cpp): which served
 * message is a draft's when no updateMessageID claimed it, what updateMessageID does with a draft, and why the
 * engine's final phase fails one. And the words of a transfer outside its card: the chat list's line, a
 * notification, a reaction, and the fiat its service line is worth in.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import type {MessageAction} from '@layer';
import I18n from '@lib/langPack';
import lang from '@/lang';
import {formatTransferGrams, getTransferPublicComment, wrapGramTransferCompactText, wrapGramTransferReactionText} from '@components/wallet/transferText';
import {pickWalletFiatRate} from '@components/wallet/fiat';
import GramTransferDrafts, {
  canonicalTonAddress,
  getGramTransferFailure,
  getUnknownTransferVerdict,
  GramTransferDraft,
  isDefiniteTransferRefusal,
  isSameGramTransfer
} from '@lib/wallet/transferMessages';

// * one account in its three spellings: the friendly pair is tdlib's test vector, the raw form the TON docs' one
const BOUNCEABLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
const NON_BOUNCEABLE = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
const RAW = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8';
// * the same text with a broken checksum (tdlib refuses it too)
const BAD_CHECKSUM = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBJ';
// * another account (the TON docs' pair)
const OTHER = 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA';

const PEER = 10 as PeerId;
const OTHER_PEER = 11 as PeerId;

function served(
  amount: string,
  address: string,
  comment?: string,
  encrypted?: boolean
): MessageAction.messageActionGramTransfer {
  return {
    _: 'messageActionGramTransfer',
    pFlags: encrypted ? {comment_encrypted: true} : {},
    amount,
    peer_address: address,
    transaction_id: '1:hash',
    comment
  };
}

function apiError(code: number, type: string) {
  return {code, type} as ApiError;
}

function draft(randomId: string, options: Partial<GramTransferDraft> = {}): GramTransferDraft {
  return {
    randomId,
    peerId: PEER,
    floor: 100,
    amount: '1500000000',
    address: NON_BOUNCEABLE,
    ...options
  };
}

function adopt(drafts: GramTransferDrafts, mid: number, action: MessageAction, options: Partial<{
  peerId: PeerId,
  out: boolean,
  held: boolean,
  isSending: (draft: GramTransferDraft) => boolean
}> = {}) {
  return drafts.adopt({
    peerId: PEER,
    mid,
    out: true,
    action,
    held: false,
    isSending: () => true,
    ...options
  });
}

describe('canonical TON address', () => {
  it('is the same for every spelling of one account', () => {
    expect(canonicalTonAddress(BOUNCEABLE)).toBe(RAW);
    expect(canonicalTonAddress(NON_BOUNCEABLE)).toBe(RAW);
    expect(canonicalTonAddress(RAW)).toBe(RAW);
    expect(canonicalTonAddress(RAW.toUpperCase())).toBe(RAW);
  });

  it('is empty for what is not an address', () => {
    expect(canonicalTonAddress(BAD_CHECKSUM)).toBe('');
    expect(canonicalTonAddress('wallet.ton')).toBe('');
    expect(canonicalTonAddress('')).toBe('');
    expect(canonicalTonAddress(undefined)).toBe('');
  });
});

describe('same Gram transfer', () => {
  it('matches the served message of an outgoing transfer, whatever sign and address form it uses', () => {
    expect(isSameGramTransfer(draft('a'), served('-1500000000', BOUNCEABLE))).toBe(true);
    expect(isSameGramTransfer(draft('a'), served('1500000000', RAW))).toBe(true);
  });

  it('refuses another amount or another account', () => {
    expect(isSameGramTransfer(draft('a'), served('-1500000001', NON_BOUNCEABLE))).toBe(false);
    expect(isSameGramTransfer(draft('a'), served('-1500000000', OTHER))).toBe(false);
  });

  it('compares a public comment by its text', () => {
    expect(isSameGramTransfer(draft('a', {comment: 'for pizza'}), served('-1500000000', NON_BOUNCEABLE, 'for pizza'))).toBe(true);
    expect(isSameGramTransfer(draft('a', {comment: 'for pizza'}), served('-1500000000', NON_BOUNCEABLE, 'for tea'))).toBe(false);
    expect(isSameGramTransfer(draft('a', {comment: 'for pizza'}), served('-1500000000', NON_BOUNCEABLE))).toBe(false);
    expect(isSameGramTransfer(draft('a'), served('-1500000000', NON_BOUNCEABLE, 'for pizza'))).toBe(false);
  });

  it('matches a private comment by being private only: the served one carries no text', () => {
    const privateDraft = draft('a', {comment: 'secret', commentEncrypted: true});
    expect(isSameGramTransfer(privateDraft, served('-1500000000', NON_BOUNCEABLE, 'te6cckEBAQEA', true))).toBe(true);
    expect(isSameGramTransfer(privateDraft, served('-1500000000', NON_BOUNCEABLE, 'secret'))).toBe(false);
    expect(isSameGramTransfer(draft('a', {comment: 'secret'}), served('-1500000000', NON_BOUNCEABLE, 'te6cckEBAQEA', true))).toBe(false);
  });

  it('never matches through two addresses that both fail to parse', () => {
    expect(isSameGramTransfer(draft('a', {address: 'nonsense'}), served('-1500000000', 'nonsense'))).toBe(false);
  });
});

describe('adopting a served transfer by content', () => {
  it('gives it to the oldest matching draft still sending in that chat', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('other-chat', {peerId: OTHER_PEER}));
    drafts.add(draft('first'));
    drafts.add(draft('second'));
    expect(adopt(drafts, 101, served('-1500000000', BOUNCEABLE))?.randomId).toBe('first');
  });

  it('only takes messages newer than what the chat held when the draft was made', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a', {floor: 100}));
    expect(adopt(drafts, 99, served('-1500000000', BOUNCEABLE))).toBeUndefined();
    expect(adopt(drafts, 100, served('-1500000000', BOUNCEABLE))).toBeUndefined();
    expect(adopt(drafts, 101, served('-1500000000', BOUNCEABLE))?.randomId).toBe('a');
  });

  it('leaves alone a message the chat already held, an incoming one and other service messages', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a'));
    expect(adopt(drafts, 101, served('-1500000000', BOUNCEABLE), {held: true})).toBeUndefined();
    expect(adopt(drafts, 101, served('1500000000', BOUNCEABLE), {out: false})).toBeUndefined();
    expect(adopt(drafts, 101, {_: 'messageActionHistoryClear'})).toBeUndefined();
    expect(drafts.get('a')).toBeDefined();
  });

  it('drops drafts that are no longer sending instead of adopting them', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('deleted'));
    drafts.add(draft('alive'));
    const adopted = adopt(drafts, 101, served('-1500000000', BOUNCEABLE), {isSending: (item) => item.randomId !== 'deleted'});
    expect(adopted?.randomId).toBe('alive');
    expect(drafts.get('deleted')).toBeUndefined();
    expect(drafts.size).toBe(1);
  });
});

describe('pairing by updateMessageID', () => {
  it('pairs as usual when nothing sits at the served id, or the random id is no draft', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a'));
    expect(drafts.getPairing('a', 101, false)).toBe('pair');
    expect(drafts.getPairing('unknown', 101, true)).toBe('pair');
  });

  it('keeps a draft sending when an identical draft settled its served id: its own message is still coming', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a'));
    drafts.add(draft('b'));
    // * b's message came through the difference first and went to the oldest twin, a
    expect(adopt(drafts, 101, served('-1500000000', BOUNCEABLE))?.randomId).toBe('a');
    drafts.settle('a', 101);
    expect(drafts.getPairing('b', 101, true)).toBe('keep');
    // * then a's own message settles b by content
    expect(adopt(drafts, 102, served('-1500000000', BOUNCEABLE))?.randomId).toBe('b');
  });

  it('drops a draft whose own message is already in the chat', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a'));
    expect(drafts.getPairing('a', 101, true)).toBe('drop');
  });

  it('forgets what it settled once no draft is left to tell twins apart', () => {
    const drafts = new GramTransferDrafts();
    drafts.add(draft('a'));
    drafts.settle('a', 101);
    drafts.add(draft('b'));
    expect(drafts.getPairing('b', 101, true)).toBe('drop');
  });
});

describe('send failures', () => {
  it('names the engine phases that fail a transfer', () => {
    expect(getGramTransferFailure('failed')).toBe('WALLET_TRANSFER_FAILED');
    expect(getGramTransferFailure('cancelled')).toBe('WALLET_TRANSFER_CANCELLED');
    expect(getGramTransferFailure('expired')).toBe('WALLET_TRANSFER_EXPIRED');
    expect(getGramTransferFailure('replaced')).toBe('WALLET_TRANSFER_REPLACED');
  });

  it('does not fail a gasless pair one half of which replaced the other, nor a transfer still out', () => {
    expect(getGramTransferFailure('replaced', true)).toBeUndefined();
    expect(getGramTransferFailure('submitted')).toBeUndefined();
    expect(getGramTransferFailure('submissionUnknown')).toBeUndefined();
    expect(getGramTransferFailure('confirmed')).toBeUndefined();
  });

  it('takes only a refusal the server sent as definite', () => {
    expect(isDefiniteTransferRefusal(apiError(400, 'WALLET_TRANSFER_INVALID'))).toBe(true);
    expect(isDefiniteTransferRefusal(apiError(406, 'WALLET_BALANCE_LOW'))).toBe(true);
    expect(isDefiniteTransferRefusal(apiError(400, 'NETWORK_BAD_RESPONSE'))).toBe(false);
    expect(isDefiniteTransferRefusal(apiError(500, 'INTERNAL'))).toBe(false);
    expect(isDefiniteTransferRefusal(apiError(undefined, 'TIMEOUT'))).toBe(false);
    expect(isDefiniteTransferRefusal(undefined)).toBe(false);
    // * a copy refused for what an earlier one did: that one may have gone out
    expect(isDefiniteTransferRefusal(apiError(400, 'RANDOM_ID_DUPLICATE'))).toBe(false);
  });

  it('settles a transfer whose outcome was unknown only by what the journal says of it', () => {
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'expired'})).toBe('failed');
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'failed'})).toBe('failed');
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'replaced'})).toBe('failed');
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'confirmed'})).toBe('done');
    // * the fee-free twin took the seqno: that is how a gasless pair succeeds
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'replaced'}, true)).toBe('done');
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'sequenceNumberConsumed'})).toBe('done');
    // * still open, or about another transfer, or no answer: nothing yet
    expect(getUnknownTransferVerdict('op', {operationId: 'op', phase: 'submissionUnknown'})).toBeUndefined();
    expect(getUnknownTransferVerdict('op', {operationId: 'other', phase: 'expired'})).toBeUndefined();
    expect(getUnknownTransferVerdict('op', {phase: 'idle'})).toBeUndefined();
    expect(getUnknownTransferVerdict('op', undefined)).toBeUndefined();
  });
});

describe('transfer words outside the card', () => {
  beforeAll(() => {
    // * the app's own English strings, as the client applies a language pack
    I18n.applyLangPack({_: 'langPackDifference', from_version: 0, version: 0, lang_code: undefined, strings: I18n.formatLocalStrings(lang)} as any);
  });

  it('writes an amount with at most three decimals, cut, its unit agreeing with what is written', () => {
    expect(formatTransferGrams('1500000000')).toBe('1.5 Grams');
    expect(formatTransferGrams('-1500000000')).toBe('1.5 Grams');
    // * cut, never rounded up: 1.9999 is not 2
    expect(formatTransferGrams('1999900000')).toBe('1.999 Grams');
    expect(formatTransferGrams('1000400000')).toBe('1 Gram');
    expect(formatTransferGrams('1234567000000')).toBe('1,234.567 Grams');
    // * what the cut would leave at zero keeps its digits
    expect(formatTransferGrams('400000')).toBe('0.0004 Grams');
  });

  it('leaves the name and the fiat out under a sender\'s name', () => {
    const incoming = served('1500000000', OTHER, 'For the coffee');
    expect(wrapGramTransferCompactText({transfer: incoming, out: false, anonymous: false})).toBe('sent you 1.5 Grams');
    expect(wrapGramTransferCompactText({transfer: served('-1500000000', OTHER), out: true, anonymous: false})).toBe('You sent 1.5 Grams');
    expect(wrapGramTransferCompactText({transfer: incoming, out: false, anonymous: true})).toBe('You received 1.5 Grams');
  });

  it('ends an incoming transfer\'s notification with its public comment, after the gem', () => {
    const text = (transfer: MessageAction.messageActionGramTransfer, anonymous = false) => {
      return wrapGramTransferCompactText({transfer, out: false, anonymous, notification: true});
    };
    expect(text(served('1500000000', OTHER, 'For the\n coffee ☕️'))).toBe('sent you 💎1.5 Grams: For the coffee ☕️');
    expect(text(served('1500000000', OTHER, 'Lunch'), true)).toBe('You received 💎1.5 Grams: Lunch');
    // * an encrypted comment is its payload: nothing of it is shown
    expect(text(served('1500000000', OTHER, 'te6cckEBAQEA', true))).toBe('sent you 💎1.5 Grams');
    expect(text(served('1500000000', OTHER, '  '))).toBe('sent you 💎1.5 Grams');
  });

  it('says what a reaction was to: the transfer, its amount and its public comment', () => {
    expect(wrapGramTransferReactionText('❤', served('-2500000000', OTHER))).toBe('❤ to your 2.5 Grams transfer');
    expect(wrapGramTransferReactionText('❤', served('-2500000000', OTHER, 'Rent'))).toBe('❤ to your 2.5 Grams transfer: Rent');
    expect(wrapGramTransferReactionText('❤', served('-2500000000', OTHER, 'te6cckEBAQEA', true))).toBe('❤ to your 2.5 Grams transfer');
    expect(getTransferPublicComment(served('1', OTHER, ' a\n\nb '))).toBe('a b');
  });

  it('counts the service line in the wallet\'s currency, the dollar from the app config', () => {
    expect(pickWalletFiatRate('USD', 3.2, {USD: 3.1, EUR: 2.9})).toEqual({currency: 'USD', perGram: 3.2});
    expect(pickWalletFiatRate('EUR', 3.2, {USD: 3.1, EUR: 2.9})).toEqual({currency: 'EUR', perGram: 2.9});
    // * no config rate yet: the wallet's own dollar rate
    expect(pickWalletFiatRate('USD', undefined, {USD: 3.1})).toEqual({currency: 'USD', perGram: 3.1});
    // * a currency the rates do not know, or a rate that is no positive number: no fiat at all, not the dollar
    expect(pickWalletFiatRate('EUR', 3.2, undefined)).toBeUndefined();
    expect(pickWalletFiatRate('JPY', 3.2, {JPY: 0})).toBeUndefined();
    expect(pickWalletFiatRate('JPY', 3.2, {JPY: NaN})).toBeUndefined();
  });
});

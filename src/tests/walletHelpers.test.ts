/*
 * The wallet's pure helpers: how amounts and addresses are written, what the recipient field holds, how a
 * server-side encrypted comment becomes the bag of cells the engine opens, and how engine URLs map onto the
 * MTProto provider proxy.
 */

import {describe, expect, it} from 'vitest';
import {absNanos, compareNanos, formatGrams, groupAddress, isCryptoTopUp, isNegativeNanos, shortAddress, splitGrams, walletProviderName} from '@components/wallet/format';
import {classifyRecipientInput} from '@components/wallet/recipient';
import {encryptedCommentFeeBody, isValidCommentPayloadSize, serverCommentBody} from '@lib/wallet/commentBody';
import {parseToncenterUrl} from '@lib/wallet/engineHost';
import base64ToBytes from '@helpers/string/base64ToBytes';
import {commentBytes, getDeliveredNanos, getWalletErrorLangKey} from '@components/wallet/send';
import {findSettledTransfer} from '@components/wallet/settledTransfer';
import type {WalletNftItem, WalletTransaction} from '@layer';
import type {WalletPendingTransfer} from '@lib/wallet/historyCache';

const ADDRESS = 'UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k';

describe('wallet amounts', () => {
  it('writes Grams with up to nine decimals and no trailing zeros', () => {
    expect(formatGrams('1000000000')).toBe('1');
    expect(formatGrams('1500000000')).toBe('1.5');
    expect(formatGrams('1720580000000')).toBe('1,720.58');
    expect(formatGrams('1')).toBe('0.000000001');
  });

  it('splits a balance into the whole part and two decimals, like the card', () => {
    expect(splitGrams('1720580000000')).toEqual({whole: '1,720', fraction: '.58'});
    expect(splitGrams('1000000000')).toEqual({whole: '1', fraction: '.00'});
    expect(splitGrams('2459999999')).toEqual({whole: '2', fraction: '.45'});
  });

  it('compares and takes the magnitude of big amounts exactly', () => {
    expect(absNanos('-15460000000')).toBe('15460000000');
    expect(isNegativeNanos('-1')).toBe(true);
    expect(compareNanos('99999999999999999999', '100000000000000000000')).toBe(-1);
  });
});

describe('wallet addresses', () => {
  it('groups an address by four, a given number of groups to a line', () => {
    expect(groupAddress(ADDRESS, 6)).toEqual([
      'UQA8 RRt6 mUoT cSht SDlx DvF1',
      'SX6F emu9 dMCB -ZTK 3uQ- aU_k'
    ]);
  });

  it('shortens an address to its ends', () => {
    expect(shortAddress(ADDRESS)).toBe('UQA8…aU_k');
  });
});

describe('recipient field', () => {
  it('tells a link, an address, a .ton name and a search apart', () => {
    expect(classifyRecipientInput('ton://transfer/' + ADDRESS + '?amount=1').kind).toBe('link');
    expect(classifyRecipientInput(' ' + ADDRESS + ' ').kind).toBe('address');
    expect(classifyRecipientInput('0:' + 'a'.repeat(64)).kind).toBe('address');
    expect(classifyRecipientInput('Foundation.TON')).toEqual({kind: 'domain', value: 'foundation.ton'});
    expect(classifyRecipientInput('alice.t.me')).toEqual({kind: 'domain', value: 'alice.t.me'});
    expect(classifyRecipientInput('Alice_Bob.t.me')).toEqual({kind: 'domain', value: 'alice_bob.t.me'});
    expect(classifyRecipientInput('a.b.ton')).toEqual({kind: 'domain', value: 'a.b.ton'});
    expect(classifyRecipientInput('.ton').kind).toBe('search');
    expect(classifyRecipientInput('t.me').kind).toBe('search');
    expect(classifyRecipientInput('alice').kind).toBe('search');
    expect(classifyRecipientInput('@alice').kind).toBe('search');
  });

  it('counts a comment in UTF-8 bytes', () => {
    expect(commentBytes('abc')).toBe(3);
    expect(commentBytes('☕️')).toBe(6);
  });
});

describe('send', () => {
  it('delivers the whole balance less its fee, anything else as it is', () => {
    expect(getDeliveredNanos({nanograms: '1720580000000', sendAll: true, fee: '2749650'})).toBe('1720577250350');
    expect(getDeliveredNanos({nanograms: '1000', sendAll: true, fee: '2000'})).toBe('0');
    expect(getDeliveredNanos({nanograms: '1720580000000', sendAll: true})).toBe('1720580000000');
    expect(getDeliveredNanos({nanograms: '5000000000', fee: '2749650'})).toBe('5000000000');
  });

  it('says what went wrong with a comment in iOS\'s words', () => {
    expect(getWalletErrorLangKey({type: 'WALLET_COMMENT_TOO_LONG'})).toBe('Wallet.Transfer.CommentTooLongText');
    expect(getWalletErrorLangKey(new Error('the encrypted comment exceeds 960 UTF-8 bytes'))).toBe('Wallet.Transfer.CommentTooLongText');
    expect(getWalletErrorLangKey(new Error('encrypted comment is unavailable: no public key'))).toBe('Wallet.Transfer.CommentEncryptionUnavailable');
    expect(getWalletErrorLangKey(new Error('the peer Ed25519 public key is invalid'))).toBe('Wallet.Transfer.CommentEncryptionErrorText');
    expect(getWalletErrorLangKey(new Error('insufficient wallet balance'))).toBe('Wallet.Error.Insufficient');
  });
});

describe('server comment body', () => {
  it('accepts only the sizes an encrypted comment can have', () => {
    expect(isValidCommentPayloadSize(64)).toBe(true);
    expect(isValidCommentPayloadSize(80)).toBe(true);
    expect(isValidCommentPayloadSize(70)).toBe(false);
    expect(isValidCommentPayloadSize(48)).toBe(false);
    expect(isValidCommentPayloadSize(1040)).toBe(false);
  });

  it('wraps the payload into one cell chain behind the encrypted-comment opcode', () => {
    const payload = new Uint8Array(64).map((_, i) => i + 1);
    const boc = base64ToBytes(serverCommentBody(payload));
    // magic, then: offset width 1, two cells, one root, no absent cells
    expect(Array.from(boc.slice(0, 9))).toEqual([0xb5, 0xee, 0x9c, 0x72, 0x01, 1, 2, 1, 0]);
    const total = boc[9];
    expect(boc[10]).toBe(0); // root index
    expect(boc.length).toBe(11 + total);
    // first cell: one reference, 39 full bytes (opcode + 35 bytes of payload)
    expect(boc[11]).toBe(1);
    expect(boc[12]).toBe(2 * 39);
    expect(Array.from(boc.slice(13, 17))).toEqual([0x21, 0x67, 0xda, 0x4b]);
    expect(Array.from(boc.slice(17, 17 + 35))).toEqual(Array.from(payload.slice(0, 35)));
    expect(boc[17 + 35]).toBe(1); // the reference to the next cell
    // last cell: no references, the remaining 29 bytes
    const second = 17 + 35 + 1;
    expect(boc[second]).toBe(0);
    expect(boc[second + 1]).toBe(2 * 29);
    expect(Array.from(boc.slice(second + 2))).toEqual(Array.from(payload.slice(35)));
  });

  it('switches to two-byte offsets past 255 bytes', () => {
    const boc = base64ToBytes(serverCommentBody(new Uint8Array(400)));
    expect(boc[5]).toBe(2);
  });

  it('prices a comment by a zero payload of the same size', () => {
    const short = base64ToBytes(encryptedCommentFeeBody('hi'));
    const long = base64ToBytes(encryptedCommentFeeBody('x'.repeat(200)));
    expect(long.length).toBeGreaterThan(short.length);
  });
});

describe('provider proxy', () => {
  it('splits an engine URL into the endpoint and the query', () => {
    expect(parseToncenterUrl('https://toncenter.com/api/v3/addressBook?address=abc&x=1')).toEqual({
      endpoint: '/api/v3/addressBook',
      query: 'address=abc&x=1'
    });
    expect(parseToncenterUrl('https://toncenter.com/api/v2/jsonRPC')).toEqual({endpoint: '/api/v2/jsonRPC', query: ''});
  });

  it('refuses anything outside the provider API', () => {
    expect(parseToncenterUrl('https://evil.example/api/v2/jsonRPC')).toBeUndefined();
    expect(parseToncenterUrl('https://toncenter.com/other')).toBeUndefined();
    expect(parseToncenterUrl('https://toncenter.com/api/v2/%2e%2e/x')).toBeUndefined();
  });
});

describe('top-up rows', () => {
  it('names a top-up by how it was paid: Telegram\'s own provider for crypto, any other for a card (Android)', () => {
    expect(isCryptoTopUp('walt')).toBe(true);
    expect(isCryptoTopUp(' Wallet ')).toBe(true);
    expect(isCryptoTopUp('moonpay')).toBe(false);
    expect(isCryptoTopUp('waltz')).toBe(false);
    expect(isCryptoTopUp(undefined)).toBe(false);
  });

  it('writes the provider with its first letter up', () => {
    expect(walletProviderName('moonpay')).toBe('Moonpay');
    expect(walletProviderName('MoonPay')).toBe('MoonPay');
    expect(walletProviderName('1inch')).toBe('1Inch');
    expect(walletProviderName('')).toBe('');
  });
});

describe('a "Sending" row that left without its receipt', () => {
  const TO = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
  const TO_NON_BOUNCEABLE = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
  const OTHER = 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA';
  const SENT_AT = 1700000000;
  const row = (extra: Partial<WalletPendingTransfer> = {}): WalletPendingTransfer => ({
    id: 'op-' + Math.random(),
    nanograms: '10000000000',
    address: TO,
    date: SENT_AT * 1000,
    ...extra
  });
  let nextId = 0;
  const sent = (amount: string, extra: Partial<WalletTransaction> = {}): WalletTransaction => ({
    _: 'walletTransaction',
    pFlags: {},
    id: 'tx' + ++nextId,
    amount: '-' + amount,
    fee: '3000000',
    date: SENT_AT + 2,
    peer: {_: 'walletTransactionPeerAddress', address: TO_NON_BOUNCEABLE},
    ...extra
  });

  it('takes its receipt\'s transaction first', () => {
    const own = sent('1000000000');
    expect(findSettledTransfer([sent('10000000000'), own], row(), own.id)).toBe(own);
  });

  it('is the one transfer of its exact amount to its address since it was sent', () => {
    const match = sent('10000000000');
    expect(findSettledTransfer([match], row())).toBe(match);
    // * a smaller transfer to the same address a moment before is another one
    expect(findSettledTransfer([sent('1000000000', {date: SENT_AT - 10})], row())).toBeUndefined();
    expect(findSettledTransfer([sent('9999999999')], row())).toBeUndefined();
    expect(findSettledTransfer([sent('10000000000', {peer: {_: 'walletTransactionPeerAddress', address: OTHER}})], row())).toBeUndefined();
    expect(findSettledTransfer([sent('10000000000', {pFlags: {incoming: true}})], row())).toBeUndefined();
    expect(findSettledTransfer([sent('10000000000', {date: SENT_AT - 16})], row())).toBeUndefined();
    // * two such transfers: neither is shown as this one
    expect(findSettledTransfer([sent('10000000000'), sent('10000000000')], row())).toBeUndefined();
  });

  it('is nothing for an attempt that failed', () => {
    expect(findSettledTransfer([sent('10000000000')], row({failed: true}))).toBeUndefined();
  });

  it('sending the whole balance, may be off the quote by the fee it paid, and no more', () => {
    const all = row({nanograms: '9996000000', sendAll: true});
    const paidLess = sent('9997500000', {fee: '2500000'});
    expect(findSettledTransfer([paidLess], all)).toBe(paidLess);
    const paidMore = sent('9994000000', {fee: '6000000'});
    expect(findSettledTransfer([paidMore], all)).toBe(paidMore);
    expect(findSettledTransfer([sent('9990000000', {fee: '3000000'})], all)).toBeUndefined();
    // * an exact amount is never matched loosely
    expect(findSettledTransfer([sent('9997500000', {fee: '2500000'})], row({nanograms: '9996000000'}))).toBeUndefined();
  });

  it('a collectible\'s is the transfer of that collectible, never one of Grams', () => {
    const nft = {address: 'EQnft'} as WalletNftItem;
    const moved = sent('50000000', {nft});
    expect(findSettledTransfer([moved], row({nanograms: '50000000', nft}))).toBe(moved);
    expect(findSettledTransfer([sent('50000000')], row({nanograms: '50000000', nft}))).toBeUndefined();
    expect(findSettledTransfer([moved], row({nanograms: '50000000'}))).toBeUndefined();
  });
});

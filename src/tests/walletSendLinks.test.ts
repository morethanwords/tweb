/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
 * What a t.me/sendgrams or ton://transfer link opens the amount screen with: its amount taken as iOS and Android take
 * it, and its comment as it is written, unless the link asks for a private one.
 */
import {describe, expect, it, vi} from 'vitest';
import {resolveSendRequest, resolveTransferLink} from '@components/wallet/recipient';

const ADDRESS = 'UQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG';

vi.mock('@lib/rootScope', () => ({default: {
  myId: 1,
  managers: {appWalletManager: {getAddressOwner: async(): Promise<undefined> => undefined}},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
}}));

const engine = {
  parseTonAddress: async() => ({raw: '0:' + 'ab'.repeat(32), format: {kind: 'userFriendly', testnet: false, bounceable: false}}),
  convertTonAddress: async() => ADDRESS,
  parseTonTransferLink: async(link: string) => {
    const search = new URL(link).searchParams;
    return {
      recipient: ADDRESS,
      asset: {kind: 'gram'},
      amount: '1500000000',
      payload: search.has('bin') ? {kind: 'boc', boc: search.get('bin')} : {kind: 'text', text: search.get('text')},
      expiration: search.has('exp') ? {kind: 'exact', unixTimestamp: BigInt(search.get('exp'))} : {kind: 'engineDefault'}
    };
  }
};
const store = {session: {getEngine: async() => engine}} as any;

describe('send links', () => {
  it('takes whole Grams with up to 9 decimals, and refuses any other amount', async() => {
    expect((await resolveSendRequest(store, {to: ADDRESS, amount: '2.5'})).nanograms).toBe('2500000000');
    expect((await resolveSendRequest(store, {to: ADDRESS, amount: '0.000000001'})).nanograms).toBe('1');
    expect((await resolveSendRequest(store, {to: ADDRESS})).nanograms).toBeUndefined();
    for(const amount of ['0', '0.0', '1.0000000001', '-1', '1e9', '', '1,5']) {
      await expect(resolveSendRequest(store, {to: ADDRESS, amount})).rejects.toMatchObject({type: 'WALLET_LINK_INVALID'});
    }
  });

  it('leaves a link\'s comment public unless the link asks for it to be private', async() => {
    expect(await resolveSendRequest(store, {to: ADDRESS, comment: 'deposit 42'})).toMatchObject({comment: 'deposit 42', publicComment: true});
    expect(await resolveSendRequest(store, {to: ADDRESS, comment: 'hi', encrypted: true})).toMatchObject({comment: 'hi', publicComment: false});
    expect(await resolveTransferLink(store, 'ton://transfer/' + ADDRESS + '?text=memo')).toMatchObject({comment: 'memo', publicComment: true});
    expect((await resolveSendRequest(store, {to: ADDRESS})).publicComment).toBeUndefined();
  });

  it('cuts a long comment to what a transfer carries, never inside a character', async() => {
    const {comment} = await resolveSendRequest(store, {to: ADDRESS, comment: 'a' + '💎'.repeat(300)});
    expect(new TextEncoder().encode(comment).length).toBe(957);
    expect(comment.endsWith('💎')).toBe(true);
  });

  it('keeps a link\'s own body and its deadline, and refuses a link that is past it', async() => {
    const later = Math.floor(Date.now() / 1000) + 600;
    expect(await resolveTransferLink(store, `ton://transfer/${ADDRESS}?bin=te6cc&exp=${later}`)).toMatchObject({payload: 'te6cc', expiresAt: later});
    await expect(resolveTransferLink(store, `ton://transfer/${ADDRESS}?exp=${later - 1200}`)).rejects.toMatchObject({type: 'WALLET_LINK_EXPIRED'});
    // * a deadline beyond what a number holds is as good as none
    expect((await resolveTransferLink(store, `ton://transfer/${ADDRESS}?exp=18446744073709551615`)).expiresAt).toBeUndefined();
  });
});

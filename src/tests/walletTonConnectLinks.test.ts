/*
 * TON Connect links in messages: each form reaches a handler that hands it to the wallet's TON Connect.
 */

import {afterEach, describe, expect, test, vi} from 'vitest';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wrapUrl TON Connect links', () => {
  test('sends every form of the link to a TON Connect handler', () => {
    vi.stubGlobal('tc_tonconnect', vi.fn());
    vi.stubGlobal('tg_ton-connect', vi.fn());
    vi.stubGlobal('tg_resolve', vi.fn());
    vi.stubGlobal('tg_sendgrams', vi.fn());
    vi.stubGlobal('sendgrams', vi.fn());
    const id = 'ab'.repeat(32);
    expect(wrapUrl('tc://?v=2&id=' + id + '&r=%7B%7D').onclick).toBe('tc_tonconnect');
    expect(wrapUrl('tg://ton-connect?v=2&id=' + id).onclick).toBe('tg_ton-connect');
    // * the wallet's own links and its start parameter: their handlers tell TON Connect's fields from a payment's
    expect(wrapUrl('https://t.me/sendgrams?startapp=tonconnect-v__2-id__' + id).onclick).toBe('sendgrams');
    expect(wrapUrl('tg://sendgrams?id=' + id).onclick).toBe('tg_sendgrams');
    expect(wrapUrl('tg://resolve?domain=sendgrams&startapp=tonconnect-id__' + id).onclick).toBe('tg_resolve');
  });

  test('leaves a tc link alone when nothing handles it', () => {
    expect(wrapUrl('tc://?v=2').onclick).toBeUndefined();
  });
});

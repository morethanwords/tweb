/*
 * t.me/GetPremium is the universal link to the Premium offer: whatever its case or tail, it opens
 * what tg://premium_offer does instead of resolving @GetPremium, and its `ref` becomes
 * `tme_getpremium` / `tme_getpremium_<ref>`.
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import getPremiumLinkRef from '@helpers/getPremiumLinkRef';
import parseUriParams from '@helpers/string/parseUriParams';

describe('wrapUrl t.me/GetPremium', () => {
  beforeEach(() => {
    vi.stubGlobal('premium_offer', vi.fn());
    vi.stubGlobal('im', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    'https://t.me/GetPremium',
    'https://t.me/getpremium',
    'https://t.me/GETPREMIUM',
    'https://t.me/gEtPrEmIuM/',
    'https://t.me/GetPremium?ref=twitter',
    'https://t.me/GetPremium?ref=not-valid!&start=1',
    'https://t.me/GetPremium/123',
    'https://t.me/GetPremium/123/456',
    'https://t.me/GetPremium/s/1',
    'https://t.me/GetPremium/any/further/segments',
    'https://t.me/GetPremium#fragment',
    'https://telegram.me/GetPremium',
    'https://web.t.me/GetPremium',
    't.me/GetPremium',
    // `getpremium.t.me` spells `t.me/getpremium`
    'https://getpremium.t.me/',
    'https://GetPremium.t.me/123'
  ])('opens the Premium offer for %s', (url) => {
    expect(wrapUrl(url).onclick).toBe('premium_offer');
  });

  test.each([
    'https://t.me/GetPremiumBot',
    'https://t.me/durov/getpremium',
    'https://t.me/durov?ref=getpremium'
  ])('leaves %s to the username it names', (url) => {
    expect(wrapUrl(url).onclick).toBe('im');
  });

  test.each([
    'https://t.me.evil.com/GetPremium',
    'https://evil.com/GetPremium',
    'https://t.me@evil.com/GetPremium'
  ])('does not take the lookalike %s for the Premium offer', (url) => {
    expect(wrapUrl(url).onclick).toBeUndefined();
  });
});

describe('getPremiumLinkRef', () => {
  test.each([
    [undefined, 'tme_getpremium'],
    ['', 'tme_getpremium'],
    ['twitter', 'tme_getpremium_twitter'],
    ['Twitter', 'tme_getpremium_twitter'],
    ['X_2026', 'tme_getpremium_x_2026'],
    ['_', 'tme_getpremium__'],
    ['a'.repeat(32), 'tme_getpremium_' + 'a'.repeat(32)]
  ])('turns ref=%s into %s', (ref, expected) => {
    expect(getPremiumLinkRef(ref)).toBe(expected);
  });

  test.each([
    'a'.repeat(33),
    'not-valid',
    'twitter!',
    'two words',
    'twitter.com',
    'твиттер',
    // KELVIN SIGN lower-cases to an ASCII `k`, and is still not one
    'K',
    'ref\n'
  ])('drops the invalid ref %j', (ref) => {
    expect(getPremiumLinkRef(ref)).toBe('tme_getpremium');
  });

  test.each([
    ['https://t.me/GetPremium', 'tme_getpremium'],
    ['https://t.me/GetPremium?ref=twitter', 'tme_getpremium_twitter'],
    ['https://t.me/getpremium?ref=TikTok&utm_source=x', 'tme_getpremium_tiktok'],
    ['https://t.me/GetPremium/123?ref=tw%69tter', 'tme_getpremium_twitter'],
    ['https://t.me/GetPremium?ref=%3Cscript%3E', 'tme_getpremium']
  ])('reads the ref of %s as %s', (url, expected) => {
    expect(getPremiumLinkRef(parseUriParams(url).ref)).toBe(expected);
  });
});

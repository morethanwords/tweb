import {afterEach, describe, expect, test, vi} from 'vitest';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wrapUrl Telegram links', () => {
  test.each([
    'https://t.me/durov',
    'https://telegram.me/durov',
    'https://durov.t.me/',
    'https://web.t.me/durov',
    'https://T.ME:443/durov?start=source#fragment',
    // a port is not a host check: an explicit one on the real host stays internal, as it always has
    'https://t.me:8443/durov'
  ])('keeps the internal handler for the Telegram host %s', (url) => {
    vi.stubGlobal('im', vi.fn());
    expect(wrapUrl(url).onclick).toBe('im');
  });

  test.each([
    't.me.evil.com/durov',
    'https://t.me.evil.com/durov',
    'https://telegram.me.evil.com/durov',
    'https://durov.t.me.evil.com/',
    'https://t.me@evil.com/durov',
    'https://user@t.me/durov',
    'ftp://t.me/durov'
  ])('does not assign an internal handler to the untrusted URL %s', (url) => {
    vi.stubGlobal('im', vi.fn());
    expect(wrapUrl(url).onclick).toBeUndefined();
  });

  test('resolves the host a subdomain spells before deciding what the path means', () => {
    vi.stubGlobal('im', vi.fn());
    vi.stubGlobal('joinchat', vi.fn());

    // `durov.t.me` is `t.me/durov`, so the path a client prefix carries is read one level down:
    // `k.t.me/+abc` is the invite `t.me/+abc`, while `durov.t.me/+abc` is not an invite at all
    expect(wrapUrl('https://k.t.me/+AbCdEf').onclick).toBe('joinchat');
    expect(wrapUrl('https://durov.t.me/+AbCdEf').onclick).toBe('im');
  });

  test.each([
    'https://telesco.pe/durov/123'
  ])('keeps the internal handler for the media mirror %s', (url) => {
    vi.stubGlobal('im', vi.fn());
    expect(wrapUrl(url).onclick).toBe('im');
  });

  test.each([
    'https://telesco.pe.evil.com/durov/123',
    'https://telesco.pe@evil.com/durov/123',
    'https://evil.com/telesco.pe/durov/123'
  ])('does not assign an internal handler to the media-mirror lookalike %s', (url) => {
    vi.stubGlobal('im', vi.fn());
    expect(wrapUrl(url).onclick).toBeUndefined();
  });

  test('does not treat tg: inside an external URL as a tg protocol link', () => {
    vi.stubGlobal('tg_resolve', vi.fn());
    expect(wrapUrl('https://evil.com/tg:resolve?domain=durov').onclick).toBeUndefined();
  });

  test('hands back a URL the parser rejects instead of throwing', () => {
    vi.stubGlobal('im', vi.fn());

    // a port out of range parses nowhere. `wrapRichText` has no catch around `wrapUrl`, so a throw
    // here would take down the render of every message quoting such a link
    const url = 'https://t.me:99999/durov';
    expect(() => wrapUrl(url)).not.toThrow();
    expect(wrapUrl(url)).toEqual({url, onclick: undefined});
  });

  test('sends a contact token link to its own handler, not to a username', () => {
    vi.stubGlobal('im', vi.fn());
    vi.stubGlobal('contact', vi.fn());
    vi.stubGlobal('tg_contact', vi.fn());

    expect(wrapUrl('https://t.me/contact/AbC123_-').onclick).toBe('contact');
    expect(wrapUrl('tg://contact?token=AbC123').onclick).toBe('tg_contact');
    // with no token there is nothing but a name
    expect(wrapUrl('https://t.me/contact').onclick).toBe('im');
  });
});

describe('wrapUrl unknown tg:// links', () => {
  test('hands a tg:// link no handler knows to the server-asking one', () => {
    vi.stubGlobal('unknownDeepLink', vi.fn());
    vi.stubGlobal('tg_resolve', vi.fn());

    expect(wrapUrl('tg://nothing_like_it?x=1').onclick).toBe('unknownDeepLink');
    expect(wrapUrl('tg://nothing/like/it').onclick).toBe('unknownDeepLink');
    // a known one keeps its own
    expect(wrapUrl('tg://resolve?domain=durov').onclick).toBe('tg_resolve');
  });

  test('leaves a link plain where nothing asks the server', () => {
    expect(wrapUrl('tg://nothing_like_it').onclick).toBeUndefined();
  });

  test('keeps an unsafe Instant View link plain, and a web link without a handler too', () => {
    vi.stubGlobal('unknownDeepLink', vi.fn());
    vi.stubGlobal('tg_iv', vi.fn());

    expect(wrapUrl('tg://iv?url=' + encodeURIComponent('https://example.com/')).onclick).toBeUndefined();
    // `call` is not registered where group calls are not supported: not a tg:// link either way
    expect(wrapUrl('https://t.me/call/abc').onclick).toBeUndefined();
  });
});

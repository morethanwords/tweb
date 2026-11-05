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

describe('wrapUrl handlers are the app\'s own', () => {
  const shown: string[] = [];
  // * what a browser's window shows of the document by name - an element of that id, a frame, a form - lives
  // * on its prototype chain (jsdom has none of it), never on the window itself
  const showByName = (name: string, value: any) => {
    Object.defineProperty(Object.getPrototypeOf(window), name, {value, configurable: true});
    shown.push(name);
  };
  afterEach(() => {
    shown.splice(0).forEach((name) => delete Object.getPrototypeOf(window)[name]);
  });

  test.each([
    ['tg://x=alert(1)', 'tg_x=alert(1)'],
    ['tg:x=alert(document.domain)', 'tg_x=alert(document.domain)'],
    ['tg://a=fetch(1)//b', 'tg_a=fetch(1)']
  ])('never takes an element named as %s spells for its handler', (url, name) => {
    showByName(name, document.createElement('span'));
    expect(wrapUrl(url).onclick).toBeUndefined();

    vi.stubGlobal('unknownDeepLink', vi.fn());
    expect(wrapUrl(url).onclick).toBe('unknownDeepLink');
  });

  test('takes a handler only as a function set on the window itself', () => {
    // * an `<embed>` or `<object>` was callable in some engines
    showByName('tg_resolve', () => {});
    expect(wrapUrl('tg://resolve?domain=durov').onclick).toBeUndefined();

    vi.stubGlobal('tg_resolve', {});
    expect(wrapUrl('tg://resolve?domain=durov').onclick).toBeUndefined();
  });

  test('keeps t.me/sendgrams a username link with only an element of that id there', () => {
    vi.stubGlobal('im', vi.fn());
    showByName('sendgrams', document.createElement('span'));
    expect(wrapUrl('https://t.me/sendgrams?to=@durov&amount=1').onclick).toBe('im');
  });

  // * the name is spelled into an inline onclick: `tg_ton-connect(this)` subtracts, and throws on click
  test('never takes a function the inline code cannot call by its name', () => {
    vi.stubGlobal('unknownDeepLink', vi.fn());
    vi.stubGlobal('tg_ton-connect', vi.fn());
    vi.stubGlobal('tg_a.b', vi.fn());
    expect(wrapUrl('tg://ton-connect?v=2').onclick).toBe('unknownDeepLink');
    expect(wrapUrl('tg://a.b?x=1').onclick).toBe('unknownDeepLink');
  });

  test('asks no element named unknownDeepLink about a tg:// link', () => {
    showByName('unknownDeepLink', document.createElement('span'));
    expect(wrapUrl('tg://nothing_like_it?x=1').onclick).toBeUndefined();
  });
});

describe('wrapUrl wallet links', () => {
  test('sends t.me/sendgrams to the wallet and leaves the other one-segment links alone', () => {
    vi.stubGlobal('im', vi.fn());
    vi.stubGlobal('sendgrams', vi.fn());
    vi.stubGlobal('share', vi.fn());
    vi.stubGlobal('boost', vi.fn());
    expect(wrapUrl('https://t.me/sendgrams?to=@durov&amount=1').onclick).toBe('sendgrams');
    // * written any case, with a closing slash, as iOS and Android take it
    expect(wrapUrl('https://t.me/sendgrams/?to=@durov').onclick).toBe('sendgrams');
    expect(wrapUrl('https://t.me/SendGrams?to=@durov').onclick).toBe('sendgrams');
    expect(wrapUrl('https://t.me/sendgrams/x?to=@durov').onclick).not.toBe('sendgrams');
    // one path segment of the shared group is a username link, as it always was
    expect(wrapUrl('https://t.me/share?url=https://x').onclick).toBe('im');
    expect(wrapUrl('https://t.me/boost?c=123').onclick).toBe('im');
    expect(wrapUrl('https://t.me/share/url?url=https://x').onclick).toBe('share');
  });

  test('keeps t.me/sendgrams a username link while the wallet has no handler, as before its release', () => {
    vi.stubGlobal('im', vi.fn());
    expect(wrapUrl('https://t.me/sendgrams?to=@durov&amount=1').onclick).toBe('im');
  });

  test('sends ton://transfer to the wallet', () => {
    vi.stubGlobal('ton_transfer', vi.fn());
    expect(wrapUrl('ton://transfer/UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k?amount=1').onclick).toBe('ton_transfer');
  });
});

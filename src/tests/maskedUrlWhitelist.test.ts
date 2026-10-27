/*
 * A link whose text hides its address asks before it opens — unless the server vouches for the
 * host in the app config's `whitelisted_domains`. Such a link is rendered as a plain one.
 */

import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import {MessageEntity} from '@layer';
import {setAppStateSilent} from '@stores/appState';
import isWhitelistedUrl from '@lib/richTextProcessor/isWhitelistedUrl';

// wrapRichText reaches the worker proxy through langPack; none of that is needed to build a link
vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => vi.fn()})}));

const WHITELISTED_DOMAINS = ['telegram.org', 'fragment.com'];

let wrapRichText: typeof import('@lib/richTextProcessor/wrapRichText').default;

beforeAll(async() => {
  stubBrowserGlobals();
  wrapRichText = (await import('@lib/richTextProcessor/wrapRichText')).default;
});

beforeEach(() => {
  setAppStateSilent('appConfig', {whitelisted_domains: WHITELISTED_DOMAINS});
});

function wrapHiddenLink(url: string, text = 'such') {
  const entities: MessageEntity[] = [{_: 'messageEntityTextUrl', offset: 0, length: text.length, url}];
  return wrapRichText(text, {entities}).querySelector('a.anchor-url');
}

describe('isWhitelistedUrl', () => {
  test.each([
    'https://telegram.org/blog/welcome-messages-buttons-TG-13',
    'http://telegram.org',
    'https://TELEGRAM.ORG/blog',
    'https://fragment.com/username/durov'
  ])('trusts %s', (url) => {
    expect(isWhitelistedUrl(url, WHITELISTED_DOMAINS)).toBe(true);
  });

  test.each([
    'https://core.telegram.org/api', // a subdomain is a host of its own, the server lists the ones it means
    'https://telegram.org.evil.com/blog',
    'https://telegram.org@evil.com/blog',
    'https://evil.com@telegram.org/blog', // a login in front of the host is refused, not ignored
    'ftp://telegram.org/blog',
    'https://evil.com/telegram.org',
    'not a url'
  ])('does not trust %s', (url) => {
    expect(isWhitelistedUrl(url, WHITELISTED_DOMAINS)).toBe(false);
  });

  test('trusts nothing without a list', () => {
    expect(isWhitelistedUrl('https://telegram.org', undefined)).toBe(false);
    expect(isWhitelistedUrl('https://telegram.org', [])).toBe(false);
  });
});

describe('a hidden link', () => {
  test('to a whitelisted host opens without asking', () => {
    const anchor = wrapHiddenLink('https://telegram.org/blog/welcome-messages-buttons-TG-13');
    expect(anchor.getAttribute('href')).toBe('https://telegram.org/blog/welcome-messages-buttons-TG-13');
    expect(anchor.getAttribute('onclick')).toBeNull();
    expect(anchor.getAttribute('target')).toBe('_blank');
  });

  test.each([
    'https://evil.com/blog',
    'https://core.telegram.org/api',
    'https://telegram.org@evil.com/blog'
  ])('to %s still asks', (url) => {
    expect(wrapHiddenLink(url).getAttribute('onclick')).toBe('showMaskedAlert(this)');
  });

  test('asks while the app config has not come yet', () => {
    setAppStateSilent('appConfig', undefined);
    expect(wrapHiddenLink('https://telegram.org/blog').getAttribute('onclick')).toBe('showMaskedAlert(this)');
  });

  // `autologin_domains` names where the click signs the user in, not hosts that may hide behind text
  test('to an autologin host that is not whitelisted still asks', () => {
    setAppStateSilent('appConfig', {whitelisted_domains: WHITELISTED_DOMAINS, autologin_domains: ['instantview.telegram.org']});
    expect(wrapHiddenLink('https://instantview.telegram.org/').getAttribute('onclick')).toBe('showMaskedAlert(this)');
  });
});

// the same list keeps a non-Premium profile's description to links on the hosts it names
describe('the whitelistedDomains option', () => {
  function wrapUrlLink(url: string) {
    const entities: MessageEntity[] = [{_: 'messageEntityUrl', offset: 0, length: url.length}];
    return wrapRichText(url, {entities, whitelistedDomains: WHITELISTED_DOMAINS}).querySelector('a');
  }

  test('keeps a link on a listed host', () => {
    expect(wrapUrlLink('https://telegram.org/blog')).not.toBeNull();
  });

  test.each([
    'https://evil.com/blog',
    'https://evil.com@telegram.org/blog'
  ])('drops the link %s', (url) => {
    expect(wrapUrlLink(url)).toBeNull();
  });
});

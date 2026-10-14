/*
 * The single place that answers "is this a Telegram link host?". It exists because the answer
 * used to be a regexp over the raw url text, and `https://t.me.evil.com/durov` satisfied one:
 * nothing ended the host, so an attacker's host collected the internal `im`/`call` handlers.
 */

import {afterEach, describe, expect, test, vi} from 'vitest';
import matchTelegramUrlHost, {matchUrlHost, TELESCOPE_LINK_HOST} from '@lib/richTextProcessor/matchTelegramUrlHost';
import addAnchorListener from '@helpers/addAnchorListener';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('matchTelegramUrlHost', () => {
  test.each([
    ['https://t.me/durov', undefined],
    ['https://t.me', undefined],
    ['https://telegram.me/durov', undefined],
    ['http://t.me/durov', undefined],
    ['https://T.ME/durov', undefined], // the host is case-insensitive, the regexp it replaced was not
    ['https://t.me:8443/durov', undefined],
    ['https://web.t.me/durov', undefined], // a client prefix names no user
    ['https://k.t.me/durov', undefined],
    ['https://durov.t.me/', 'durov'],
    ['https://durov.web.t.me/', 'durov'],
    ['https://durov.telegram.me/1', 'durov'],
    ['https://sub.sub.t.me/x', 'sub.sub']
  ])('reads %s as a Telegram host spelling the username %s', (url, prefix) => {
    expect(matchTelegramUrlHost(new URL(url))).toEqual({prefix});
  });

  test.each([
    'https://t.me.evil.com/durov',
    'https://telegram.me.evil.com/durov',
    'https://durov.t.me.evil.com/',
    'https://t.me@evil.com/durov', // the part that reads like the host is a login
    'https://user@t.me/durov',
    'https://user:pw@t.me/durov',
    'https://myt.me/durov',
    'https://ttelegram.me/durov',
    'https://evil.com/?next=t.me/durov',
    'ftp://t.me/durov',
    'tg://resolve?domain=durov'
  ])('refuses %s', (url) => {
    expect(matchTelegramUrlHost(new URL(url))).toBeUndefined();
  });

  test('answers with an object, not with the prefix', () => {
    // a caller testing `match?.prefix` instead of `match` would read every plain `t.me/durov` as
    // an external link, so the plain host has to come back truthy with no prefix in it
    expect(matchTelegramUrlHost(new URL('https://t.me/durov'))).toBeTruthy();
  });
});

describe('matchUrlHost', () => {
  test('separates the matched host from the labels in front of it', () => {
    expect(matchUrlHost(new URL('https://telesco.pe/durov/1'), [TELESCOPE_LINK_HOST]))
    .toEqual({host: TELESCOPE_LINK_HOST, subdomain: ''});
    expect(matchUrlHost(new URL('https://cdn.telesco.pe/durov/1'), [TELESCOPE_LINK_HOST]))
    .toEqual({host: TELESCOPE_LINK_HOST, subdomain: 'cdn'});
    expect(matchUrlHost(new URL('https://telesco.pe.evil.com/durov/1'), [TELESCOPE_LINK_HOST]))
    .toBeUndefined();
  });

  test('survives a url the parser never produced', () => {
    expect(matchUrlHost(undefined, [TELESCOPE_LINK_HOST])).toBeUndefined();
  });

  // the order of a server-sent list is not a promise that parents come after their subdomains
  test('prefers the host itself to a parent listed ahead of it', () => {
    expect(matchUrlHost(new URL('https://translations.telegram.org/en'), ['telegram.org', 'translations.telegram.org']))
    .toEqual({host: 'translations.telegram.org', subdomain: ''});
  });
});

describe('the pathname an internal handler receives', () => {
  function pathnameParamsFor(href: string) {
    let received: string[];
    addAnchorListener({name: 'im', callback: ({pathnameParams}) => received = pathnameParams});

    const anchor = document.createElement('a');
    anchor.href = href;
    (window as any).im(anchor);

    return received;
  }

  test('folds the username a subdomain spells into the path', () => {
    expect(pathnameParamsFor('https://durov.t.me/')).toEqual(['durov']);
    expect(pathnameParamsFor('https://durov.t.me/123')).toEqual(['durov', '123']);
    expect(pathnameParamsFor('https://durov.web.t.me/123')).toEqual(['durov', '123']);
    expect(pathnameParamsFor('https://t.me/durov')).toEqual(['durov']);
  });

  test('leaves a lookalike host alone', () => {
    // the handler is never wired to such a link by `wrapUrl`; should one reach it anyway, the
    // rewrite must not invent a `durov` chat out of the attacker's subdomain
    expect(pathnameParamsFor('https://durov.t.me.evil.com/')).toEqual(['']);
  });
});

/*
 * The parameters of an address the app reads at its start (`#?tgaddr=…`, a sign-in handed over by a website) and on
 * every change of its hash: anyone can write a link, so a malformed escape in it must not throw the reading away.
 */

import {describe, expect, test} from 'vitest';
import parseUriParams, {parseUriParamsLine} from '@helpers/string/parseUriParams';

describe('parseUriParamsLine', () => {
  test('decodes every value', () => {
    expect(parseUriParamsLine('tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dtelegram&empty=&bare')).toEqual({
      tgaddr: 'tg://resolve?domain=telegram',
      empty: '',
      bare: ''
    });
  });

  test.each([
    ['%zz'],
    ['%'],
    ['100%'],
    ['%E0%A4%A'],
    ['%C0%80'],
    ['%ED%A0%80']
  ])('keeps a value with the malformed escape %s as it is, and the other parameters with it', (value) => {
    expect(parseUriParamsLine(`x=${value}&tgaddr=tg%3A%2F%2Fresolve&tgWebAuthToken=abc`)).toEqual({
      x: value,
      tgaddr: 'tg://resolve',
      tgWebAuthToken: 'abc'
    });
  });

  test('an address that is not a URL falls back to the line, malformed escapes and all', () => {
    expect(parseUriParams('#?x=%zz&message=12')).toEqual({x: '%zz', message: '12'});
  });
});

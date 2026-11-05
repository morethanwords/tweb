/*
 * A Telegram website signs the user in by opening the app with `#?tgWebAuthToken=…&tgWebAuthUserId=…&tgWebAuthDcId=…`.
 * The app reads it before it has a screen, so an address with a part missing or malformed - anyone can write one -
 * is no sign-in at all, instead of a start that throws and leaves a blank page a reload does not cure.
 */

import {describe, expect, test} from 'vitest';
import '@helpers/peerIdPolyfill';
import {parseUriParamsLine} from '@helpers/string/parseUriParams';
import getWebAuthImport from '@lib/accounts/getWebAuthImport';

const read = (line: string) => getWebAuthImport(parseUriParamsLine(line));

describe('a sign-in handed over in the address', () => {
  test('is read with every part of it', () => {
    expect(read('tgWebAuthToken=AbC-_1%3D&tgWebAuthUserId=777000&tgWebAuthDcId=4')).toEqual({
      token: 'AbC-_1=',
      userId: 777000,
      dcId: 4,
      isTest: false
    });
  });

  test('of the test servers', () => {
    expect(read('tgWebAuthToken=t&tgWebAuthUserId=5&tgWebAuthDcId=2&tgWebAuthTest=1')).toMatchObject({isTest: true});
    expect(read('tgWebAuthToken=t&tgWebAuthUserId=5&tgWebAuthDcId=2&tgWebAuthTest=0')).toMatchObject({isTest: false});
  });

  test.each([
    ['without a token', 'tgWebAuthUserId=5&tgWebAuthDcId=2'],
    ['with an empty token', 'tgWebAuthToken=&tgWebAuthUserId=5&tgWebAuthDcId=2'],
    ['without a user', 'tgWebAuthToken=t&tgWebAuthDcId=2'],
    ['without a user, and with nothing else', 'tgWebAuthToken=t'],
    ['with an empty user', 'tgWebAuthToken=t&tgWebAuthUserId=&tgWebAuthDcId=2'],
    ['with a user that is not a number', 'tgWebAuthToken=t&tgWebAuthUserId=abc&tgWebAuthDcId=2'],
    ['with a user that is not a positive integer', 'tgWebAuthToken=t&tgWebAuthUserId=-5&tgWebAuthDcId=2'],
    ['with a user of a malformed escape', 'tgWebAuthToken=t&tgWebAuthUserId=%zz&tgWebAuthDcId=2']
  ])('is not one %s', (_, line) => {
    expect(read(line)).toBeUndefined();
  });
});

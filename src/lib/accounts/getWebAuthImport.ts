import type {AuthState} from '@types';
import isValidDcId from '@lib/mtproto/isValidDcId';

export type WebAuthImport = Omit<AuthState.signImport['data'], 'tgAddr'>;

/**
 * The sign-in a Telegram website hands over in the address
 * (`#?tgWebAuthToken=…&tgWebAuthUserId=…&tgWebAuthDcId=…[&tgWebAuthTest=1]`), or nothing when a part of it is
 * missing or malformed: the address is anyone's to write, and it is read before the app has a screen to show.
 */
export default function getWebAuthImport(params: Record<string, string>): WebAuthImport {
  const {
    tgWebAuthToken: token,
    tgWebAuthUserId: userId,
    tgWebAuthDcId: dcId,
    tgWebAuthTest: test
  } = params;
  const isTest = test !== undefined && !!+test;
  // * the DC becomes the base of the account's slot, where every later sign-in would go: one the client does not
  // * connect to - or that the test servers do not have, for a sign-in of theirs - is no sign-in either
  if(!token || !/^[1-9]\d*$/.test(userId ?? '') || !isValidDcId(+dcId, isTest)) {
    return;
  }

  return {
    token,
    userId: userId.toUserId(),
    dcId: +dcId,
    isTest
  };
}

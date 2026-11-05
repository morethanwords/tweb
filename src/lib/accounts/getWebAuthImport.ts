import type {AuthState} from '@types';

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
  if(!token || !/^[1-9]\d*$/.test(userId ?? '')) {
    return;
  }

  return {
    token,
    userId: userId.toUserId(),
    dcId: +dcId,
    isTest: test !== undefined && !!+test
  };
}

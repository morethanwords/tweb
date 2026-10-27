import {DcAuthKey, DcServerSalt, TrueDcId} from '@types';
import type {StoredTempAuthKey} from '@lib/mtproto/tempAuthKeys';

export type ActiveAccountNumber = 1 | 2 | 3 | 4;

/**
 * Who the account is, the way Web A keeps it in the same slot (`account${n}`) for its menu of accounts -
 * read from there before an account is opened. K writes it too (AppAccountManager.saveSessionUser)
 */
export type SessionUserInfo = {
  firstName?: string,
  lastName?: string,
  phone?: string,
  // * `data:` URL of the small profile photo
  avatarUri?: string,
  // * the regular peer color, none for a collectible one
  color?: number,
  isPremium?: boolean,
  emojiStatusId?: string
};

export type SessionUserFields = Omit<SessionUserInfo, 'avatarUri'>;

type A = Record<DcAuthKey, string> &
  Record<DcServerSalt, string> &
  SessionUserInfo &
  {
    auth_key_fingerprint: string,
    push_key?: string,
    push_key_fingerprint?: string,
    // * stored as a string, the way Web A compares it (AccountController turns it back)
    userId: PeerId,
    dcId: TrueDcId,
    // * the DC a sign-in not finished yet goes to: `dcId` would make the slot a stored session to Web A
    sign_in_dc_id?: TrueDcId,
    date: number,
    // * by `${dcId}` or `${dcId}-media` (PFS, see @lib/mtproto/tempAuthKeys)
    temp_auth_keys?: Record<string, StoredTempAuthKey>,
    // * Web A's account of the test servers: they share the slots with the production ones there
    isTest?: true
  };

export type AccountSessionData = Partial<A>;

// * as it lies in localStorage: Web A's string id, or a number from an older K
export type StoredAccountSessionData = Omit<AccountSessionData, 'userId'> & {userId?: string | number};

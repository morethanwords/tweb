import {DcAuthKey, DcServerSalt, TrueDcId} from '@types';
import type {StoredTempAuthKey} from '@lib/mtproto/tempAuthKeys';

export type ActiveAccountNumber = 1 | 2 | 3 | 4;

type A = Record<DcAuthKey, string> &
  Record<DcServerSalt, string> &
  {
    auth_key_fingerprint: string,
    push_key?: string,
    push_key_fingerprint?: string,
    userId: PeerId,
    dcId: TrueDcId,
    date: number,
    // * by `${dcId}` or `${dcId}-media` (PFS, see @lib/mtproto/tempAuthKeys)
    temp_auth_keys?: Record<string, StoredTempAuthKey>
  };

export type AccountSessionData = Partial<A>;

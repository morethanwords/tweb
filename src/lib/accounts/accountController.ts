import {MOUNT_CLASS_TO} from '../../config/debug';

import sessionStorage from '../sessionStorage';

import {AccountSessionData, ActiveAccountNumber} from './types';
import {MAX_ACCOUNTS} from './constants';
import {TrueDcId} from '../../types';
import tsNow from '../../helpers/tsNow';
import App from '../../config/app';

export class AccountController {
  static async getTotalAccounts() {
    const promises = ([1, 2, 3, 4] as const).map((accountNumber) => sessionStorage.get(`account${accountNumber}`));

    const allAccountsData = await Promise.all(promises);

    return allAccountsData.filter((accountData) => !!accountData?.userId).length;
  }

  static async getUserIds() {
    const promises = ([1, 2, 3, 4] as const).map((accountNumber) => sessionStorage.get(`account${accountNumber}`));

    const allAccountsData = await Promise.all(promises);

    return allAccountsData.map((accountData) => accountData?.userId).filter(Boolean);
  }

  static async get(accountNumber: ActiveAccountNumber) {
    const data = await sessionStorage.get(`account${accountNumber}`);
    this.fillFingerprint(data);
    return data;
  }

  static fillFingerprint(data: AccountSessionData) {
    if(data && !data.auth_key_fingerprint) {
      const key = `dc${App.baseDcId}_auth_key` as const;
      const value = data[key];
      data.auth_key_fingerprint = value ? data[key].slice(0, 8) : undefined;
    }
  }

  static async update(accountNumber: ActiveAccountNumber, data: Partial<AccountSessionData>, overrideAll = false) {
    const prevData = await this.get(accountNumber);
    this.fillFingerprint(data as AccountSessionData);

    const updatedData = {
      ...(overrideAll ? {} : prevData),
      ...data
    };

    await sessionStorage.set({
      [`account${accountNumber}`]: updatedData
    });

    if(accountNumber === 1) {
      await this.updateStorageForLegacy(updatedData);
    }

    return updatedData;
  }

  /**
   * Shifts 4 -> 3, 3 -> 2 ... depending on which account you need to delete
   * @param upTo Account to delete basically
   */
  static async shiftAccounts(upTo: ActiveAccountNumber) {
    for(let i = upTo; i <= MAX_ACCOUNTS; i++) {
      await sessionStorage.delete(`account${i as ActiveAccountNumber}`);
      if(i < MAX_ACCOUNTS) {
        const toMove = await this.get((i + 1) as ActiveAccountNumber);
        toMove?.userId && (await this.update(i as ActiveAccountNumber, toMove, true));
      }
    }
  }

  static async updateStorageForLegacy(accountData: Partial<AccountSessionData>) {
    const obj: Parameters<typeof sessionStorage['set']>[0] = {};
    const toClear: (keyof typeof obj)[] = [];

    const set = <T extends keyof typeof obj>(key: T, value: typeof obj[T]) => {
      if(value) obj[key] = value;
      else toClear.push(key);
    };

    for(let i = 1; i <= 5; i++) {
      const authKeyKey = `dc${i as TrueDcId}_auth_key` as const;
      const serverSaltKey = `dc${i as TrueDcId}_server_salt` as const;

      set(authKeyKey, accountData[authKeyKey]);
      set(serverSaltKey, accountData[serverSaltKey]);
    }

    accountData['auth_key_fingerprint'] && set('auth_key_fingerprint', accountData['auth_key_fingerprint']);
    set('user_auth', accountData['userId'] && {
      date: tsNow(true),
      id: accountData.userId,
      dcID: accountData.dcId || 0
    });
    set('dc', accountData.dcId);

    await Promise.all([
      sessionStorage.set(obj),
      Promise.all(toClear.map((key) => sessionStorage.delete(key)))
    ]);
  }
}

MOUNT_CLASS_TO.AccountController = AccountController;

export default AccountController;

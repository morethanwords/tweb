import {MOUNT_CLASS_TO} from '@config/debug';
import App from '@config/app';
import tsNow from '@helpers/tsNow';
import type {TrueDcId} from '@types';

import sessionStorage from '@lib/sessionStorage';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import StaticUtilityClass from '@lib/staticUtilityClass';

import {AccountSessionData, ActiveAccountNumber} from '@lib/accounts/types';
import {MAX_ACCOUNTS} from '@lib/accounts/constants';
import bytesToHex from '@helpers/bytes/bytesToHex';
import randomize from '@helpers/array/randomize';
import noop from '@helpers/noop';

type AccountDataChanges = Partial<AccountSessionData> | ((data: AccountSessionData) => Partial<AccountSessionData> | undefined);

export class AccountController extends StaticUtilityClass {
  // * the write in progress of each account: every update reads the whole data, merges and writes it
  // * back, so two at once would lose one of them
  private static updates: Map<ActiveAccountNumber, Promise<unknown>> = new Map();
  // * Set once the slots start moving after a log out, and never cleared: the worker is terminated
  // * right after, and until then every live writer still holds its old account number. A write that
  // * can be skipped (the temporary auth keys) checks it and writes nothing
  public static shifting: boolean;

  static async getTotalAccounts() {
    const promises = ([1, 2, 3, 4] as const).map((accountNumber) => this.get(accountNumber));
    const allAccountsData = await Promise.all(promises);
    return allAccountsData.filter((accountData) => !!accountData.userId).length;
  }

  static async getUnencryptedTotalAccounts() {
    return sessionStorage.get('number_of_accounts');
  }

  static async getUserIds() {
    const promises = ([1, 2, 3, 4] as const).map((accountNumber) => this.get(accountNumber));
    const allAccountsData = await Promise.all(promises);
    return allAccountsData.map((accountData) => accountData.userId).filter(Boolean);
  }

  static async get(accountNumber: ActiveAccountNumber, updating?: boolean) {
    const data = await sessionStorage.get(`account${accountNumber}`) || {} as AccountSessionData;

    if(!updating && this.fillMissingData(data)) {
      await this.update(accountNumber, data);
    }

    return data;
  }

  static fillMissingData(data: AccountSessionData) {
    return [
      this.fillFingerprint(data),
      this.fillPushKey(data)
    ].some(Boolean);
  }

  static fillFingerprint(data: AccountSessionData) {
    if(!data.auth_key_fingerprint) {
      const authKey = data[`dc${App.baseDcId}_auth_key`];
      if(!authKey) {
        return false;
      }

      data.auth_key_fingerprint = authKey ? authKey.slice(0, 8) : undefined;
      return true;
    }

    return false;
  }

  static fillPushKey(data: AccountSessionData) {
    if(!data.push_key && data.userId) {
      data.push_key = bytesToHex(randomize(new Uint8Array(256)));
      return true;
    }

    return false;
  }

  /**
   * One at a time per account. `changes` can be a function of the data as it is at that moment, and
   * can return `undefined` to write nothing
   */
  static update(accountNumber: ActiveAccountNumber, changes: AccountDataChanges, overrideAll = false) {
    const promise = (this.updates.get(accountNumber) || Promise.resolve())
    .catch(noop)
    .then(() => this.write(accountNumber, changes, overrideAll));
    this.updates.set(accountNumber, promise);
    return promise;
  }

  /**
   * Settles once the updates of the account asked for so far are written
   */
  static async whenUpdated(accountNumber: ActiveAccountNumber) {
    await this.updates.get(accountNumber)?.catch(noop);
  }

  private static async write(accountNumber: ActiveAccountNumber, changes: AccountDataChanges, overrideAll: boolean) {
    const prevData = await this.get(accountNumber, true);
    const data = typeof(changes) === 'function' ? changes(prevData) : changes;
    if(!data) {
      return prevData;
    }

    const updatedData = {
      ...(overrideAll ? {} : prevData),
      ...data
    };

    this.fillMissingData(updatedData);

    await sessionStorage.set({
      [`account${accountNumber}`]: updatedData
    });

    if(accountNumber === 1) {
      await this.updateStorageForLegacy(updatedData);
    }

    (async() => {
      sessionStorage.set({
        number_of_accounts: await this.getTotalAccounts()
      });
    })();

    return updatedData;
  }

  /**
   * Shifts 4 -> 3, 3 -> 2 ... depending on which account you need to delete
   * @param upTo Account to delete basically
   */
  static async shiftAccounts(upTo: ActiveAccountNumber) {
    this.shifting = true;
    // * what is already on its way to any of the moving slots lands first, then they move
    const slots: ActiveAccountNumber[] = [];
    for(let i = upTo; i <= MAX_ACCOUNTS; i++) {
      slots.push(i as ActiveAccountNumber);
    }

    await Promise.all(slots.map((accountNumber) => this.whenUpdated(accountNumber)));

    for(let i = upTo; i <= MAX_ACCOUNTS; i++) {
      await sessionStorage.delete(`account${i as ActiveAccountNumber}`);
      if(i < MAX_ACCOUNTS) {
        const toMove = await this.get((i + 1) as ActiveAccountNumber);
        toMove.userId && (await this.update(i as ActiveAccountNumber, toMove, true));
      }
    }
  }

  /**
   * Use `null` when needing to remove the values (e.g. when enabling passcode)
   */
  static async updateStorageForLegacy(accountData: Partial<AccountSessionData> | null) {
    if(accountData !== null && await DeferredIsUsingPasscode.isUsingPasscode()) return; // We can't expose keys if there's a passcode set

    if(accountData === null) accountData = {};

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

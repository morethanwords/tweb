import {MOUNT_CLASS_TO} from '@config/debug';
import App from '@config/app';
import Modes from '@config/modes';
import tsNow from '@helpers/tsNow';
import type {TrueDcId} from '@types';
import type {EmojiStatus, User} from '@layer';

import sessionStorage from '@lib/sessionStorage';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import StaticUtilityClass from '@lib/staticUtilityClass';

import {AccountSessionData, ActiveAccountNumber, SessionUserFields, StoredAccountSessionData} from '@lib/accounts/types';
import {MAX_ACCOUNTS} from '@lib/accounts/constants';
import bytesToHex from '@helpers/bytes/bytesToHex';
import randomize from '@helpers/array/randomize';
import noop from '@helpers/noop';

const ACCOUNT_NUMBERS: ActiveAccountNumber[] = [1, 2, 3, 4];
const SESSION_USER_FIELDS: (keyof SessionUserFields)[] = ['firstName', 'lastName', 'phone', 'color', 'isPremium', 'emojiStatusId'];

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
    return (await this.getAccounts()).length;
  }

  static async getUnencryptedTotalAccounts() {
    return sessionStorage.get('number_of_accounts');
  }

  /**
   * The signed-in accounts, by their slots. Web A keeps its accounts in the same slots and leaves one empty
   * when its account signs out, so they are not always the first ones; and its accounts of the test
   * servers are not K's (see isForeign)
   */
  static async getAccounts() {
    const accounts = await Promise.all(ACCOUNT_NUMBERS.map(async(accountNumber) => {
      return [accountNumber, await this.get(accountNumber)] as const;
    }));

    return accounts.filter(([, accountData]) => this.isSignedIn(accountData));
  }

  static async getAccountNumbers() {
    return (await this.getAccounts()).map(([accountNumber]) => accountNumber);
  }

  static async getUserIds() {
    return (await this.getAccounts()).map(([, accountData]) => accountData.userId);
  }

  /**
   * The slot a new account goes to: the first one nobody is signed in to here or in Web A
   */
  static async getFreeAccountNumber() {
    for(const accountNumber of ACCOUNT_NUMBERS) {
      const accountData = await this.get(accountNumber);
      if(!accountData.userId && !accountData.isTest) {
        return accountNumber;
      }
    }
  }

  static isSignedIn(accountData: AccountSessionData) {
    return !!accountData.userId && !this.isForeign(accountData);
  }

  /**
   * An account Web A has on the test servers, in a slot of production ones: this client can't use it, and
   * leaves it as it is
   */
  static isForeign(accountData: AccountSessionData) {
    return !!accountData.isTest && !Modes.test;
  }

  /**
   * Who the account is, as Web A writes it to the account's slot from its own user (useMultiaccountInfo): its
   * menu of accounts shows the accounts it has not opened yet from these
   */
  static getSessionUserFields(user: User.user): SessionUserFields {
    const emojiStatus = user.emoji_status as EmojiStatus.emojiStatus | EmojiStatus.emojiStatusCollectible;
    return {
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      color: user.color?._ === 'peerColor' ? user.color.color : undefined,
      isPremium: !!user.pFlags.premium,
      emojiStatusId: emojiStatus?.document_id ? '' + emojiStatus.document_id : undefined
    };
  }

  static isSameSessionUserFields(a: SessionUserFields, b: SessionUserFields) {
    return SESSION_USER_FIELDS.every((key) => a[key] === b[key]);
  }

  /**
   * What the slot has otherwise, or only what it lacks: Web A may have written there what is newer
   */
  static getSessionUserFieldsChanges(fields: SessionUserFields, slot: SessionUserFields, onlyMissing?: boolean) {
    const changes: Record<string, SessionUserFields[keyof SessionUserFields]> = {};
    for(const key of SESSION_USER_FIELDS) {
      if(fields[key] !== slot[key] && (!onlyMissing || slot[key] === undefined)) {
        changes[key] = fields[key];
      }
    }

    return Object.keys(changes).length ? changes as SessionUserFields : undefined;
  }

  static async get(accountNumber: ActiveAccountNumber, updating?: boolean) {
    const stored: StoredAccountSessionData = await sessionStorage.get(`account${accountNumber}`);
    const data = {...stored} as AccountSessionData;
    if(stored?.userId !== undefined) {
      data.userId = +stored.userId;
    }

    if(!updating && !this.isForeign(data) && this.fillMissingData(data)) {
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
    // * Web A's account of the other servers stays as Web A wrote it
    if(this.isForeign(prevData)) {
      return prevData;
    }

    const data = typeof(changes) === 'function' ? changes(prevData) : changes;
    if(!data) {
      return prevData;
    }

    const updatedData = {
      ...(overrideAll ? {} : prevData),
      ...data
    };

    this.fillMissingData(updatedData);

    // * as Web A writes and compares it
    const stored: StoredAccountSessionData = {...updatedData};
    if(updatedData.userId !== undefined) {
      stored.userId = '' + updatedData.userId;
    }

    await sessionStorage.set({
      [`account${accountNumber}`]: stored
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

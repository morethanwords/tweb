/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getDatabaseState} from '../../config/databases/state';
import {MAX_ACCOUNTS} from '../accounts/constants';
import {logger} from '../logger';
import AppStorage from '../storage';
import {ResetStoragesPromise} from './appStateManager';
import {AppManager} from './manager';
import {ActiveAccountNumber} from '../accounts/types';
import createStorages from './utils/storages/createStorages';
import loadStorages from './utils/storages/loadStorages';

export class AppStoragesManager extends AppManager {
  private storages: ReturnType<typeof createStorages>;
  private resetStoragesPromise: ResetStoragesPromise;
  private loadStoragesPromise: ReturnType<typeof loadStorages>;

  private log: ReturnType<typeof logger>;
  private _accountNumber: ActiveAccountNumber;

  constructor(accountNumber: ActiveAccountNumber, resetStoragesPromise: ResetStoragesPromise) {
    super();

    this.resetStoragesPromise = resetStoragesPromise;
    this.log = logger('STORAGES');
    this.storages = createStorages(accountNumber);
    this._accountNumber = accountNumber;
    // this.loadPromise = deferredPromise();
  }

  public loadStorages() {
    return (this.loadStoragesPromise ??= loadStorages(this._accountNumber, this.storages, this.resetStoragesPromise));
    // loadStorages(this.storages).then((storagesResults) => {
    // this.loadPromise.resolve(storagesResults);
    // });

    // return this.loadPromise;
  }

  // public setStoragesResults(storagesResults: StoragesResults) {
  //   this.loadPromise.resolve(storagesResults);
  // }

  public async loadStorage<T extends keyof AppStoragesManager['storages']>(name: T) {
    return this.loadStorages().then((storagesResults) => {
      return {
        storage: this.storages[name],
        results: storagesResults[name]
      };
    });
  }

  public static allStoreNames = getDatabaseState(1).stores.map((store) => store.name);

  public static async moveAccountStorages(fromAccount: ActiveAccountNumber, toAccount: ActiveAccountNumber) {
    const promises = this.allStoreNames.map(async(storeName) => {
      const sourceStorage = new AppStorage(getDatabaseState(fromAccount), storeName);
      const targetStorage = new AppStorage(getDatabaseState(toAccount), storeName);

      const sourceEntries = await sourceStorage.getAllEntries();

      if(sourceEntries.length)
        await targetStorage.set(Object.fromEntries(sourceEntries));
    });

    await Promise.all(promises);
  }

  public static async clearAllStoresForAccount(accountNumber: ActiveAccountNumber) {
    const promises = this.allStoreNames.map((storeName) => {
      const storage = new AppStorage(getDatabaseState(accountNumber), storeName);
      return storage.clear();
    });

    await Promise.all(promises);
  }

  /**
   * The session storage is populated by default for all accounts even if there is no user logged for them
   *
   * It's more for the case when there was a passcode activated so we don't leave the encrypted data there
   */
  public static async clearSessionStores() {
    const promises = ([/* 1, */2, 3, 4] as ActiveAccountNumber[]).map(async(accountNumber) => {
      const storage = new AppStorage(getDatabaseState(accountNumber), 'session');
      await storage.clear();
    });

    await Promise.all(promises);
  }

  public static async shiftStorages(upTo: ActiveAccountNumber) {
    for(let i = upTo; i <= MAX_ACCOUNTS; i++) {
      await this.clearAllStoresForAccount(i);
      if(i < MAX_ACCOUNTS) {
        await this.moveAccountStorages((i + 1) as ActiveAccountNumber, i as ActiveAccountNumber);
      }
    }
  }
}

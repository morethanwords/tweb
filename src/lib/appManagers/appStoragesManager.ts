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

  constructor(accountNumber: ActiveAccountNumber, resetStoragesPromise: ResetStoragesPromise) {
    super();

    this.resetStoragesPromise = resetStoragesPromise;
    this.log = logger('STORAGES');
    this.storages = createStorages(accountNumber);
    // this.loadPromise = deferredPromise();
  }

  public loadStorages() {
    return (this.loadStoragesPromise ??= loadStorages(this.storages, this.resetStoragesPromise));
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
    for(const storeName of this.allStoreNames) {
      const sourceStorage = new AppStorage(getDatabaseState(fromAccount), storeName);
      const targetStorage = new AppStorage(getDatabaseState(toAccount), storeName);

      const sourceEntries = await sourceStorage.getAllEntries();

      if(sourceEntries.length)
        await targetStorage.set(Object.fromEntries(sourceEntries));
    }
  }

  public static async clearAllStoresForAccount(accountNumber: ActiveAccountNumber) {
    for(const storeName of this.allStoreNames) {
      const storage = new AppStorage(getDatabaseState(accountNumber), storeName);
      await storage.clear();
    }
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

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {logger} from '../logger';
import {AppManager} from './manager';
import createStorages from './utils/storages/createStorages';
import loadStorages from './utils/storages/loadStorages';

export class AppStoragesManager extends AppManager {
  private storages: ReturnType<typeof createStorages>;

  // private loadPromise: CancellablePromise<StoragesResults>;

  private log: ReturnType<typeof logger>;

  constructor() {
    super();

    this.log = logger('STORAGES');
    this.storages = createStorages();
    // this.loadPromise = deferredPromise();
  }

  public loadStorages() {
    return loadStorages(this.storages);
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
}

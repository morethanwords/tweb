/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import App from '../../config/app';
import {MOUNT_CLASS_TO} from '../../config/debug';
import callbackify from '../../helpers/callbackify';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import appStateManager from './appStateManager';
import {AppStoragesManager} from './appStoragesManager';
import createManagers from './createManagers';

type Managers = Awaited<ReturnType<typeof createManagers>>;

export class AppManagersManager {
  private managers: Managers | Promise<Managers>;
  private cryptoWorkersURLs: string[];
  private cryptoPortsAttached: number;
  private cryptoPortPromise: CancellablePromise<void>;

  constructor() {
    this.cryptoWorkersURLs = [];
    this.cryptoPortsAttached = 0;
    this.cryptoPortPromise = deferredPromise();
    this.cryptoPortPromise.then(() => {
      this.cryptoPortPromise = undefined;
    });
  }

  public start() {
    const port = MTProtoMessagePort.getInstance<false>();

    port.addEventListener('manager', ({name, method, args}) => {
      return callbackify(this.getManagers(), (managers) => {
        // @ts-ignore
        const manager = managers[name];
        return manager[method](...args);
      });
    });

    port.addEventListener('cryptoPort', (payload, source, event) => {
      const port = event.ports[0];
      if(this.cryptoPortsAttached >= this.cryptoWorkersURLs.length) {
        port.close();
        return;
      }

      ++this.cryptoPortsAttached;
      cryptoMessagePort.attachPort(port);
      this.cryptoPortPromise?.resolve();
    });

    port.addEventListener('createProxyWorkerURLs', ({originalUrl, blob}) => {
      let length = this.cryptoWorkersURLs.length;
      if(!length) {
        this.cryptoWorkersURLs.push(originalUrl);
        ++length;
      }

      const maxLength = App.cryptoWorkers;
      if(length === maxLength) {
        return this.cryptoWorkersURLs;
      }

      const newURLs = new Array(maxLength - length).fill(undefined).map(() => URL.createObjectURL(blob));
      this.cryptoWorkersURLs.push(...newURLs);
      return this.cryptoWorkersURLs;
    });
  }

  private async createManagers() {
    const appStoragesManager = new AppStoragesManager();

    await Promise.all([
      // new Promise(() => {}),
      appStoragesManager.loadStorages(),
      this.cryptoPortPromise
    ]);

    const managers = await createManagers(appStoragesManager, appStateManager.userId);
    return this.managers = managers; // have to overwrite cached promise
  }

  public getManagers() {
    return this.managers ??= this.createManagers();
  }
}

const appManagersManager = new AppManagersManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appManagersManager = appManagersManager);
export default appManagersManager;

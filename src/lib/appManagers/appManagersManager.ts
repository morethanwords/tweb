/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ServiceMessagePort from '../serviceWorker/serviceMessagePort';
import App from '../../config/app';
import {MOUNT_CLASS_TO} from '../../config/debug';
import callbackify from '../../helpers/callbackify';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import {AppStoragesManager} from './appStoragesManager';
import createManagers from './createManagers';
import {ActiveAccountNumber} from '../accounts/types';
import AppStateManager from './appStateManager';
import rootScope from '../rootScope';
import AccountController from '../accounts/accountController';

type Managers = Awaited<ReturnType<typeof createManagers>>;

// for testing cases without video streaming
const CAN_USE_SERVICE_WORKER = true;

type ManagersByAccount = Record<ActiveAccountNumber, Managers>;
type StateManagersByAccount = Record<ActiveAccountNumber, AppStateManager>;

export class AppManagersManager {
  private managersByAccount: Promise<ManagersByAccount> | ManagersByAccount;
  public readonly stateManagersByAccount: StateManagersByAccount;
  private cryptoWorkersURLs: string[];
  private cryptoPortsAttached: number;
  private cryptoPortPromise: CancellablePromise<void>;

  private _isServiceWorkerOnline: boolean;

  private serviceMessagePort: ServiceMessagePort<true>;
  private _serviceMessagePort: MessagePort

  constructor() {
    this._isServiceWorkerOnline = CAN_USE_SERVICE_WORKER;

    this.cryptoWorkersURLs = [];
    this.cryptoPortsAttached = 0;
    this.cryptoPortPromise = deferredPromise();
    this.cryptoPortPromise.then(() => {
      this.cryptoPortPromise = undefined;
    });

    this.stateManagersByAccount = {
      1: new AppStateManager(1),
      2: new AppStateManager(2),
      3: new AppStateManager(3),
      4: new AppStateManager(4)
    };

    const managersByAccountAsArray = Object.values(this.stateManagersByAccount)

    managersByAccountAsArray.forEach((stateManager) => {
      stateManager.onSettingsUpdate = (settingsValue) => {
        managersByAccountAsArray.forEach((stateManagerToUpdate) => {
          if(stateManager !== stateManagerToUpdate)
            stateManagerToUpdate.updateLocalState('settings', settingsValue);
        });
      }
    })
  }

  public start() {
    const port = MTProtoMessagePort.getInstance<false>();

    port.addEventListener('manager', ({name, method, args, accountNumber}) => {
      return callbackify(this.getManagersByAccount(), (managersByAccount) => {
        const managers = managersByAccount[accountNumber];
        const manager = managers[name as keyof Managers];
        // @ts-ignore
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


    rootScope.addEventListener('account_logged_in', async({accountNumber, userId}) => {
      for(let i = 1; i < accountNumber; i++) {
        const otherAccountNumber = i as ActiveAccountNumber;
        const accountData = await AccountController.get(otherAccountNumber);
        if(accountData?.userId && accountData?.userId === userId) {
          const managersByAccount = await this.getManagersByAccount();
          managersByAccount[accountNumber].apiManager.logOut(otherAccountNumber);
        }
      }
    });
  }

  private async createManagers() {
    const promises = ([1, 2, 3, 4] as ActiveAccountNumber[]).map(async(accountNumber) => {
      const stateManager = this.stateManagersByAccount[accountNumber]
      const appStoragesManager = new AppStoragesManager(accountNumber, stateManager.resetStoragesPromise);

      await Promise.all([
        // new Promise(() => {}),
        appStoragesManager.loadStorages(),
        this.cryptoPortPromise
      ]);

      const managers = await createManagers(appStoragesManager, stateManager, accountNumber, stateManager.userId);

      return [
        accountNumber,
        managers
      ] as const;
    });

    const accountNumberToManagersPairs = await Promise.all(promises);
    this.managersByAccount = Object.fromEntries(accountNumberToManagersPairs) as ManagersByAccount;

    return this.managersByAccount;
  }

  public getManagersByAccount() {
    return this.managersByAccount ??= this.createManagers();
  }

  public get isServiceWorkerOnline() {
    return this._isServiceWorkerOnline;
  }

  public set isServiceWorkerOnline(value) {
    this._isServiceWorkerOnline = CAN_USE_SERVICE_WORKER ? value : false;
  }

  public getServiceMessagePort() {
    return this._isServiceWorkerOnline ? this.serviceMessagePort : undefined;
  }

  public onServiceWorkerPort(event: MessageEvent<any>) {
    if(this.serviceMessagePort) {
      this.serviceMessagePort.detachPort(this._serviceMessagePort);
      this._serviceMessagePort = undefined;
    } else {
      this.serviceMessagePort = new ServiceMessagePort();
      this.serviceMessagePort.addMultipleEventsListeners({
        requestFilePart: (payload) => {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            const {docId, dcId, offset, limit, accountNumber} = payload;
            return managersByAccount[accountNumber].appDocsManager.requestDocPart(docId, dcId, offset, limit);
          });
        },
        cancelFilePartRequests: ({docId, accountNumber}) => {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            return managersByAccount[accountNumber].appDocsManager.cancelDocPartsRequests(docId);
          });
        },
        requestRtmpState({call, accountNumber}) {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            return managersByAccount[accountNumber].appGroupCallsManager.fetchRtmpState(call);
          });
        },
        requestRtmpPart(payload) {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            const {request, dcId, accountNumber} = payload;
            return managersByAccount[accountNumber].appGroupCallsManager.fetchRtmpPart(request, dcId);
          });
        },
        requestDoc(payload) {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            const {docId, accountNumber} = payload;
            return managersByAccount[accountNumber].appDocsManager.getDoc(docId);
          });
        },
        downloadDoc(payload) {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            const {docId, accountNumber} = payload;
            const appDocsManager = managersByAccount[accountNumber].appDocsManager;
            const doc = appDocsManager.getDoc(docId);
            return appDocsManager.downloadDoc(doc);
          });
        },
        requestAltDocsByDoc(payload) {
          return callbackify(appManagersManager.getManagersByAccount(), (managersByAccount) => {
            const {docId, accountNumber} = payload;
            const {appDocsManager} = managersByAccount[accountNumber];
            return appDocsManager.getAltDocsByDocument(docId);
          });
        }
      });
    }

    // * port can be undefined in the future
    if(this._serviceMessagePort = event.ports[0]) {
      this.serviceMessagePort.attachPort(this._serviceMessagePort);
    }
  }
}

const appManagersManager = new AppManagersManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appManagersManager = appManagersManager);
export default appManagersManager;

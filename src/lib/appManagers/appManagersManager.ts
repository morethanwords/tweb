/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ServiceMessagePort from '@lib/serviceWorker/serviceMessagePort';
import App from '@config/app';
import {MOUNT_CLASS_TO} from '@config/debug';
import callbackify from '@helpers/callbackify';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import rlottieMessagePort from '@lib/rlottie/rlottieMessagePort';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import {AppStoragesManager} from '@appManagers/appStoragesManager';
import createManagers from '@appManagers/createManagers';
import {ActiveAccountNumber} from '@lib/accounts/types';
import AppStateManager from '@appManagers/appStateManager';
import rootScope from '@lib/rootScope';
import AccountController from '@lib/accounts/accountController';
import pushSingleManager from '@appManagers/pushSingleManager';
import Modes from '@config/modes';
import SuperMessagePort from '@lib/superMessagePort';

type Managers = Awaited<ReturnType<typeof createManagers>>;

// for testing cases without video streaming
const CAN_USE_SERVICE_WORKER = !Modes.noServiceWorker;

type ManagersByAccount = Record<ActiveAccountNumber, Managers>;
type StateManagersByAccount = Record<ActiveAccountNumber, AppStateManager>;

type ThreadedSharedWorker = {
  urls: string[],
  attached: number,
  promise: CancellablePromise<void>,
  superMessagePort?: SuperMessagePort<any, any, any>,
  threads: number
};

export const THREADED_WORKERS_TYPES = ['crypto', 'rlottie'] as const;
export type ThreadedWorkerType = typeof THREADED_WORKERS_TYPES[number];

export class AppManagersManager {
  private managersByAccount: Promise<ManagersByAccount> | ManagersByAccount;
  public readonly stateManagersByAccount: StateManagersByAccount;
  private threadedSharedWorkers: {[type in ThreadedWorkerType]?: ThreadedSharedWorker};

  private _isServiceWorkerOnline: boolean;

  private serviceMessagePort: ServiceMessagePort<true>;
  private _serviceMessagePort: MessagePort

  constructor() {
    this._isServiceWorkerOnline = CAN_USE_SERVICE_WORKER;

    this.threadedSharedWorkers = {};
    for(
      const {type, superMessagePort, threads} of THREADED_WORKERS_TYPES.map((type) => {
        return {
          type,
          superMessagePort: type === 'crypto' ? cryptoMessagePort : rlottieMessagePort,
          threads: type === 'crypto' ? App.cryptoWorkers : App.lottieWorkers
        };
      })
    ) {
      this.threadedSharedWorkers[type] = {
        urls: [],
        attached: 0,
        promise: deferredPromise(),
        superMessagePort,
        threads
      };

      this.threadedSharedWorkers[type].promise.then(() => {
        this.threadedSharedWorkers[type].promise = undefined;
      });
    }

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
        if(accountNumber === undefined) {
          const results: any[] = [];
          for(const accountNumber in managersByAccount) {
            const managers = managersByAccount[+accountNumber as any as ActiveAccountNumber];
            const manager = managers[name as keyof Managers];
            // @ts-ignore
            results.push(manager[method](...args));
          }

          return results.some((result) => result instanceof Promise) ? Promise.all(results) : results;
        }

        const managers = managersByAccount[accountNumber];
        const manager = managers[name as keyof Managers];
        // @ts-ignore
        return manager[method](...args);
      });
    });

    port.addEventListener('threadedPort', (type, source, event) => {
      const threadedWorker = this.threadedSharedWorkers[type];
      const port = event.ports[0];
      if(threadedWorker.attached >= threadedWorker.urls.length) {
        port.close();
        return;
      }

      ++threadedWorker.attached;
      threadedWorker.superMessagePort.attachPort(port);
      threadedWorker.promise?.resolve();
    });

    port.addEventListener('createProxyWorkerURLs', ({originalUrl, blob, type}) => {
      const {urls, threads} = this.threadedSharedWorkers[type];
      let length = urls.length;
      if(!length) {
        urls.push(originalUrl);
        ++length;
      }

      const maxLength = threads;
      if(length === maxLength) {
        return urls;
      }

      const newURLs = new Array(maxLength - length).fill(undefined).map(() => URL.createObjectURL(blob));
      urls.push(...newURLs);
      return urls;
    });

    rootScope.addEventListener('account_logged_in', async({accountNumber, userId}) => {
      for(let i = 1; i < accountNumber; i++) {
        const otherAccountNumber = i as ActiveAccountNumber;
        const accountData = await AccountController.get(otherAccountNumber);
        if(accountData.userId === userId) {
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
        this.threadedSharedWorkers.crypto.promise
      ]);

      const managers = await createManagers(
        appStoragesManager,
        stateManager,
        accountNumber,
        stateManager.userId
      );

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
        },
        decryptPush(payload) {
          return pushSingleManager.decryptPush(payload.p, payload.keyIdBase64);
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

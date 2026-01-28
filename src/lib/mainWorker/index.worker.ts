/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// just to include
import '@lib/polyfill';
import '@helpers/peerIdPolyfill';

import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import {setEnvironment} from '@environment/utils';
import transportController from '@lib/mtproto/transports/controller';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import appManagersManager from '@appManagers/appManagersManager';
import listenMessagePort from '@helpers/listenMessagePort';
import {logger} from '@lib/logger';
import toggleStorages from '@helpers/toggleStorages';
import appTabsManager from '@appManagers/appTabsManager';
import callbackify from '@helpers/callbackify';
import Modes from '@config/modes';
import {ActiveAccountNumber} from '@lib/accounts/types';
import commonStateStorage from '@lib/commonStateStorage';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import AppStorage from '@lib/storage';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import sessionStorage from '@lib/sessionStorage';
import CacheStorageController from '@lib/files/cacheStorage';
import {ApiManager} from '@appManagers/apiManager';
import {useAutoLock} from '@lib/mainWorker/useAutoLock';
import pushSingleManager from '@appManagers/pushSingleManager';
import {createBroadcastChannelWrapper} from '@lib/broadcastChannelWrapper';
import {MainBroadcastChannelEvents, unversionedMainBroadcastChannelName} from '@config/broadcastChannel';


const log = logger('MTPROTO');
// let haveState = false;

const port = new MTProtoMessagePort<false>();

const mainBroadcastChannel = createBroadcastChannelWrapper<MainBroadcastChannelEvents>(unversionedMainBroadcastChannelName);

let isLocked = true;

const singleManagers = {
  [pushSingleManager.name]: pushSingleManager
};

port.addMultipleEventsListeners({
  environment: (environment) => {
    setEnvironment(environment);

    if(import.meta.env.VITE_MTPROTO_AUTO && Modes.multipleTransports) {
      transportController.waitForWebSocket();
    }
  },

  crypto: ({method, args}) => {
    return cryptoWorker.invokeCrypto(method as any, ...args as any);
  },

  state: ({state, resetStorages, pushedKeys, newVersion, oldVersion, userId, accountNumber, common, refetchStorages}) => {
    // if(haveState) {
    //   return;
    // }

    log('got state', accountNumber, state, pushedKeys);

    const appStateManager = appManagersManager.stateManagersByAccount[accountNumber];
    appStateManager.userId = userId;
    appStateManager.newVersion = newVersion;
    appStateManager.oldVersion = oldVersion;

    // * preserve self user
    if(userId && resetStorages.has('users')) {
      resetStorages.set('users', [userId]);
    }

    appStateManager.resetStoragesPromise.resolve({
      storages: resetStorages,
      refetch: refetchStorages,
      callback: async() => {
        const promises: Promise<any>[] = [];

        const map: Map<string, any> = new Map();
        const pushedKeysCombined: string[] = [...pushedKeys];
        if(accountNumber === 1) {
          for(const key in common) {
            map.set(key, common[key as keyof typeof common]);
            pushedKeysCombined.push(key as any); // ! unoptimized, but it's ok for now since it's only one key
          }
        }

        for(const key in state) {
          map.set(key, state[key as keyof typeof state]);
        }

        for(const [key, value] of map) {
          const promise = appStateManager.pushToState(key as any, value, true, !pushedKeysCombined.includes(key));
          promises.push(promise);
        }

        await Promise.all(promises);
      }
    });
    // haveState = true;
  },

  toggleStorages: ({enabled, clearWrite}) => {
    return toggleStorages(enabled, clearWrite);
  },

  event: (payload, source) => {
    log('will redirect event', payload, source);
    port.invokeExceptSource('event', payload, source);
  },

  serviceWorkerOnline: (online) => {
    appManagersManager.isServiceWorkerOnline = online;
  },

  serviceWorkerPort: (payload, source, event) => {
    appManagersManager.onServiceWorkerPort(event);
    port.invokeVoid('receivedServiceMessagePort', undefined, source);
  },

  createObjectURL: (blob) => {
    return URL.createObjectURL(blob);
  },

  setInterval: (timeout) => {
    const intervalId = setInterval(() => {
      port.invokeVoid('intervalCallback', intervalId);
    }, timeout) as any as number;

    return intervalId;
  },

  clearInterval: (intervalId) => {
    clearInterval(intervalId);
  },

  terminate: () => {
    selfTerminate();
  },

  toggleUsingPasscode: async(payload, source) => {
    DeferredIsUsingPasscode.resolveDeferred(payload.isUsingPasscode);
    EncryptionKeyStore.save(payload.encryptionKey);

    await Promise.all([
      AppStorage.toggleEncryptedForAll(payload.isUsingPasscode),
      payload.isUsingPasscode ?
        sessionStorage.encryptEncryptable() :
        sessionStorage.decryptEncryptable()
    ]);

    pushSingleManager.registerAgain();

    await port.invokeExceptSourceAsync('toggleUsingPasscode', payload, source);

    isLocked = false;
  },

  changePasscode: async({toStore, encryptionKey}, source) => {
    await commonStateStorage.set({passcode: toStore});

    EncryptionKeyStore.save(encryptionKey);
    await Promise.all([
      AppStorage.reEncryptEncrypted(),
      sessionStorage.reEncryptEncryptable()
    ]);

    await port.invokeExceptSourceAsync('saveEncryptionKey', encryptionKey, source);
  },

  isLocked: async(_, source) => {
    const isUsingPasscode = await DeferredIsUsingPasscode.isUsingPasscode();
    if(isUsingPasscode) {
      if(!isLocked) {
        await port.invoke('saveEncryptionKey', await EncryptionKeyStore.get(), undefined, source);
      }
      return isLocked;
    }

    return false;
  },

  toggleLockOthers: (value, source) => {
    isLocked = value;
    port.invokeExceptSource('toggleLock', value, source);
  },

  saveEncryptionKey: async(payload, source) => {
    EncryptionKeyStore.save(payload);
    isLocked = false;
    await port.invokeExceptSourceAsync('saveEncryptionKey', payload, source);
  },

  localStorageEncryptedProxy: (payload) => {
    return sessionStorage.encryptedStorageProxy(payload.type, ...payload.args);
  },

  toggleCacheStorage: async(enabled: boolean, source) => {
    CacheStorageController.temporarilyToggle(enabled);
    await port.invokeExceptSourceAsync('toggleCacheStorage', enabled, source);
  },

  resetEncryptableCacheStorages: () => {
    CacheStorageController.resetOpenEncryptableCacheStorages();
  },

  forceLogout: async() => {
    await ApiManager.forceLogOutAll();
  },

  toggleUninteruptableActivity: ({activity, active}, source) => {
    autoLockControls.toggleUninteruptableActivity(source, activity, active);
  },

  singleManager: (payload) => {
    const manager = singleManagers[payload.name];
    // @ts-ignore
    return manager[payload.method](...payload.args);
  },

  disableCacheStoragesByNames: (names) => {
    CacheStorageController.temporarilyToggleByNames(names, false);
  },

  enableCacheStoragesByNames: (names) => {
    CacheStorageController.temporarilyToggleByNames(names, true);
  },

  resetOpenCacheStoragesByNames: (names) => {
    CacheStorageController.resetOpenStoragesByNames(names);
  }

  // socketProxy: (task) => {
  //   const socketTask = task.payload;
  //   const id = socketTask.id;

  //   const socketProxied = socketsProxied.get(id);
  //   if(socketTask.type === 'message') {
  //     socketProxied.dispatchEvent('message', socketTask.payload);
  //   } else if(socketTask.type === 'open') {
  //     socketProxied.dispatchEvent('open');
  //   } else if(socketTask.type === 'close') {
  //     socketProxied.dispatchEvent('close');
  //     socketsProxied.delete(id);
  //   }
  // },
});

log('MTProto start');

appManagersManager.start();
appManagersManager.getManagersByAccount();
appTabsManager.start();

let isFirst = true;

function resetNotificationsCount() {
  commonStateStorage.set({
    notificationsCount: {}
  });
}

const autoLockControls = useAutoLock({
  getIsLocked: () => isLocked,
  onLock: () => {
    mainBroadcastChannel.emitVoid('reload');
    selfTerminate();
  },
  getPort: () => port
});

appTabsManager.onTabStateChange = () => {
  const tabs = appTabsManager.getTabs();
  const areAllIdle = tabs.every((tab) => !!tab.state.idleStartTime);

  autoLockControls.setAreAllIdle(areAllIdle);
  if(!tabs.length && DeferredIsUsingPasscode.isUsingPasscodeUndeferred()) {
    selfTerminate();
  }
};

listenMessagePort(port, (source) => {
  appTabsManager.addTab(source);
  if(isFirst) {
    isFirst = false;
    resetNotificationsCount();
    // port.invoke('log', 'Shared worker first connection')
  } else {
    callbackify(appManagersManager.getManagersByAccount(), (managers) => {
      for(const key in managers) {
        const accountNumber = key as any as ActiveAccountNumber
        managers[accountNumber].thumbsStorage.mirrorAll(source);
        managers[accountNumber].appPeersManager.mirrorAllPeers(source);
        managers[accountNumber].appMessagesManager.mirrorAllMessages(source);
      }
    });
  }

  // port.invokeVoid('hello', undefined, source);
  // if(!sentHello) {
  //   port.invokeVoid('hello', undefined, source);
  //   sentHello = true;
  // }
}, (source) => {
  appTabsManager.deleteTab(source);
  autoLockControls.removeTab(source);
});


function selfTerminate() {
  if(typeof(SharedWorkerGlobalScope) !== 'undefined') {
    self.close();
  }
}

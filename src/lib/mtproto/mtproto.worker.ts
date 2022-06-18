/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// just to include
import '../polyfill';
import '../../helpers/peerIdPolyfill';

import cryptoWorker from "../crypto/cryptoMessagePort";
import CacheStorageController from '../cacheStorage';
import { setEnvironment } from '../../environment/utils';
import appStateManager from '../appManagers/appStateManager';
import transportController from './transports/controller';
import MTProtoMessagePort from './mtprotoMessagePort';
import RESET_STORAGES_PROMISE from '../appManagers/utils/storages/resetStoragesPromise';
import appManagersManager from '../appManagers/appManagersManager';
import listenMessagePort from '../../helpers/listenMessagePort';

let _isServiceWorkerOnline = true;
export function isServiceWorkerOnline() {
  return _isServiceWorkerOnline;
}

const port = new MTProtoMessagePort<false>();
port.addMultipleEventsListeners({
  environment: (environment) => {
    setEnvironment(environment);
    
    transportController.waitForWebSocket();
  },

  crypto: ({method, args}) => {
    return cryptoWorker.invokeCrypto(method as any, ...args as any);
  },

  state: ({state, resetStorages, pushedKeys, newVersion, oldVersion, userId}) => {
    appStateManager.userId = userId;
    appStateManager.newVersion = newVersion;
    appStateManager.oldVersion = oldVersion;
    appStateManager.setState(state);
    for(const key of pushedKeys) {
      appStateManager.setKeyValueToStorage(key);
    }

    RESET_STORAGES_PROMISE.resolve(resetStorages);
  },

  toggleStorage: (enabled) => {
    // AppStorage.toggleStorage(enabled);
    CacheStorageController.toggleStorage(enabled);
  },

  event: (payload, source) => {
    console.log('will redirect event', payload, source);
    port.invokeExceptSource('event', payload, source);
  },

  serviceWorkerOnline: (online) => {
    _isServiceWorkerOnline = online;
  },

  createObjectURL: (blob) => {
    return URL.createObjectURL(blob);
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

  // refreshReference: (task: RefreshReferenceTaskResponse) => {
  //   const hex = bytesToHex(task.originalPayload);
  //   const r = apiFileManager.refreshReferencePromises[hex];
  //   const deferred = r?.deferred;
  //   if(deferred) {
  //     if(task.error) {
  //       deferred.reject(task.error);
  //     } else {
  //       deferred.resolve(task.payload);
  //     }
  //   }
  // },
});

console.log('MTProto start');

appManagersManager.start();
appManagersManager.getManagers();

listenMessagePort(port);

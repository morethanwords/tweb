/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { RequestFilePartTask, RequestFilePartTaskResponse, ServiceWorkerTask } from '../serviceWorker/index.service';
import type { Awaited, WorkerTaskVoidTemplate } from '../../types';
import { CryptoMethods } from '../crypto/crypto_methods';
import rootScope from '../rootScope';
import webpWorkerController from '../webp/webpWorkerController';
import { MOUNT_CLASS_TO } from '../../config/debug';
import sessionStorage from '../sessionStorage';
import webPushApiManager from './webPushApiManager';
import AppStorage from '../storage';
import appRuntimeManager from '../appManagers/appRuntimeManager';
import telegramMeWebManager from './telegramMeWebManager';
import { CacheStorageDbName } from '../cacheStorage';
import pause from '../../helpers/schedulers/pause';
import isObject from '../../helpers/object/isObject';
import ENVIRONMENT from '../../environment';
import loadState from '../appManagers/utils/state/loadState';
import opusDecodeController from '../opusDecodeController';
import MTProtoMessagePort from './mtprotoMessagePort';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import SuperMessagePort from './superMessagePort';
import IS_SHARED_WORKER_SUPPORTED from '../../environment/sharedWorkerSupport';
import type { State } from '../../config/state';

export interface ToggleStorageTask extends WorkerTaskVoidTemplate {
  type: 'toggleStorage',
  payload: boolean
};

export type Mirrors = {
  state: State
};

export type MirrorTaskPayload<T extends keyof Mirrors = keyof Mirrors, K extends keyof Mirrors[T] = keyof Mirrors[T], J extends Mirrors[T][K] = Mirrors[T][K]> = {
  name: T, 
  key?: K, 
  value: any
};

class ApiManagerProxy extends MTProtoMessagePort {
  private worker: /* Window */Worker;
  private isSWRegistered: boolean;
  // private sockets: Map<number, Socket> = new Map();
  private taskListenersSW: {[taskType: string]: (task: any) => void};
  private mirrors: Mirrors;

  public newVersion: string;
  public oldVersion: string;

  constructor() {
    super();

    this.isSWRegistered = true;
    this.taskListenersSW = {};
    this.mirrors = {} as any;

    this.log('constructor');

    /// #if !MTPROTO_SW
    this.registerWorker();
    /// #endif

    this.registerServiceWorker();
    this.registerCryptoWorker();

    this.addMultipleEventsListeners({
      convertWebp: ({fileName, bytes}) => {
        return webpWorkerController.convert(fileName, bytes);
      },

      convertOpus: ({fileName, bytes}) => {
        return opusDecodeController.pushDecodeTask(bytes, false).then((result) => result.bytes);
      },

      event: ({name, args}) => {
        // @ts-ignore
        rootScope.dispatchEventSingle(name, ...args);
      },

      localStorageProxy: (payload) => {
        const storageTask = payload;
        return (sessionStorage[storageTask.type] as any)(...storageTask.args);
      },
      
      mirror: this.onMirrorTask
    });

    // this.addTaskListener('socketProxy', (task) => {
    //   const socketTask = task.payload;
    //   const id = socketTask.id;
    //   //console.log('socketProxy', socketTask, id);

    //   if(socketTask.type === 'send') {
    //     const socket = this.sockets.get(id);
    //     socket.send(socketTask.payload);
    //   } else if(socketTask.type === 'close') { // will remove from map in onClose
    //     const socket = this.sockets.get(id);
    //     socket.close();
    //   } else if(socketTask.type === 'setup') {
    //     const socket = new Socket(socketTask.payload.dcId, socketTask.payload.url, socketTask.payload.logSuffix);
        
    //     const onOpen = () => {
    //       //console.log('socketProxy onOpen');
    //       this.postMessage({
    //         type: 'socketProxy', 
    //         payload: {
    //           type: 'open',
    //           id
    //         }
    //       });
    //     };
    //     const onClose = () => {
    //       this.postMessage({
    //         type: 'socketProxy', 
    //         payload: {
    //           type: 'close',
    //           id
    //         }
    //       });

    //       socket.removeEventListener('open', onOpen);
    //       socket.removeEventListener('close', onClose);
    //       socket.removeEventListener('message', onMessage);
    //       this.sockets.delete(id);
    //     };
    //     const onMessage = (buffer: ArrayBuffer) => {
    //       this.postMessage({
    //         type: 'socketProxy', 
    //         payload: {
    //           type: 'message',
    //           id,
    //           payload: buffer
    //         }
    //       });
    //     };

    //     socket.addEventListener('open', onOpen);
    //     socket.addEventListener('close', onClose);
    //     socket.addEventListener('message', onMessage);
    //     this.sockets.set(id, socket);
    //   }
    // });

    rootScope.addEventListener('language_change', (language) => {
      rootScope.managers.networkerFactory.setLanguage(language);
    });

    window.addEventListener('online', () => {
      rootScope.managers.networkerFactory.forceReconnectTimeout();
    });

    rootScope.addEventListener('logging_out', () => {
      const toClear: CacheStorageDbName[] = ['cachedFiles', 'cachedStreamChunks'];
      Promise.all([
        AppStorage.toggleStorage(false), 
        sessionStorage.clear(),
        Promise.race([
          telegramMeWebManager.setAuthorized(false),
          pause(3000)
        ]),
        webPushApiManager.forceUnsubscribe(),
        Promise.all(toClear.map((cacheName) => caches.delete(cacheName)))
      ]).finally(() => {
        appRuntimeManager.reload();
      });
    });

    this.log('Passing environment:', ENVIRONMENT);
    this.invoke('environment', ENVIRONMENT);
    this.sendState();
    // setTimeout(() => {
    //   this.getConfig();
    // }, 5000);
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;
    
    // ! I hate webpack - it won't load it by using worker.register, only navigator.serviceWork will do it.
    const worker = navigator.serviceWorker;
    navigator.serviceWorker.register(
      /* webpackChunkName: "sw" */
      new URL('../serviceWorker/index.service', import.meta.url), 
      {scope: './'}
    ).then((registration) => {
      this.log('SW registered', registration);
      this.isSWRegistered = true;

      const sw = registration.installing || registration.waiting || registration.active;
      sw.addEventListener('statechange', (e) => {
        this.log('SW statechange', e);
      });

      //this.postSWMessage = worker.controller.postMessage.bind(worker.controller);

      /// #if MTPROTO_SW
      const controller = worker.controller || registration.installing || registration.waiting || registration.active;
      this.onWorkerFirstMessage(controller);
      /// #endif
    }, (err) => {
      this.isSWRegistered = false;
      this.log.error('SW registration failed!', err);

      this.invokeVoid('serviceWorkerOnline', false);
    });

    worker.addEventListener('controllerchange', () => {
      this.log.warn('controllerchange');

      worker.controller.addEventListener('error', (e) => {
        this.log.error('controller error:', e);
      });
    });

    /// #if MTPROTO_SW
    this.attachListenPort(worker);
    // this.s();
    /// #else
    worker.addEventListener('message', (e) => {
      const task: ServiceWorkerTask = e.data;
      if(!isObject(task)) {
        return;
      }

      const callback = this.taskListenersSW[task.type];
      if(callback) {
        callback(task);
      }
    });

    this.addServiceWorkerTaskListener('requestFilePart', (task: RequestFilePartTask) => {
      const responseTask: RequestFilePartTaskResponse = {
        type: task.type,
        id: task.id
      };

      const {docId, dcId, offset, limit} = task.payload;
      rootScope.managers.appDocsManager.requestDocPart(docId, dcId, offset, limit)
      .then((uploadFile) => {
        responseTask.payload = uploadFile;
        this.postSWMessage(responseTask);
      }, (err) => {
        responseTask.originalPayload = task.payload;
        responseTask.error = err;
        this.postSWMessage(responseTask);
      });
    });
    /// #endif

    worker.addEventListener('messageerror', (e) => {
      this.log.error('SW messageerror:', e);
    });
  }

  private registerCryptoWorker() {
    let worker: SharedWorker | Worker;
    if(IS_SHARED_WORKER_SUPPORTED) {
      worker = new SharedWorker(
        /* webpackChunkName: "crypto.worker" */
        new URL('../crypto/crypto.worker.ts', import.meta.url), 
        {type: 'module'}
      );
    } else {
      worker = new Worker(
        /* webpackChunkName: "crypto.worker" */
        new URL('../crypto/crypto.worker.ts', import.meta.url), 
        {type: 'module'}
      );
    }

    cryptoMessagePort.addEventListener('port', (payload, source, event) => {
      this.invokeVoid('cryptoPort', undefined, undefined, [event.ports[0]]);
    });

    this.attachWorkerToPort(worker, cryptoMessagePort, 'crypto');
  }

  /// #if !MTPROTO_SW
  private registerWorker() {
    // return;

    let worker: SharedWorker | Worker;
    if(IS_SHARED_WORKER_SUPPORTED) {
      worker = new SharedWorker(
        /* webpackChunkName: "mtproto.worker" */
        new URL('./mtproto.worker.ts', import.meta.url), 
        {type: 'module'}
      );
    } else {
      worker = new Worker(
        /* webpackChunkName: "mtproto.worker" */
        new URL('./mtproto.worker.ts', import.meta.url), 
        {type: 'module'}
      );
    }

    this.onWorkerFirstMessage(worker);
  }
  /// #endif

  private attachWorkerToPort(worker: SharedWorker | Worker, messagePort: SuperMessagePort<any, any, any>, type: string) {
    const port: MessagePort = (worker as SharedWorker).port || worker as any;
    messagePort.attachPort(port);

    worker.addEventListener('error', (err) => {
      this.log.error(type, 'worker error', err);
    });
  }

  public postSWMessage(message: any) {
    if(navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  // protected s() {
  //   const originalPostMessage = this.postMessage;
  //   const postQueue: any[] = [];
  //   this.postMessage = (source, task) => {
  //     if(task.type === 'invoke' && task.payload.type === 'state') {
  //       this.postMessage = originalPostMessage;
  //       postQueue.unshift(task);
  //       postQueue.forEach((task) => this.postMessage(undefined, task));
  //       postQueue.length = 0;
  //     } else {
  //       postQueue.push(task);
  //     }
  //   };
  // }

  private onWorkerFirstMessage(worker: any) {
    this.log('set webWorker');
    // return;
    
    this.worker = worker;
    /// #if MTPROTO_SW
    this.attachSendPort(worker);
    /// #else
    this.attachWorkerToPort(worker, this, 'mtproto');
    // this.s();
    // port.addEventListener('message', () => {
    //   this.registerServiceWorker();
    // }, {once: true});
    /// #endif

    // this.startSendingWindowSize();
  }

  public addServiceWorkerTaskListener(name: keyof ApiManagerProxy['taskListenersSW'], callback: ApiManagerProxy['taskListenersSW'][typeof name]) {
    this.taskListenersSW[name] = callback;
  }

  // private startSendingWindowSize() {
  //   const sendWindowSize = () => {
  //     this.invoke('windowSize', {width: windowSize.width, height: windowSize.height});
  //   };

  //   mediaSizes.addEventListener('resize', sendWindowSize);
  //   sendWindowSize();
  // }

  private sendState() {
    return Promise.all([
      loadState(),
      // loadStorages(createStorages()),
    ]).then(([stateResult/* , storagesResults */]) => {
      this.newVersion = stateResult.newVersion;
      this.oldVersion = stateResult.oldVersion;
      this.mirrors['state'] = stateResult.state;
      this.invoke('state', {...stateResult, userId: rootScope.myId.toUserId()});
    });
  }

  /// #if MTPROTO_WORKER
  public invokeCrypto<Method extends keyof CryptoMethods>(method: Method, ...args: Parameters<CryptoMethods[typeof method]>): Promise<Awaited<ReturnType<CryptoMethods[typeof method]>>> {
    return cryptoMessagePort.invokeCrypto(method, ...args);
  }
  /// #endif

  public toggleStorage(enabled: boolean) {
    const task: ToggleStorageTask = {type: 'toggleStorage', payload: enabled};
    this.invoke('toggleStorage', enabled);
    this.postSWMessage(task);
  }

  public async getMirror<T extends keyof Mirrors>(name: T) {
    const mirror = this.mirrors[name];
    return mirror;
  }

  public getState() {
    return this.getMirror('state');
  }

  private onMirrorTask = (payload: MirrorTaskPayload) => {
    const {name, key, value} = payload;
    if(!payload.hasOwnProperty('key')) {
      this.mirrors[name] = value;
      return;
    }
    
    const mirror = this.mirrors[name] ??= {} as any;
    if(value === undefined) {
      delete mirror[key];
    } else {
      mirror[key] = value;
    }
  };
}

interface ApiManagerProxy extends MTProtoMessagePort<true> {}

const apiManagerProxy = new ApiManagerProxy();
MOUNT_CLASS_TO.apiManagerProxy = apiManagerProxy;
export default apiManagerProxy;

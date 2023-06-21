/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Awaited} from '../../types';
import type {CacheStorageDbName} from '../files/cacheStorage';
import type {State} from '../../config/state';
import type {Message, MessagePeerReaction, PeerNotifySettings} from '../../layer';
import type {CryptoMethods} from '../crypto/crypto_methods';
import rootScope from '../rootScope';
import webpWorkerController from '../webp/webpWorkerController';
import {MOUNT_CLASS_TO} from '../../config/debug';
import sessionStorage from '../sessionStorage';
import webPushApiManager from './webPushApiManager';
import appRuntimeManager from '../appManagers/appRuntimeManager';
import telegramMeWebManager from './telegramMeWebManager';
import pause from '../../helpers/schedulers/pause';
import ENVIRONMENT from '../../environment';
import loadState from '../appManagers/utils/state/loadState';
import opusDecodeController from '../opusDecodeController';
import MTProtoMessagePort from './mtprotoMessagePort';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import SuperMessagePort from './superMessagePort';
import IS_SHARED_WORKER_SUPPORTED from '../../environment/sharedWorkerSupport';
import toggleStorages from '../../helpers/toggleStorages';
import idleController from '../../helpers/idleController';
import ServiceMessagePort from '../serviceWorker/serviceMessagePort';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import {makeWorkerURL} from '../../helpers/setWorkerProxy';
import ServiceWorkerURL from '../../../sw?worker&url';

export type Mirrors = {
  state: State
};

export type MirrorTaskPayload<T extends keyof Mirrors = keyof Mirrors, K extends keyof Mirrors[T] = keyof Mirrors[T], J extends Mirrors[T][K] = Mirrors[T][K]> = {
  name: T,
  key?: K,
  value: any
};

export type NotificationBuildTaskPayload = {
  message: Message.message | Message.messageService,
  fwdCount?: number,
  peerReaction?: MessagePeerReaction,
  peerTypeNotifySettings?: PeerNotifySettings
};

export type TabState = {
  chatPeerIds: PeerId[],
  idleStartTime: number,
};

class ApiManagerProxy extends MTProtoMessagePort {
  // private worker: /* Window */Worker;
  // private sockets: Map<number, Socket> = new Map();
  private mirrors: Mirrors;

  public newVersion: string;
  public oldVersion: string;

  private tabState: TabState;

  public share: ShareData;

  private serviceMessagePort: ServiceMessagePort<true>;
  private lastServiceWorker: ServiceWorker;

  private pingServiceWorkerPromise: CancellablePromise<void>;

  constructor() {
    super();

    this.mirrors = {} as any;
    this.tabState = {
      chatPeerIds: [],
      idleStartTime: 0
    };

    this.log('constructor');

    if(!import.meta.env.VITE_MTPROTO_SW) {
      this.registerWorker();
    }

    this.registerServiceWorker();
    this.registerCryptoWorker();

    // const perf = performance.now();
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

      // hello: () => {
      //   this.log.error('time hello', performance.now() - perf);
      // }
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
        toggleStorages(false, true),
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

    idleController.addEventListener('change', (idle) => {
      this.updateTabStateIdle(idle);
    });
    this.updateTabStateIdle(idleController.isIdle);

    this.log('Passing environment:', ENVIRONMENT);
    this.invoke('environment', ENVIRONMENT);
    // this.sendState();
  }

  public pingServiceWorkerWithIframe() {
    if(this.pingServiceWorkerPromise) {
      return this.pingServiceWorkerPromise;
    }

    const promise = this.pingServiceWorkerPromise = deferredPromise<void>();
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    const onLoad = () => {
      setTimeout(() => { // ping once in 10 seconds
        this.pingServiceWorkerPromise = undefined;
      }, 10e3);

      clearTimeout(timeout);
      iframe.remove();
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onLoad);
      promise.resolve();
    };
    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onLoad);
    iframe.src = 'ping/' + (Math.random() * 0xFFFFFFFF | 0) + '.nocache';
    document.body.append(iframe);

    const timeout = window.setTimeout(onLoad, 1e3);
    return promise;
  }

  private attachServiceWorker(serviceWorker: ServiceWorker) {
    if(this.lastServiceWorker === serviceWorker) {
      this.log.warn('trying to attach same service worker');
      return;
    }

    this.lastServiceWorker && this.serviceMessagePort.detachPort(this.lastServiceWorker);
    this.serviceMessagePort.attachSendPort(this.lastServiceWorker = serviceWorker);
    this.serviceMessagePort.invokeVoid('hello', undefined);
  }

  private _registerServiceWorker() {
    navigator.serviceWorker.register(
      // * doesn't work
      // new URL('../../../sw.ts', import.meta.url),
      // '../../../sw',
      ServiceWorkerURL,
      {type: 'module', scope: './'}
    ).then((registration) => {
      this.log('SW registered', registration);

      const url = new URL(window.location.href);
      const FIX_KEY = 'swfix';
      const swfix = +url.searchParams.get(FIX_KEY) || 0;
      if(registration.active && !navigator.serviceWorker.controller) {
        if(swfix >= 3) {
          throw new Error('no controller');
        }

        // ! doubtful fix for hard refresh
        return registration.unregister().then(() => {
          url.searchParams.set(FIX_KEY, '' + (swfix + 1));
          window.location.href = url.toString();
        });
      }

      if(swfix) {
        url.searchParams.delete(FIX_KEY);
        history.pushState(undefined, '', url);
      }

      const sw = registration.installing || registration.waiting || registration.active;
      sw.addEventListener('statechange', (e) => {
        this.log('SW statechange', e);
      });

      const controller = navigator.serviceWorker.controller || registration.installing || registration.waiting || registration.active;
      this.attachServiceWorker(controller);

      if(import.meta.env.VITE_MTPROTO_SW) {
        this.onWorkerFirstMessage(controller);
      }
    }).catch((err) => {
      this.log.error('SW registration failed!', err);

      this.invokeVoid('serviceWorkerOnline', false);
    });
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;

    this.serviceMessagePort = webPushApiManager.serviceMessagePort = new ServiceMessagePort<true>();

    // this.addMultipleEventsListeners({
    //   hello: () => {
    //     // this.serviceMessagePort.invokeVoid('port', undefined);
    //   }
    // });

    // ! I hate webpack - it won't load it by using worker.register, only navigator.serviceWorker will do it.
    const worker = navigator.serviceWorker;
    this._registerServiceWorker();

    // worker.startMessages();

    worker.addEventListener('controllerchange', () => {
      this.log.warn('controllerchange');

      const controller = worker.controller;
      this.attachServiceWorker(controller);

      controller.addEventListener('error', (e) => {
        this.log.error('controller error:', e);
      });
    });

    if(import.meta.env.VITE_MTPROTO_SW) {
      this.attachListenPort(worker);
    } else {
      this.serviceMessagePort.attachListenPort(worker);
      this.serviceMessagePort.addMultipleEventsListeners({
        port: (payload, source, event) => {
          this.invokeVoid('serviceWorkerPort', undefined, undefined, [event.ports[0]]);
        },

        hello: (payload, source) => {
          this.serviceMessagePort.resendLockTask(source);
        },

        share: (payload) => {
          this.log('will try to share something');
          this.share = payload;
        }
      });
    }

    worker.addEventListener('messageerror', (e) => {
      this.log.error('SW messageerror:', e);
    });
  }

  private async registerCryptoWorker() {
    const get = (url: string) => {
      return fetch(url).then((response) => response.text()).then((text) => {
        const pathnameSplitted = location.pathname.split('/');
        pathnameSplitted[pathnameSplitted.length - 1] = '';
        const pre = location.origin + pathnameSplitted.join('/');
        text = text.replace(/(import (?:.+? from )?['"])\//g, '$1' + pre);
        const blob = new Blob([text], {type: 'application/javascript'});
        return blob;
      });
    };

    const workerHandler = {
      construct(target: any, args: any): any {
        return {
          url: makeWorkerURL(args[0]).toString()
        };
      }
    };

    const originals = [
      Worker,
      typeof(SharedWorker) !== 'undefined' && SharedWorker
    ].filter(Boolean);
    originals.forEach((w) => window[w.name as any] = new Proxy(w, workerHandler));

    const worker: SharedWorker | Worker = new Worker(
      new URL('../crypto/crypto.worker.ts', import.meta.url),
      {type: 'module'}
    );

    originals.forEach((w) => window[w.name as any] = w as any);

    const originalUrl = (worker as any).url;

    const createWorker = (url: string) => new constructor(url, {type: 'module'});
    const attachWorkerToPort = (worker: SharedWorker | Worker) => this.attachWorkerToPort(worker, cryptoMessagePort, 'crypto');
    const constructor = IS_SHARED_WORKER_SUPPORTED ? SharedWorker : Worker;

    // let cryptoWorkers = workers.length;
    cryptoMessagePort.addEventListener('port', (payload, source, event) => {
      this.invokeVoid('cryptoPort', undefined, undefined, [event.ports[0]]);
      // .then((attached) => {
      //   if(!attached && cryptoWorkers-- > 1) {
      //     this.log.error('terminating unneeded crypto worker');

      //     cryptoMessagePort.invokeVoid('terminate', undefined, source);
      //     const worker = workers.find((worker) => (worker as SharedWorker).port === source || (worker as any) === source);
      //     if((worker as SharedWorker).port) (worker as SharedWorker).port.close();
      //     else (worker as Worker).terminate();
      //     cryptoMessagePort.detachPort(source);
      //   }
      // });
    });

    const firstWorker = createWorker(originalUrl);
    attachWorkerToPort(firstWorker);

    const blob = await get(originalUrl);
    const urlsPromise = await this.invoke('createProxyWorkerURLs', {originalUrl, blob});
    const workers = urlsPromise.slice(1).map(createWorker);
    workers.forEach(attachWorkerToPort);
  }

  private registerWorker() {
    if(import.meta.env.VITE_MTPROTO_SW) {
      return;
    }

    let worker: SharedWorker | Worker;
    if(IS_SHARED_WORKER_SUPPORTED) {
      worker = new SharedWorker(
        new URL('./mtproto.worker.ts', import.meta.url),
        {type: 'module'}
      );
    } else {
      worker = new Worker(
        new URL('./mtproto.worker.ts', import.meta.url),
        {type: 'module'}
      );
    }

    this.onWorkerFirstMessage(worker);
  }

  private attachWorkerToPort(worker: SharedWorker | Worker, messagePort: SuperMessagePort<any, any, any>, type: string) {
    const port: MessagePort = (worker as SharedWorker).port || worker as any;
    messagePort.attachPort(port);

    worker.addEventListener('error', (err) => {
      this.log.error(type, 'worker error', err);
    });
  }

  private onWorkerFirstMessage(worker: any) {
    this.log('set webWorker');

    // this.worker = worker;
    if(import.meta.env.VITE_MTPROTO_SW) {
      this.attachSendPort(worker);
    } else {
      this.attachWorkerToPort(worker, this, 'mtproto');
    }
  }

  private loadState() {
    return Promise.all([
      loadState().then((stateResult) => {
        this.newVersion = stateResult.newVersion;
        this.oldVersion = stateResult.oldVersion;
        this.mirrors['state'] = stateResult.state;
        return stateResult;
      })
      // loadStorages(createStorages()),
    ]);
  }

  public sendState() {
    return this.loadState().then((result) => {
      const [stateResult] = result;
      this.invoke('state', {...stateResult, userId: rootScope.myId.toUserId()});
      return result;
    });
  }

  public invokeCrypto<Method extends keyof CryptoMethods>(method: Method, ...args: Parameters<CryptoMethods[typeof method]>): Promise<Awaited<ReturnType<CryptoMethods[typeof method]>>> {
    if(!import.meta.env.VITE_MTPROTO_WORKER) {
      return;
    }

    return cryptoMessagePort.invokeCrypto(method, ...args);
  }

  public async toggleStorages(enabled: boolean, clearWrite: boolean) {
    await toggleStorages(enabled, clearWrite);
    this.invoke('toggleStorages', {enabled, clearWrite});
    this.serviceMessagePort?.invokeVoid('toggleStorages', {enabled, clearWrite});
  }

  public async getMirror<T extends keyof Mirrors>(name: T) {
    const mirror = this.mirrors[name];
    return mirror;
  }

  public getState() {
    return this.getMirror('state');
  }

  public updateTabState<T extends keyof TabState>(key: T, value: TabState[T]) {
    this.tabState[key] = value;
    this.invokeVoid('tabState', this.tabState);
  }

  public updateTabStateIdle(idle: boolean) {
    this.updateTabState('idleStartTime', idle ? Date.now() : 0);
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

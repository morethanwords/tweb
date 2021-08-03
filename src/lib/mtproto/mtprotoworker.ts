/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { LocalStorageProxyTask, LocalStorageProxyTaskResponse } from '../localStorage';
//import type { LocalStorageProxyDeleteTask, LocalStorageProxySetTask } from '../storage';
import type { Awaited, InvokeApiOptions, WorkerTaskVoidTemplate } from '../../types';
import type { Config, InputFile, MethodDeclMap } from '../../layer';
import MTProtoWorker from 'worker-loader!./mtproto.worker';
//import './mtproto.worker';
import { isObject } from '../../helpers/object';
import CryptoWorkerMethods from '../crypto/crypto_methods';
import { logger } from '../logger';
import rootScope from '../rootScope';
import webpWorkerController from '../webp/webpWorkerController';
import { ApiFileManager, DownloadOptions } from './apiFileManager';
import type { RequestFilePartTask, RequestFilePartTaskResponse, ServiceWorkerTask } from '../serviceWorker/index.service';
import { UserAuth } from './mtproto_config';
import type { MTMessage } from './networker';
import DEBUG, { MOUNT_CLASS_TO } from '../../config/debug';
import Socket from './transports/websocket';
import singleInstance from './singleInstance';
import sessionStorage from '../sessionStorage';
import webPushApiManager from './webPushApiManager';
import AppStorage from '../storage';
import appRuntimeManager from '../appManagers/appRuntimeManager';
import { SocketProxyTask } from './transports/socketProxied';
import telegramMeWebManager from './telegramMeWebManager';
import { CacheStorageDbName } from '../cacheStorage';
import { pause } from '../../helpers/schedulers/pause';

type Task = {
  taskId: number,
  task: string,
  args: any[]
};

type HashResult = {
  hash: number,
  result: any
};

type HashOptions = {
  [queryJSON: string]: HashResult
};

export interface ToggleStorageTask extends WorkerTaskVoidTemplate {
  type: 'toggleStorage',
  payload: boolean
};

export class ApiManagerProxy extends CryptoWorkerMethods {
  public worker: /* Window */Worker;
  private afterMessageIdTemp = 0;

  private taskId = 0;
  private awaiting: {
    [id: number]: {
      resolve: any,
      reject: any,
      taskName: string
    }
  } = {} as any;
  private pending: Array<Task> = [];

  public updatesProcessor: (obj: any) => void = null;

  private log = logger('API-PROXY');

  private hashes: {[method: string]: HashOptions} = {};

  private apiPromisesSingle: {
    [q: string]: Promise<any>
  } = {};
  private apiPromisesCacheable: {
    [method: string]: {
      [queryJSON: string]: {
        timestamp: number,
        promise: Promise<any>,
        fulfilled: boolean,
        timeout?: number,
        params: any
      }
    }
  } = {};

  private isSWRegistered = true;

  private debug = DEBUG /* && false */;

  private sockets: Map<number, Socket> = new Map();

  private taskListeners: {[taskType: string]: (task: any) => void} = {};
  private taskListenersSW: {[taskType: string]: (task: any) => void} = {};

  public onServiceWorkerFail: () => void;

  private postMessagesWaiting: any[][] = [];

  private getConfigPromise: Promise<Config.config>;

  constructor() {
    super();
    this.log('constructor');

    singleInstance.start();

    this.registerServiceWorker();

    this.addTaskListener('clear', () => {
      const toClear: CacheStorageDbName[] = ['cachedFiles', 'cachedStreamChunks'];
      Promise.all([
        AppStorage.toggleStorage(false), 
        sessionStorage.clear(),
        Promise.race([
          telegramMeWebManager.setAuthorized(false),
          pause(3000)
        ]),
        webPushApiManager.forceUnsubscribe(),
        Promise.all(toClear.map(cacheName => caches.delete(cacheName)))
      ]).finally(() => {
        appRuntimeManager.reload();
      });
    });

    this.addTaskListener('connectionStatusChange', (task: any) => {
      rootScope.dispatchEvent('connection_status_change', task.payload);
    });

    this.addTaskListener('convertWebp', (task) => {
      webpWorkerController.postMessage(task);
    });

    this.addTaskListener('socketProxy', (task: SocketProxyTask) => {
      const socketTask = task.payload;
      const id = socketTask.id;
      //console.log('socketProxy', socketTask, id);

      if(socketTask.type === 'send') {
        const socket = this.sockets.get(id);
        socket.send(socketTask.payload);
      } else if(socketTask.type === 'close') { // will remove from map in onClose
        const socket = this.sockets.get(id);
        socket.close();
      } else if(socketTask.type === 'setup') {
        const socket = new Socket(socketTask.payload.dcId, socketTask.payload.url, socketTask.payload.logSuffix);
        
        const onOpen = () => {
          //console.log('socketProxy onOpen');
          this.postMessage({
            type: 'socketProxy', 
            payload: {
              type: 'open',
              id
            }
          });
        };
        const onClose = () => {
          this.postMessage({
            type: 'socketProxy', 
            payload: {
              type: 'close',
              id
            }
          });

          socket.removeEventListener('open', onOpen);
          socket.removeEventListener('close', onClose);
          socket.removeEventListener('message', onMessage);
          this.sockets.delete(id);
        };
        const onMessage = (buffer: ArrayBuffer) => {
          this.postMessage({
            type: 'socketProxy', 
            payload: {
              type: 'message',
              id,
              payload: buffer
            }
          });
        };

        socket.addEventListener('open', onOpen);
        socket.addEventListener('close', onClose);
        socket.addEventListener('message', onMessage);
        this.sockets.set(id, socket);
      }
    });

    this.addTaskListener('localStorageProxy', (task: LocalStorageProxyTask) => {
      const storageTask = task.payload;
      // @ts-ignore
      sessionStorage[storageTask.type](...storageTask.args).then(res => {
        this.postMessage({
          type: 'localStorageProxy',
          id: task.id,
          payload: res
        } as LocalStorageProxyTaskResponse);
      });
    });

    rootScope.addEventListener('language_change', (language) => {
      this.performTaskWorkerVoid('setLanguage', language);
    });

    window.addEventListener('online', (event) => {
      this.forceReconnectTimeout();
    });

    /// #if !MTPROTO_SW
    this.registerWorker();
    /// #endif

    setTimeout(() => {
      this.getConfig();
    }, 5000);
  }

  public isServiceWorkerOnline() {
    return this.isSWRegistered;
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;
    
    const worker = navigator.serviceWorker;
    worker.register('./sw.js', {scope: './'}).then(registration => {
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

      if(this.onServiceWorkerFail) {
        this.onServiceWorkerFail();
      }
    });

    worker.addEventListener('controllerchange', () => {
      this.log.warn('controllerchange');
      this.releasePending();

      worker.controller.addEventListener('error', (e) => {
        this.log.error('controller error:', e);
      });
    });

    /// #if MTPROTO_SW
    worker.addEventListener('message', this.onWorkerMessage);
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
      
      this.performTaskWorker<Awaited<ReturnType<ApiFileManager['requestFilePart']>>>('requestFilePart', ...task.payload)
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

  public postMessage(...args: any[]) {
    this.postMessagesWaiting.push(args);
  }

  public postSWMessage(message: any) {
    if(navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  private onWorkerFirstMessage(worker: any) {
    if(!this.worker) {
      this.worker = worker;
      this.log('set webWorker');

      this.postMessage = this.worker.postMessage.bind(this.worker);

      this.postMessagesWaiting.forEach(args => this.postMessage(...args));
      this.postMessagesWaiting.length = 0;

      const isWebpSupported = webpWorkerController.isWebpSupported();
      this.log('WebP supported:', isWebpSupported);
      this.postMessage({type: 'webpSupport', payload: isWebpSupported});
      this.postMessage({type: 'userAgent', payload: navigator.userAgent});

      this.releasePending();
    }
  }

  public addTaskListener(name: keyof ApiManagerProxy['taskListeners'], callback: ApiManagerProxy['taskListeners'][typeof name]) {
    this.taskListeners[name] = callback;
  }

  public addServiceWorkerTaskListener(name: keyof ApiManagerProxy['taskListenersSW'], callback: ApiManagerProxy['taskListenersSW'][typeof name]) {
    this.taskListenersSW[name] = callback;
  }

  private onWorkerMessage = (e: MessageEvent) => {
    //this.log('got message from worker:', e.data);

    const task = e.data;

    if(!isObject(task)) {
      return;
    }

    const callback = this.taskListeners[task.type];
    if(callback) {
      callback(task);
      return;
    }

    if(task.update) {
      if(this.updatesProcessor) {
        this.updatesProcessor(task.update);
      }
    } else if(task.progress) {
      rootScope.dispatchEvent('download_progress', task.progress);
    } else if(task.hasOwnProperty('result') || task.hasOwnProperty('error')) {
      this.finalizeTask(task.taskId, task.result, task.error);
    }
  };

  /// #if !MTPROTO_SW
  private registerWorker() {
    //return;

    const worker = new MTProtoWorker();
    //const worker = window;
    worker.addEventListener('message', this.onWorkerFirstMessage.bind(this, worker), {once: true});
    worker.addEventListener('message', this.onWorkerMessage);

    worker.addEventListener('error', (err) => {
      this.log.error('WORKER ERROR', err);
    });
  }
  /// #endif

  private finalizeTask(taskId: number, result: any, error: any) {
    const deferred = this.awaiting[taskId];
    if(deferred !== undefined) {
      this.debug && this.log.debug('done', deferred.taskName, result, error);
      error ? deferred.reject(error) : deferred.resolve(result);
      delete this.awaiting[taskId];
    }
  }

  public performTaskWorkerVoid(task: string, ...args: any[]) {
    const params = {
      task,
      taskId: this.taskId,
      args
    };

    this.pending.push(params);
    this.releasePending();

    this.taskId++;
  }

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.debug && this.log.debug('start', task, args);

    return new Promise<T>((resolve, reject) => {
      this.awaiting[this.taskId] = {resolve, reject, taskName: task};
      this.performTaskWorkerVoid(task, ...args);
    });
  }

  private releasePending() {
    //return;

    if(this.postMessage) {
      this.debug && this.log.debug('releasing tasks, length:', this.pending.length);
      this.pending.forEach(pending => {
        this.postMessage(pending);
      });
      
      this.debug && this.log.debug('released tasks');
      this.pending.length = 0;
    }
  }

  public setUpdatesProcessor(callback: (obj: any) => void) {
    this.updatesProcessor = callback;
  }

  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    //console.log('will invokeApi:', method, params, options);
    return this.performTaskWorker('invokeApi', method, params, options);
  }

  public invokeApiAfter<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    let o = options;
    o.prepareTempMessageId = '' + ++this.afterMessageIdTemp;
    
    o = {...options};
    (options as MTMessage).messageId = o.prepareTempMessageId;

    //console.log('will invokeApi:', method, params, options);
    return this.invokeApi(method, params, o);
  }

  public invokeApiHashable<T extends keyof MethodDeclMap>(method: T, params: Omit<MethodDeclMap[T]['req'], 'hash'> = {} as any, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    //console.log('will invokeApi:', method, params, options);

    const queryJSON = JSON.stringify(params);
    let cached: HashResult;
    if(this.hashes[method]) {
      cached = this.hashes[method][queryJSON];
      if(cached) {
        (params as any).hash = cached.hash;
      }
    }

    return this.invokeApi(method, params, options).then((result: any) => {
      if(result._.includes('NotModified')) {
        this.debug && this.log.warn('NotModified saved!', method, queryJSON);
        return cached.result;
      }
      
      if(result.hash/*  || result.messages */) {
        const hash = result.hash/*  || this.computeHash(result.messages) */;
        
        if(!this.hashes[method]) this.hashes[method] = {};
        this.hashes[method][queryJSON] = {
          hash,
          result
        };
      }

      return result;
    });
  }

  public invokeApiSingle<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {} as any, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    const q = method + '-' + JSON.stringify(params);
    if(this.apiPromisesSingle[q]) {
      return this.apiPromisesSingle[q];
    }

    return this.apiPromisesSingle[q] = this.invokeApi(method, params, options).finally(() => {
      delete this.apiPromisesSingle[q];
    });
  }

  public invokeApiCacheable<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {} as any, options: InvokeApiOptions & Partial<{cacheSeconds: number, override: boolean}> = {}): Promise<MethodDeclMap[T]['res']> {
    const cache = this.apiPromisesCacheable[method] ?? (this.apiPromisesCacheable[method] = {});
    const queryJSON = JSON.stringify(params);
    const item = cache[queryJSON];
    if(item && (!options.override || !item.fulfilled)) {
      return item.promise;
    }

    if(options.override) {
      if(item && item.timeout) {
        clearTimeout(item.timeout);
        delete item.timeout;
      }

      delete options.override;
    }

    let timeout: number;
    if(options.cacheSeconds) {
      timeout = window.setTimeout(() => {
        delete cache[queryJSON];
      }, options.cacheSeconds * 1000);
      delete options.cacheSeconds;
    }

    const promise = this.invokeApi(method, params, options);

    cache[queryJSON] = {
      timestamp: Date.now(),
      fulfilled: false,
      timeout,
      promise,
      params
    };

    return promise;
  }

  public clearCache<T extends keyof MethodDeclMap>(method: T, verify: (params: MethodDeclMap[T]['req']) => boolean) {
    const cache = this.apiPromisesCacheable[method];
    if(cache) {
      for(const queryJSON in cache) {
        const item = cache[queryJSON];
        if(verify(item.params)) {
          if(item.timeout) {
            clearTimeout(item.timeout);
          }

          delete cache[queryJSON];
        }
      }
    }
  }

  /* private computeHash(smth: any[]) {
    smth = smth.slice().sort((a, b) => a.id - b.id);
    //return smth.reduce((hash, v) => (((hash * 0x4F25) & 0x7FFFFFFF) + v.id) & 0x7FFFFFFF, 0);
    return smth.reduce((hash, v) => ((hash * 20261) + 0x80000000 + v.id) % 0x80000000, 0);
  } */

  public setBaseDcId(dcId: number) {
    return this.performTaskWorker('setBaseDcId', dcId);
  }

  public setQueueId(queueId: number) {
    return this.performTaskWorker('setQueueId', queueId);
  }

  public setUserAuth(userAuth: UserAuth | number) {
    if(typeof(userAuth) === 'number') {
      userAuth = {dcID: 0, date: Date.now() / 1000 | 0, id: userAuth};
    }
    
    rootScope.dispatchEvent('user_auth', userAuth);
    return this.performTaskWorker('setUserAuth', userAuth);
  }

  public getNetworker(dc_id: number, options?: InvokeApiOptions) {
    return this.performTaskWorker('getNetworker', dc_id, options);
  }

  public logOut(): Promise<void> {
    // AppStorage.toggleStorage(false);
    return this.performTaskWorker('logOut');
  }

  public cancelDownload(fileName: string) {
    return this.performTaskWorker('cancelDownload', fileName);
  }

  public downloadFile(options: DownloadOptions) {
    return this.performTaskWorker<Blob>('downloadFile', options);
  }

  public uploadFile(options: {file: Blob | File, fileName: string}) {
    return this.performTaskWorker<InputFile>('uploadFile', options);
  }

  public toggleStorage(enabled: boolean) {
    const task: ToggleStorageTask = {type: 'toggleStorage', payload: enabled};
    this.postMessage(task);
    this.postSWMessage(task);
  }

  public stopAll() {
    return this.performTaskWorkerVoid('stopAll');
  }

  public startAll() {
    return this.performTaskWorkerVoid('startAll');
  }

  public forceReconnectTimeout() {
    this.postMessage({type: 'online'});
  }

  public forceReconnect() {
    this.postMessage({type: 'forceReconnect'});
  }

  public getConfig() {
    if(this.getConfigPromise) return this.getConfigPromise;
    return this.getConfigPromise = this.invokeApi('help.getConfig').then(config => {
      rootScope.config = config;
      return config;
    });
  }
}

const apiManagerProxy = new ApiManagerProxy();
MOUNT_CLASS_TO.apiManagerProxy = apiManagerProxy;
export default apiManagerProxy;

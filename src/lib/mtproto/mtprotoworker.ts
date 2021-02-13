import MTProtoWorker from 'worker-loader!./mtproto.worker';
import SocketWorker from 'worker-loader!./transports/websocket';
//import './mtproto.worker';
import { isObject } from '../../helpers/object';
import type { MethodDeclMap } from '../../layer';
import type { InvokeApiOptions } from '../../types';
import CryptoWorkerMethods from '../crypto/crypto_methods';
import { logger } from '../logger';
import rootScope from '../rootScope';
import webpWorkerController from '../webp/webpWorkerController';
import type { DownloadOptions } from './apiFileManager';
import { ApiError } from './apiManager';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';
import { UserAuth } from './mtproto_config';
import type { MTMessage } from './networker';
import referenceDatabase from './referenceDatabase';
import appDocsManager from '../appManagers/appDocsManager';
import DEBUG, { MOUNT_CLASS_TO } from '../../config/debug';

type Task = {
  taskId: number,
  task: string,
  args: any[]
};

const USE_WORKER_AS_WORKER = true;

type HashResult = {
  hash: number,
  result: any
};

type HashOptions = {
  [queryJSON: string]: HashResult
};

export class ApiManagerProxy extends CryptoWorkerMethods {
  public worker: /* Window */Worker;
  public postMessage: (...args: any[]) => void;
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

  private isSWRegistered = true;

  private debug = DEBUG;

  private socketsWorkers: Map<number, SocketWorker> = new Map();

  constructor() {
    super();
    this.log('constructor');

    this.registerServiceWorker();
    this.registerWorker();
  }

  public isServiceWorkerOnline() {
    return this.isSWRegistered;
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js', {scope: './'}).then(registration => {
      this.isSWRegistered = true;
    }, (err) => {
      this.isSWRegistered = false;
      this.log.error('SW registration failed!', err);
      appDocsManager.onServiceWorkerFail();
    });

    navigator.serviceWorker.ready.then((registration) => {
      this.log('set SW');
      this.releasePending();

      if(!USE_WORKER_AS_WORKER) {
        this.postMessage = navigator.serviceWorker.controller.postMessage.bind(navigator.serviceWorker.controller);
      }

      //registration.update();
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      this.log.warn('controllerchange');
      this.releasePending();

      navigator.serviceWorker.controller.addEventListener('error', (e) => {
        this.log.error('controller error:', e);
      });
    });

    /**
     * Message resolver
     */
    navigator.serviceWorker.addEventListener('message', (e) => {
      const task: ServiceWorkerTask = e.data;
      if(!isObject(task)) {
        return;
      }
      
      this.postMessage(task);
    });

    navigator.serviceWorker.addEventListener('messageerror', (e) => {
      this.log.error('SW messageerror:', e);
    });
  }

  private registerWorker() {
    //return;

    const worker = new MTProtoWorker();
    //const worker = window;
    worker.addEventListener('message', (e) => {
      if(!this.worker) {
        this.worker = worker as any;
        this.log('set webWorker');

        if(USE_WORKER_AS_WORKER) {
          this.postMessage = this.worker.postMessage.bind(this.worker);
        }

        const isWebpSupported = webpWorkerController.isWebpSupported();
        this.log('WebP supported:', isWebpSupported);
        this.postMessage({type: 'webpSupport', payload: isWebpSupported});

        this.releasePending();
      }

      //this.log('got message from worker:', e.data);

      const task = e.data;

      if(!isObject(task)) {
        return;
      }
      
      if(task.update) {
        if(this.updatesProcessor) {
          this.updatesProcessor(task.update);
        }
      } else if(task.progress) {
        rootScope.broadcast('download_progress', task.progress);
      } else if(task.type === 'reload') {
        location.reload();
      } else if(task.type === 'connectionStatusChange') {
        rootScope.broadcast('connection_status_change', task.payload);
      } else if(task.type === 'convertWebp') {
        webpWorkerController.postMessage(task);
      } else if((task as ServiceWorkerTaskResponse).type === 'requestFilePart') {
        const _task = task as ServiceWorkerTaskResponse;
        
        if(_task.error) {
          const onError = (error: ApiError) => {
            if(error?.type === 'FILE_REFERENCE_EXPIRED') {
              // @ts-ignore
              const bytes = _task.originalPayload[1].file_reference;
              referenceDatabase.refreshReference(bytes).then(() => {
                // @ts-ignore
                _task.originalPayload[1].file_reference = referenceDatabase.getReferenceByLink(bytes);
                const newTask: ServiceWorkerTask = {
                  type: _task.type,
                  id: _task.id,
                  payload: _task.originalPayload
                };
  
                this.postMessage(newTask);
              }).catch(onError);
            } else {
              navigator.serviceWorker.controller.postMessage(task);
            }
          };

          onError(_task.error);
        } else {
          navigator.serviceWorker.controller.postMessage(task);
        }
      } else if(task.type === 'socketProxy') {
        const socketTask = task.payload;
        const id = socketTask.id;
        console.log('socketProxy', socketTask, id);
        if(socketTask.type === 'send') {
          const socketWorker = this.socketsWorkers.get(id);
          socketWorker.postMessage(socketTask);
        } else if(socketTask.type === 'setup') {
          const socketWorker = new SocketWorker();
          socketWorker.postMessage(socketTask);
          socketWorker.addEventListener('message', (e) => {
            const task = e.data;


          });

          this.socketsWorkers.set(id, socketWorker);
        }
      } else if(task.hasOwnProperty('result') || task.hasOwnProperty('error')) {
        this.finalizeTask(task.taskId, task.result, task.error);
      }
    });

    worker.addEventListener('error', (err) => {
      this.log.error('WORKER ERROR', err);
    });
  }

  private finalizeTask(taskId: number, result: any, error: any) {
    const deferred = this.awaiting[taskId];
    if(deferred !== undefined) {
      this.debug && this.log.debug('done', deferred.taskName, result, error);
      error ? deferred.reject(error) : deferred.resolve(result);
      delete this.awaiting[taskId];
    }
  }

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.debug && this.log.debug('start', task, args);

    return new Promise<T>((resolve, reject) => {
      this.awaiting[this.taskId] = {resolve, reject, taskName: task};
  
      const params = {
        task,
        taskId: this.taskId,
        args
      };

      this.pending.push(params);
      this.releasePending();
  
      this.taskId++;
    });
  }

  private releasePending() {
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
    return this.performTaskWorker('invokeApi', method, params, o);
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

    return this.performTaskWorker('invokeApi', method, params, options).then((result: any) => {
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

  /* private computeHash(smth: any[]) {
    return smth.reduce((hash, v) => (((hash * 0x4F25) & 0x7FFFFFFF) + v.id) & 0x7FFFFFFF, 0);
  } */

  public setBaseDcId(dcId: number) {
    return this.performTaskWorker('setBaseDcId', dcId);
  }

  public setQueueId(queueId: number) {
    return this.performTaskWorker('setQueueId', queueId);
  }

  public setUserAuth(userAuth: UserAuth) {
    rootScope.broadcast('user_auth', userAuth);
    return this.performTaskWorker('setUserAuth', userAuth);
  }

  public getNetworker(dc_id: number, options?: InvokeApiOptions) {
    return this.performTaskWorker('getNetworker', dc_id, options);
  }

  public logOut(): Promise<void> {
    return this.performTaskWorker('logOut');
  }

  public cancelDownload(fileName: string) {
    return this.performTaskWorker('cancelDownload', fileName);
  }

  public downloadFile(options: DownloadOptions) {
    return this.performTaskWorker('downloadFile', options);
  }

  public uploadFile(options: {file: Blob | File, fileName: string}) {
    return this.performTaskWorker('uploadFile', options);
  }
}

const apiManagerProxy = new ApiManagerProxy();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.apiManagerProxy = apiManagerProxy);
export default apiManagerProxy;

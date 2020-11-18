import MTProtoWorker from 'worker-loader!./mtproto.worker';
import { isObject } from '../../helpers/object';
import type { MethodDeclMap } from '../../layer';
import type { InvokeApiOptions } from '../../types';
import CryptoWorkerMethods from '../crypto/crypto_methods';
import { logger } from '../logger';
import rootScope from '../rootScope';
import AppStorage from '../storage';
import webpWorkerController from '../webp/webpWorkerController';
import type { DownloadOptions } from './apiFileManager';
import { ApiError } from './apiManager';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';
import { MOUNT_CLASS_TO, UserAuth } from './mtproto_config';
import type { MTMessage } from './networker';
import referenceDatabase from './referenceDatabase';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

const USEWORKERASWORKER = true;

export class ApiManagerProxy extends CryptoWorkerMethods {
  public worker: Worker;
  public postMessage: (...args: any[]) => void;
  private afterMessageIDTemp = 0;

  private taskID = 0;
  private awaiting: {
    [id: number]: {
      resolve: any,
      reject: any,
      taskName: string
    }
  } = {} as any;
  private pending: Array<Task> = [];

  public updatesProcessor: (obj: any, bool: boolean) => void = null;

  private log = logger('API-PROXY');

  constructor() {
    super();
    this.log('constructor');

    this.registerServiceWorker();
    this.registerWorker();
  }

  private registerServiceWorker() {
    if(!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js', {scope: './'}).then(registration => {
      
    }, (err) => {
      this.log.error('SW registration failed!', err);
    });

    navigator.serviceWorker.ready.then((registration) => {
      this.log('set SW');
      this.releasePending();

      if(!USEWORKERASWORKER) {
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
    const worker = new MTProtoWorker();
    worker.addEventListener('message', (e) => {
      if(!this.worker) {
        this.worker = worker;
        this.log('set webWorker');

        if(USEWORKERASWORKER) {
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
      
      if(task.useLs) {
        // @ts-ignore
        AppStorage[task.task](...task.args).then(res => {
          this.postMessage({useLs: true, taskID: task.taskID, args: res});
        });
      } else if(task.update) {
        if(this.updatesProcessor) {
          this.updatesProcessor(task.update.obj, task.update.bool);
        }
      } else if(task.progress) {
        rootScope.broadcast('download_progress', task.progress);
      } else if(task.type == 'connectionStatusChange') {
        rootScope.broadcast('connection_status_change', task.payload);
      } else if(task.type == 'convertWebp') {
        webpWorkerController.postMessage(task);
      } else if((task as ServiceWorkerTaskResponse).type == 'requestFilePart') {
        const _task = task as ServiceWorkerTaskResponse;
        
        if(_task.error) {
          const onError = (error: ApiError) => {
            if(error?.type == 'FILE_REFERENCE_EXPIRED') {
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
      } else {
        this.finalizeTask(task.taskID, task.result, task.error);
      }
    });
  }

  private finalizeTask(taskID: number, result: any, error: any) {
    const deferred = this.awaiting[taskID];
    if(deferred !== undefined) {
      this.log.debug('done', deferred.taskName, result, error);
      error ? deferred.reject(error) : deferred.resolve(result);
      delete this.awaiting[taskID];
    }
  }

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.log.debug('start', task, args);

    return new Promise<T>((resolve, reject) => {
      this.awaiting[this.taskID] = {resolve, reject, taskName: task};
  
      const params = {
        task,
        taskID: this.taskID,
        args
      };

      this.pending.push(params);
      this.releasePending();
  
      this.taskID++;
    });
  }

  private releasePending() {
    if(this.postMessage) {
      this.log.debug('releasing tasks, length:', this.pending.length);
      this.pending.forEach(pending => {
        this.postMessage(pending);
      });
      
      this.log.debug('released tasks');
      this.pending.length = 0;
    }
  }

  public setUpdatesProcessor(callback: (obj: any, bool: boolean) => void) {
    this.updatesProcessor = callback;
  }

  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    //console.log('will invokeApi:', method, params, options);
    return this.performTaskWorker('invokeApi', method, params, options);
  }

  public invokeApiAfter<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: InvokeApiOptions = {}): Promise<MethodDeclMap[T]['res']> {
    let o = options;
    o.prepareTempMessageID = '' + ++this.afterMessageIDTemp;
    
    o = {...options};
    (options as MTMessage).messageID = o.prepareTempMessageID;

    //console.log('will invokeApi:', method, params, options);
    return this.performTaskWorker('invokeApi', method, params, o);
  }

  public setBaseDcID(dcID: number) {
    return this.performTaskWorker('setBaseDcID', dcID);
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

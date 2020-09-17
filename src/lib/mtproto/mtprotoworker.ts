import {isObject, $rootScope} from '../utils';
import AppStorage from '../storage';
import CryptoWorkerMethods from '../crypto/crypto_methods';
import { logger } from '../logger';
import webpWorkerController from '../webp/webpWorkerController';
import MTProtoWorker from 'worker-loader!./mtproto.worker';
import type { DownloadOptions } from './apiFileManager';
import type { ServiceWorkerTask, ServiceWorkerTaskResponse } from './mtproto.service';
import { isServiceWorkerSupported } from '../config';
import { MethodDeclMap } from '../../layer';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

const USEWORKERASWORKER = true;

class ApiManagerProxy extends CryptoWorkerMethods {
  public worker: Worker;
  public postMessage: (...args: any[]) => void;

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
    if(!isServiceWorkerSupported) return;

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
        $rootScope.$broadcast('download_progress', task.progress);
      } else if(task.type == 'convertWebp') {
        webpWorkerController.postMessage(task);
      } else if((task as ServiceWorkerTaskResponse).type == 'requestFilePart') {
        navigator.serviceWorker.controller.postMessage(task);
      } else {
        this.finalizeTask(task.taskID, task.result, task.error);
      }
    });
  }

  private finalizeTask(taskID: number, result: any, error: any) {
    const deferred = this.awaiting[taskID];
    if(deferred !== undefined) {
      this.log.debug('done', deferred.taskName, result, error);
      result === undefined ? deferred.reject(error) : deferred.resolve(result);
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

  public invokeApi<T extends keyof MethodDeclMap>(method: T, params: MethodDeclMap[T]['req'] = {}, options: {
    dcID?: number,
    timeout?: number,
    noErrorBox?: boolean,
    fileUpload?: boolean,
    ignoreErrors?: boolean,
    fileDownload?: boolean,
    createNetworker?: boolean,
    singleInRequest?: boolean,
    startMaxLength?: number,
    
    waitTime?: number,
    stopTime?: number,
    rawError?: any
  } = {}): Promise<MethodDeclMap[T]['res']> {
    //console.log('will invokeApi:', method, params, options);
    return this.performTaskWorker('invokeApi', method, params, options);
  }

  public setBaseDcID(dcID: number) {
    return this.performTaskWorker('setBaseDcID', dcID);
  }

  public setUserAuth(userAuth: {id: number}) {
    $rootScope.$broadcast('user_auth', userAuth);
    return this.performTaskWorker('setUserAuth', userAuth);
  }

  public getNetworker(dc_id: number) {
    return this.performTaskWorker('getNetworker', dc_id);
  }

  public getUserID(): Promise<number> {
    return this.performTaskWorker('getUserID');
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
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).apiManagerProxy = apiManagerProxy;
}
export default apiManagerProxy;

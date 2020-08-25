import {isObject, $rootScope} from '../utils';
import AppStorage from '../storage';
import CryptoWorkerMethods from '../crypto/crypto_methods';
//import runtime from 'serviceworker-webpack-plugin/lib/runtime';
import { logger } from '../logger';
import { webpWorkerController } from '../webp/webpWorkerController';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

class ApiManagerProxy extends CryptoWorkerMethods {
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

    /**
     * Service worker
     */
    //(runtime.register({ scope: './' }) as Promise<ServiceWorkerRegistration>).then(registration => {
    navigator.serviceWorker.register('./sw.js', {scope: './'}).then(registration => {
      
    }, (err) => {
      this.log.error('SW registration failed!', err);
    });

    navigator.serviceWorker.ready.then((registration) => {
      this.log('set SW');
      this.releasePending();

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
      if(!isObject(e.data)) {
        return;
      }
      
      if(e.data.useLs) {
        // @ts-ignore
        AppStorage[e.data.task](...e.data.args).then(res => {
          navigator.serviceWorker.controller.postMessage({useLs: true, taskID: e.data.taskID, args: res});
        });
      } else if(e.data.update) {
        if(this.updatesProcessor) {
          this.updatesProcessor(e.data.update.obj, e.data.update.bool);
        }
      } else if(e.data.progress) {
        $rootScope.$broadcast('download_progress', e.data.progress);
      } else if(e.data.type == 'convertWebp') {
        webpWorkerController.postMessage(e.data);
      } else {
        this.finalizeTask(e.data.taskID, e.data.result, e.data.error);
      }
    });
  }

  private finalizeTask(taskID: number, result: any, error: any) {
    let deferred = this.awaiting[taskID];
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
    if(navigator.serviceWorker.controller) {
      this.pending.forEach(pending => {
        navigator.serviceWorker.controller.postMessage(pending);
      });

      this.pending.length = 0;
    }
  }

  public setUpdatesProcessor(callback: (obj: any, bool: boolean) => void) {
    this.updatesProcessor = callback;
  }

  public invokeApi(method: string, params: any = {}, options: {
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
  } = {}): Promise<any> {
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
}

const apiManagerProxy = new ApiManagerProxy();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).apiManagerProxy = apiManagerProxy;
}
export default apiManagerProxy;

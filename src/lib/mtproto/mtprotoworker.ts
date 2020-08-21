import {dT, isObject, $rootScope} from '../utils';
import AppStorage from '../storage';
import CryptoWorkerMethods from '../crypto/crypto_methods';
import runtime from 'serviceworker-webpack-plugin/lib/runtime';
import { InputFileLocation, FileLocation } from '../../types';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

/* let pending: any[] = [];
function resendPending() {
  if(navigator.serviceWorker.controller) {
    for(let i = 0; i < pending.length; i++) navigator.serviceWorker.controller.postMessage(pending[i]);
    pending = [];
  }
} */

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
  private debug = false;

  public updatesProcessor: (obj: any, bool: boolean) => void = null;

  constructor() {
    super();
    console.log(dT(), 'ApiManagerProxy constructor');

    /**
     * Service worker
     */
    runtime.register({ scope: '/' });

    navigator.serviceWorker.ready.then((registration) => {
      console.info(dT(), 'ApiManagerProxy set SW');
      this.releasePending();
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.warn(dT(), 'ApiManagerProxy controllerchange');
      this.releasePending();

      navigator.serviceWorker.controller.addEventListener('error', (e) => {
        console.error('controller error:', e);
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
      } else {
        this.finalizeTask(e.data.taskID, e.data.result, e.data.error);
      }
    });
  }

  private finalizeTask(taskID: number, result: any, error: any) {
    let deferred = this.awaiting[taskID];
    if(deferred !== undefined) {
      this.debug && console.log(dT(), 'ApiManagerProxy done', deferred.taskName, result, error);
      result === undefined ? deferred.reject(error) : deferred.resolve(result);
      delete this.awaiting[taskID];
    }
  }

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.debug && console.log(dT(), 'ApiManagerProxy start', task, args);

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

  public downloadFile(dcID: number, location: InputFileLocation | FileLocation, size: number = 0, options: Partial<{
    mimeType: string,
    toFileEntry: any,
    limitPart: number,
    stickerType: number
  }> = {}): Promise<Blob> {
    return this.performTaskWorker('downloadFile', dcID, location, size, options);
  }
}

const apiManagerProxy = new ApiManagerProxy();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).apiManagerProxy = apiManagerProxy;
}
export default apiManagerProxy;

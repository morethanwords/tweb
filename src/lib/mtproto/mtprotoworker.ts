import {dT, isObject} from '../utils';
import AppStorage from '../storage';
import CryptoWorkerMethods from '../crypto/crypto_methods';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

class ApiManagerProxy extends CryptoWorkerMethods {
  private webWorker: Worker | boolean = false;
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

    if(window.Worker) {
      import('./mtproto.worker.js').then((worker: any) => {
        var tmpWorker = new worker.default();
        tmpWorker.onmessage = (e: any) => {
          if(!this.webWorker) {
            this.webWorker = tmpWorker;
            console.info(dT(), 'ApiManagerProxy set webWorker');
            this.releasePending();
          }

          if(!isObject(e.data)) {
            return;
          }
          
          if(e.data.useLs) {
            // @ts-ignore
            AppStorage[e.data.task](...e.data.args).then(res => {
              (this.webWorker as Worker).postMessage({useLs: true, taskID: e.data.taskID, args: res});
            });
          } else if(e.data.update) {
            if(this.updatesProcessor) {
              this.updatesProcessor(e.data.update.obj, e.data.update.bool);
            }
          } else {
            this.finalizeTask(e.data.taskID, e.data.result, e.data.error);
          }
        };

        tmpWorker.onerror = (error: any) => {
          console.error('ApiManagerProxy error', error);
          this.webWorker = false;
        };
      });
    }
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
  
      let params = {
        task,
        taskID: this.taskID,
        args
      };

      //(this.webWorker as Worker).postMessage(params);
      this.pending.push(params);
      this.releasePending();
  
      this.taskID++;
    });
  }

  private releasePending() {
    if(this.webWorker) {
      this.pending.forEach(pending => {
        (this.webWorker as Worker).postMessage(pending);
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
    return this.performTaskWorker('invokeApi', method, params, options);
  }

  public setUserAuth(userAuth: {id: number}) {
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

  public checkPassword(value: string): Promise<any> {
    return this.performTaskWorker('checkPassword', value);
  }
}

const apiManagerProxy = new ApiManagerProxy();
(window as any).apiManagerProxy = apiManagerProxy;
export default apiManagerProxy;

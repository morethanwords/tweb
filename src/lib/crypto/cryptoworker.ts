import {dT} from '../bin_utils';
import CryptoWorkerMethods from './crypto_methods';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

class CryptoWorker extends CryptoWorkerMethods {
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

  private utils: {[name: string]: (...args: any[]) => any} = {};

  constructor() {
    super();
    console.log(dT(), 'CW constructor');

    /// #if MTPROTO_WORKER
    Promise.all([
      import('./crypto_utils').then(utils => {
        Object.assign(this.utils, {
          'sha1-hash': utils.sha1HashSync,
          'sha256-hash': utils.sha256HashSync,
          'pbkdf2': utils.hash_pbkdf2,
          'aes-encrypt': utils.aesEncryptSync,
          'aes-decrypt': utils.aesDecryptSync,
          'rsa-encrypt': utils.rsaEncrypt,
          'factorize': utils.pqPrimeFactorization,
          'mod-pow': utils.bytesModPow,
          'unzip': utils.gzipUncompress
        });
      })/* ,

      import('../bin_utils').then(utils => {
        this.utils.unzip = utils.gzipUncompress;
      }) */
    ]);
    /// #else
    if(window.Worker) {
      import('./crypto.worker.js').then((worker: any) => {
        var tmpWorker = new worker.default();
        //var tmpWorker = new Worker();
        tmpWorker.onmessage = (e: any) => {
          if(!this.webWorker) {
            this.webWorker = tmpWorker;
            console.info(dT(), 'CW set webWorker');
            this.releasePending();
          } else {
            this.finalizeTask(e.data.taskID, e.data.result);
          }
        };

        tmpWorker.onerror = (error: any) => {
          console.error('CW error', error);
          this.webWorker = false;
        };
      });
    }
    /// #endif
  }

  private finalizeTask(taskID: number, result: any) {
    let deferred = this.awaiting[taskID];
    if(deferred !== undefined) {
      this.debug && console.log(dT(), 'CW done', deferred.taskName, result);
      deferred.resolve(result);
      delete this.awaiting[taskID];
    }
  }

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.debug && console.log(dT(), 'CW start', task, args);

    /// #if MTPROTO_WORKER
    return Promise.resolve<T>(this.utils[task](...args));
    /// #else
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
    /// #endif
  }

  private releasePending() {
    if(this.webWorker) {
      this.pending.forEach(pending => {
        (this.webWorker as Worker).postMessage(pending);
      });

      this.pending.length = 0;
    }
  }
}

const cryptoWorker = new CryptoWorker();
//(window as any).CryptoWorker = cryptoWorker;
export default cryptoWorker;

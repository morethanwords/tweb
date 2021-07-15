/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

// import { MOUNT_CLASS_TO } from '../../config/debug';
import CryptoWorkerMethods, { CryptoMethods } from './crypto_methods';

/// #if MTPROTO_WORKER
import { aesDecryptSync, aesEncryptSync, bytesModPow, gzipUncompress, hash_pbkdf2, pqPrimeFactorization, rsaEncrypt, sha1HashSync, sha256HashSync } from './crypto_utils';
import { computeSRP } from './srp';
/// #endif

type Task = {
  taskId: number,
  task: string,
  args: any[]
};

class CryptoWorker extends CryptoWorkerMethods {
  private webWorker: Worker | boolean = false;
  private taskId = 0;
  private awaiting: {
    [id: number]: {
      resolve: any,
      reject: any,
      taskName: string
    }
  } = {} as any;
  private pending: Array<Task> = [];
  private debug = false;

  private utils: CryptoMethods;

  constructor() {
    super();
    console.log('CW constructor');

    /// #if MTPROTO_WORKER
    this.utils = {
      'sha1-hash': sha1HashSync,
      'sha256-hash': sha256HashSync,
      'pbkdf2': hash_pbkdf2,
      'aes-encrypt': aesEncryptSync,
      'aes-decrypt': aesDecryptSync,
      'rsa-encrypt': rsaEncrypt,
      'factorize': pqPrimeFactorization,
      'mod-pow': bytesModPow,
      'gzipUncompress': gzipUncompress,
      'computeSRP': computeSRP
    };

    // Promise.all([
    //   import('./crypto_utils').then(utils => {
    //     Object.assign(this.utils, {
    //       'sha1-hash': utils.sha1HashSync,
    //       'sha256-hash': utils.sha256HashSync,
    //       'pbkdf2': utils.hash_pbkdf2,
    //       'aes-encrypt': utils.aesEncryptSync,
    //       'aes-decrypt': utils.aesDecryptSync,
    //       'rsa-encrypt': utils.rsaEncrypt,
    //       'factorize': utils.pqPrimeFactorization,
    //       'mod-pow': utils.bytesModPow,
    //       'gzipUncompress': utils.gzipUncompress,
    //     });
    //   }),

    //   import('./srp').then(srp => {
    //     this.utils.computeSRP = srp.computeSRP;
    //   })/* ,

    //   import('../bin_utils').then(utils => {
    //     this.utils.unzip = utils.gzipUncompress;
    //   }) */
    // ]);

    return;
    /// #else
    if(window.Worker) {
      import('./crypto.worker.js').then((worker: any) => {
        var tmpWorker = new worker.default();
        //var tmpWorker = new Worker();
        tmpWorker.onmessage = (e: any) => {
          if(!this.webWorker) {
            this.webWorker = tmpWorker;
            console.info('CW set webWorker');
            this.releasePending();
          } else {
            this.finalizeTask(e.data.taskId, e.data.result);
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

  /// #if !MTPROTO_WORKER
  private finalizeTask(taskId: number, result: any) {
    let deferred = this.awaiting[taskId];
    if(deferred !== undefined) {
      this.debug && console.log('CW done', deferred.taskName, result);
      deferred.resolve(result);
      delete this.awaiting[taskId];
    }
  }
  /// #endif

  public performTaskWorker<T>(task: string, ...args: any[]) {
    this.debug && console.log('CW start', task, args);

    /// #if MTPROTO_WORKER
    // @ts-ignore
    return Promise.resolve<T>(this.utils[task](...args));
    /// #else
    return new Promise<T>((resolve, reject) => {
      this.awaiting[this.taskId] = {resolve, reject, taskName: task};
  
      let params = {
        task,
        taskId: this.taskId,
        args
      };

      //(this.webWorker as Worker).postMessage(params);
      this.pending.push(params);
      this.releasePending();
  
      this.taskId++;
    });
    /// #endif
  }

  /// #if !MTPROTO_WORKER
  private releasePending() {
    if(this.webWorker) {
      this.pending.forEach(pending => {
        (this.webWorker as Worker).postMessage(pending);
      });

      this.pending.length = 0;
    }
  }
  /// #endif
}

const cryptoWorker = new CryptoWorker();
// MOUNT_CLASS_TO.CryptoWorker = cryptoWorker;
export default cryptoWorker;

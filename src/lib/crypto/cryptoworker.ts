import {convertToArrayBuffer, convertToByteArray, dT} from '../bin_utils';

// @ts-ignore
//import Worker from './crypto.worker.js';

type Task = {
  taskID: number,
  task: string,
  args: any[]
};

class CryptoWorker {
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

  constructor() {
    console.log(dT(), 'CW constructor');

    if(window.Worker/*  && 1 == 2 */) {
      import('./crypto.worker.js').then((CryptoWebWorker: any) => {
        //console.log(CryptoWebWorker);
        var tmpWorker = new CryptoWebWorker.default();
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
          console.error('CW error', error/* , error.stack */);
          this.webWorker = false;
        };
      });
    }
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

  public sha1Hash(bytes: number[] | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    return this.performTaskWorker<Uint8Array>('sha1-hash', bytes);
  }

  public sha256Hash(bytes: any) {
    return this.performTaskWorker<number[]>('sha256-hash', bytes);
  }

  public pbkdf2(buffer: Uint8Array, salt: Uint8Array, iterations: number) {
    return this.performTaskWorker<ArrayBuffer>('pbkdf2', buffer, salt, iterations);
  }

  public aesEncrypt(bytes: any, keyBytes: any, ivBytes: any) {
    return this.performTaskWorker<ArrayBuffer>('aes-encrypt', convertToArrayBuffer(bytes), 
      convertToArrayBuffer(keyBytes), convertToArrayBuffer(ivBytes));
  }

  public aesDecrypt(encryptedBytes: any, keyBytes: any, ivBytes: any): Promise<ArrayBuffer> {
    return this.performTaskWorker<ArrayBuffer>('aes-decrypt', 
      encryptedBytes, keyBytes, ivBytes)
      .then(bytes => convertToArrayBuffer(bytes));
  }

  public rsaEncrypt(publicKey: {modulus: string, exponent: string}, bytes: any): Promise<number[]> {
    return this.performTaskWorker<number[]>('rsa-encrypt', publicKey, bytes);
  }

  public factorize(bytes: any) {
    bytes = convertToByteArray(bytes);

    return this.performTaskWorker<[number[], number[], number]>('factorize', bytes);
  }

  public modPow(x: any, y: any, m: any) {
    return this.performTaskWorker<number[]>('mod-pow', x, y, m);
  }

  public gzipUncompress<T>(bytes: ArrayBuffer, toString?: boolean) {
    return this.performTaskWorker<T>('unzip', bytes, toString);
  }
}

const cryptoWorker = new CryptoWorker();
(window as any).CryptoWorker = cryptoWorker;
export default cryptoWorker;

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

  // @ts-ignore
  // private webCrypto = Config.Modes.webcrypto && window.crypto && (window.crypto.subtle || window.crypto.webkitSubtle); /* || window.msCrypto && window.msCrypto.subtle*/
  // private useSha1Crypto = this.webCrypto && this.webCrypto.digest !== undefined;
  // private useSha256Crypto = this.webCrypto && this.webCrypto.digest !== undefined;

  constructor() {
    console.log(dT(), 'CW constructor');

    if(window.Worker/*  && 1 == 2 */) {
      import('./crypto.worker.js').then((CryptoWebWorker: any) => {
        console.log(CryptoWebWorker);
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
    //if(this.webWorker) {
      return this.performTaskWorker<Uint8Array>('sha1-hash', bytes);
    //}

    /* if(this.useSha1Crypto) {
      console.error('usesha1crypto');
      // We don't use buffer since typedArray.subarray(...).buffer gives the whole buffer and not sliced one. webCrypto.digest supports typed array
      return new Promise((resolve, reject) => {
        var bytesTyped = Array.isArray(bytes) ? convertToUint8Array(bytes) : bytes;
        // console.log(dT(), 'Native sha1 start')

        this.webCrypto.digest({name: 'SHA-1'}, bytesTyped).then((digest: ArrayBuffer) => {
          // console.log(dT(), 'Native sha1 done')
          resolve(digest);
        }, (e: ErrorEvent) => {
          console.error('Crypto digest error', e);
          this.useSha1Crypto = false;
          resolve(sha1HashSync(bytes));
        })
      });
    }

    return Promise.resolve(sha1HashSync(bytes)); */
  }

  public sha256Hash(bytes: any) {
    //if(this.webWorker) {
      return this.performTaskWorker<number[]>('sha256-hash', bytes);
    //}

    /* if(this.useSha256Crypto) {
      return new Promise((resolve, reject) => {
        var bytesTyped = Array.isArray(bytes) ? convertToUint8Array(bytes) : bytes;
        // console.log(dT(), 'Native sha1 start')
        this.webCrypto.digest({name: 'SHA-256'}, bytesTyped).then((digest: ArrayBuffer) => {
          // console.log(dT(), 'Native sha1 done')
          resolve(digest);
        }, (e: ErrorEvent) => {
          console.error('Crypto digest error', e);
          this.useSha256Crypto = false;
          resolve(sha256HashSync(bytes));
        })
      });
    }

    return Promise.resolve(sha256HashSync(bytes)); */
  }

  public pbkdf2(buffer: Uint8Array, salt: Uint8Array, iterations: number) {
    //if(this.webWorker) {
      return this.performTaskWorker<ArrayBuffer>('pbkdf2', buffer, salt, iterations);
    //}

    //return hash_pbkdf2(buffer, salt, iterations);
  }

  public aesEncrypt(bytes: any, keyBytes: any, ivBytes: any) {
    //if(this.webWorker) {
      return this.performTaskWorker<ArrayBuffer>('aes-encrypt', convertToArrayBuffer(bytes), 
        convertToArrayBuffer(keyBytes), convertToArrayBuffer(ivBytes));
    //}

    //return Promise.resolve<ArrayBuffer>(convertToArrayBuffer(aesEncryptSync(bytes, keyBytes, ivBytes)));
  }

  public aesDecrypt(encryptedBytes: any, keyBytes: any, ivBytes: any): Promise<ArrayBuffer> {
    //if(this.webWorker) {
      return this.performTaskWorker<ArrayBuffer>('aes-decrypt', 
        encryptedBytes, keyBytes, ivBytes)
        .then(bytes => convertToArrayBuffer(bytes));
    //}

    //return Promise.resolve<ArrayBuffer>(convertToArrayBuffer(aesDecryptSync(encryptedBytes, keyBytes, ivBytes)));
  }

  public rsaEncrypt(publicKey: {modulus: string, exponent: string}, bytes: any): Promise<number[]> {
    return this.performTaskWorker<number[]>('rsa-encrypt', publicKey, bytes);
  }

  public factorize(bytes: any) {
    bytes = convertToByteArray(bytes);

    //if(this.webWorker) {
      return this.performTaskWorker<[number[], number[], number]>('factorize', bytes);
    //}

    //return Promise.resolve(pqPrimeFactorization(bytes));
  }

  public modPow(x: any, y: any, m: any) {
    //if(this.webWorker) {
      return this.performTaskWorker<number[]>('mod-pow', x, y, m);
    //}

    //return Promise.resolve(bytesModPow(x, y, m));
  }

  public gzipUncompress<T>(bytes: ArrayBuffer, toString?: boolean) {
    //if(this.webWorker) {
      return this.performTaskWorker<T>('unzip', bytes, toString);
    //}

    //return Promise.resolve(gzipUncompress(bytes, toString) as T);
  }
}

const cryptoWorker = new CryptoWorker();

(window as any).CryptoWorker = cryptoWorker;

export default cryptoWorker;

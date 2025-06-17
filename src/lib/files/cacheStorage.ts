/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Modes from '../../config/modes';
import blobConstruct from '../../helpers/blob/blobConstruct';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import makeError from '../../helpers/makeError';
import readBlobAsUint8Array from '../../helpers/blob/readBlobAsUint8Array';

import EncryptionKeyStore from '../passcode/keyStore';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import DeferredIsUsingPasscode from '../passcode/deferredIsUsingPasscode';

import MemoryWriter from './memoryWriter';
import FileStorage from './fileStorage';


type CacheStorageDbConfigEntry = {
  encryptable: boolean;
};

const cacheStorageDbConfig = {
  cachedAssets: {
    encryptable: false
  },
  cachedBackgrounds: {
    encryptable: false
  },
  cachedFiles: {
    encryptable: true
  },
  cachedStreamChunks: {
    encryptable: true
  },
  cachedHlsQualityFiles: {
    encryptable: true
  },
  cachedHlsStreamChunks: {
    encryptable: true
  }
} satisfies Record<string, CacheStorageDbConfigEntry>;

export type CacheStorageDbName = keyof typeof cacheStorageDbConfig;

export default class CacheStorageController implements FileStorage {
  private static STORAGES: CacheStorageController[] = [];
  private openDbPromise: Promise<Cache>;
  private config: CacheStorageDbConfigEntry;

  private useStorage = true;

  private static disabledPromise: CancellablePromise<void>;

  // private log: ReturnType<typeof logger> = logger('CS');

  constructor(private dbName: CacheStorageDbName) {
    if(Modes.test) {
      this.dbName += '_test';
    }

    if(CacheStorageController.STORAGES.length) {
      this.useStorage = CacheStorageController.STORAGES[0].useStorage;
    }

    this.config = Object.entries(cacheStorageDbConfig).find(([name]) => name === dbName)?.[1];

    this.openDatabase();
    CacheStorageController.STORAGES.push(this);
  }

  private static async encrypt(blob: Blob) {
    const key = await EncryptionKeyStore.get();
    const dataAsBuffer = await readBlobAsUint8Array(blob);

    const type = blob.type;

    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-encrypt',
      args: [{
        key,
        data: dataAsBuffer
      }],
      transfer: [dataAsBuffer.buffer]
    });

    return new Blob([result], {type});
  }

  private static async decrypt(blob: Blob) {
    const key = await EncryptionKeyStore.get();
    const dataAsBuffer = await readBlobAsUint8Array(blob);

    const type = blob.type;

    const result = await cryptoMessagePort.invokeCryptoNew({
      method: 'aes-local-decrypt',
      args: [{
        key,
        encryptedData: dataAsBuffer
      }],
      transfer: [dataAsBuffer.buffer]
    });

    return new Blob([result], {type});
  }

  private async waitToEnable() {
    if(CacheStorageController.disabledPromise) await CacheStorageController.disabledPromise;
  }

  private openDatabase(): Promise<Cache> {
    return this.openDbPromise ?? (this.openDbPromise = caches.open(this.dbName));
  }

  public delete(entryName: string) {
    return this.timeoutOperation((cache) => cache.delete('/' + entryName));
  }

  public deleteAll() {
    return caches.delete(this.dbName);
  }

  public async has(entryName: string) {
    const response = await this.timeoutOperation((cache) => cache.match('/' + entryName));
    return !!response;
  }

  public async get(entryName: string) {
    await this.waitToEnable();

    const response = await this.timeoutOperation((cache) => cache.match('/' + entryName));
    if(!response) return undefined;

    if(this.config?.encryptable && await DeferredIsUsingPasscode.isUsingPasscode()) {
      return new Response(
        await CacheStorageController.decrypt(await response.blob()),
        {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        }
      );
    }

    return response;
  }

  public async save(entryName: string, response: Response) {
    await this.waitToEnable();

    let result = response;

    if(this.config?.encryptable && await DeferredIsUsingPasscode.isUsingPasscode()) {
      result = new Response(
        await CacheStorageController.encrypt(await response.blob()),
        {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText
        }
      );
    }

    return this.timeoutOperation((cache) => cache.put('/' + entryName, result));
  }

  public getFile(fileName: string, method: 'blob' | 'json' | 'text' = 'blob'): Promise<any> {
    // if(method === 'blob') {
    //   return Promise.reject(makeError('NO_ENTRY_FOUND'));
    // }

    // const str = `get fileName: ${fileName}`;
    // console.time(str);
    return this.get(fileName).then((response) => {
      if(!response) {
        // console.warn('getFile:', response, fileName);
        throw makeError('NO_ENTRY_FOUND');
      }

      const promise = response[method]();
      // promise.then(() => {
      //   console.timeEnd(str);
      // });
      return promise;
    });
  }

  public saveFile(fileName: string, blob: Blob | Uint8Array) {
    // return Promise.resolve(blobConstruct([blob]));
    if(!(blob instanceof Blob)) {
      blob = blobConstruct(blob);
    }

    const response = new Response(blob, {
      headers: {
        'Content-Length': '' + blob.size
      }
    });

    return this.save(fileName, response).then(() => blob as Blob);
  }

  public timeoutOperation<T>(callback: (cache: Cache) => Promise<T>) {
    if(!this.useStorage) {
      return Promise.reject(makeError('STORAGE_OFFLINE'));
    }

    return new Promise<T>(async(resolve, reject) => {
      let rejected = false;
      const timeout = setTimeout(() => {
        reject();
        // console.warn('CACHESTORAGE TIMEOUT');
        rejected = true;
      }, 15e3);

      try {
        const cache = await this.openDatabase();
        if(!cache) {
          this.useStorage = false;
          this.openDbPromise = undefined;
          throw 'no cache?';
        }

        const res = await callback(cache);

        if(rejected) return;
        resolve(res);
      } catch(err) {
        reject(err);
      }

      clearTimeout(timeout);
    });
  }

  public prepareWriting(fileName: string, fileSize: number, mimeType: string) {
    return {
      deferred: deferredPromise<Blob>(),
      getWriter: () => {
        const writer = new MemoryWriter(mimeType, fileSize, (blob) => {
          return this.saveFile(fileName, blob).catch(() => blob);
        });

        return writer;
      }
    };
  }

  public static toggleStorage(enabled: boolean, _clearWrite: boolean) {
    this.STORAGES.forEach((storage) => {
      storage.useStorage = enabled;
    });
    return Promise.resolve();
  }

  public static async deleteAllStorages() {
    const storageNames = Object.keys(cacheStorageDbConfig) as CacheStorageDbName[];

    await Promise.all(storageNames.map(async(storageName) => {
      const storage = new CacheStorageController(storageName);
      await storage.deleteAll();
    }));
  }


  public static temporarilyToggle(enabled: boolean) {
    if(enabled) {
      this.disabledPromise?.resolve();
      this.disabledPromise = undefined;
    } else {
      this.disabledPromise = deferredPromise();
    }
  }

  public static async clearEncryptableStorages() {
    const encryptableStorageNames = Object.entries(cacheStorageDbConfig)
    .filter(([, {encryptable}]) => encryptable)
    .map(([name]) => name) as CacheStorageDbName[];

    await Promise.all(encryptableStorageNames.map(async(storageName) => {
      // Make sure we have all encryptable storages in current thread, can't get from .STORAGES
      const storage = new CacheStorageController(storageName);

      // await storage.deleteAll();
      await storage.timeoutOperation(async(cache) => {
        const keys = await cache.keys();
        await Promise.all(keys.map(request => cache.delete(request)));
      });
    }));
  }
}

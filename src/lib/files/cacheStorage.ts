/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Modes from '@config/modes';
import blobConstruct from '@helpers/blob/blobConstruct';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import readBlobAsUint8Array from '@helpers/blob/readBlobAsUint8Array';

import EncryptionKeyStore from '@lib/passcode/keyStore';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';

import MemoryWriter from '@lib/files/memoryWriter';
import FileStorage from '@lib/files/fileStorage';
import pause from '@helpers/schedulers/pause';
import {HTTPHeaderNames} from '@lib/constants';


type CacheStorageDbConfigEntry = {
  encryptable: boolean;
};

type SaveArgs = {
  entryName: string;
  response: Response;
  size: number;
  contentType?: string;
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

const defaultOperationTimeout = 15e3;
const minimalBlockingIterationTotalTimeout = defaultOperationTimeout; // make sure this is at least a few seconds if the default one gets modified

const minimalBlockingAllowedTimePerBulk = 4;

type MinimalBlockingIterateResponsesCallbackArgs = {
  request: Request;
  response: Response;
  cache: Cache;
};

export type CacheStorageDbName = keyof typeof cacheStorageDbConfig;

export default class CacheStorageController implements FileStorage {
  private static STORAGES: CacheStorageController[] = [];
  private openDbPromise: Promise<Cache>;
  private config: CacheStorageDbConfigEntry;

  private useStorage = true;

  private static disabledPromise: CancellablePromise<void>;

  private static disabledPromisesByKey: Map<string, CancellablePromise<void>> = new Map();

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

  public forget() {
    CacheStorageController.STORAGES = CacheStorageController.STORAGES.filter(storage => storage !== this);
  }

  get isEncryptable() {
    return this.config?.encryptable;
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

  private getDisabledPromises() {
    return [CacheStorageController.disabledPromise, CacheStorageController.disabledPromisesByKey.get(this.dbName)].filter(Boolean);
  }

  private async waitToEnable() {
    // Note: even if initially there was one disabled promise, another one could be added while we are waiting

    let disabledPromises: CancellablePromise<void>[];
    while((disabledPromises = this.getDisabledPromises()).length) {
      await Promise.all(disabledPromises);
    }
  }

  private openDatabase(): Promise<Cache> {
    return this.openDbPromise ?? (this.openDbPromise = caches.open(this.dbName));
  }

  public delete(entryName: string) {
    return this.timeoutOperation((cache) => cache.delete('/' + entryName));
  }

  /**
   * Requires reconnection in order to save to disc again
   */
  public deleteAll() {
    this.openDbPromise = undefined;
    return caches.delete(this.dbName);
  }

  public reset() {
    this.openDbPromise = undefined;
  }

  public async minimalBlockingIterateResponses(callback: (args: MinimalBlockingIterateResponsesCallbackArgs) => void | Promise<void>) {
    await this.waitToEnable();

    const batchSize = 10;

    await this.timeoutOperation(async(cache) => {
      const allKeys = await cache.keys();

      let prevTime = performance.now();

      for(let i = 0; i < allKeys.length; i += batchSize) {
        const slice = allKeys.slice(i, i + batchSize);

        await Promise.all(slice.map(async(key) => {
          const response = await cache.match(key);

          const callbackResult = callback({request: key, response, cache});
          if(callbackResult instanceof Promise) await callbackResult;
        }));

        const now = performance.now();
        if(now - prevTime > minimalBlockingAllowedTimePerBulk) {
          await pause(0); // give back control to the event loop
          prevTime = now;
        }
      }
    }, minimalBlockingIterationTotalTimeout);
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

  public async save({entryName, response, size, contentType}: SaveArgs) {
    await this.waitToEnable();

    response.headers.set(HTTPHeaderNames.cachedTime, Math.floor(Date.now() / 1000 | 0).toString());
    response.headers.set(HTTPHeaderNames.contentLength, size.toString());

    if(contentType) {
      response.headers.set(HTTPHeaderNames.contentType, contentType);
    }

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

    const response = new Response(blob);

    return this.save({entryName: fileName, response, size: blob.size}).then(() => blob as Blob);
  }

  public timeoutOperation<T>(callback: (cache: Cache) => Promise<T>, operationTimeout = defaultOperationTimeout) {
    if(!this.useStorage) {
      return Promise.reject(makeError('STORAGE_OFFLINE'));
    }

    return new Promise<T>(async(resolve, reject) => {
      let rejected = false;
      const timeout = setTimeout(() => {
        reject();
        // console.warn('CACHESTORAGE TIMEOUT');
        rejected = true;
      }, operationTimeout);

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
    } else if(!this.disabledPromise) {
      this.disabledPromise = deferredPromise();
    }
  }

  public static temporarilyToggleByName(name: CacheStorageDbName, enabled: boolean) {
    const hadPromise = this.disabledPromisesByKey.has(name);

    if(enabled) {
      this.disabledPromisesByKey.get(name)?.resolve();
      this.disabledPromisesByKey.delete(name);
    } else if(!hadPromise) {
      this.disabledPromisesByKey.set(name, deferredPromise());
    }
  }

  public static temporarilyToggleByNames(names: CacheStorageDbName[], enabled: boolean) {
    names.forEach(name => this.temporarilyToggleByName(name, enabled));
  }

  public static async clearEncryptableStorages() {
    const encryptableStorageNames = Object.entries(cacheStorageDbConfig)
    .filter(([, {encryptable}]) => encryptable)
    .map(([name]) => name) as CacheStorageDbName[];

    await this.clearStoragesByNames(encryptableStorageNames);
  }

  public static async clearStoragesByNames(names: CacheStorageDbName[]) {
    await Promise.all(names.map(async(storageName) => {
      // Make sure we have all storages in current thread, can't get from .STORAGES
      const storage = new CacheStorageController(storageName);

      try {
        await storage.deleteAll();
      } catch(e) {
        console.error(e);
      } finally {
        storage.forget();
      }

      // Don't redo to this, as if the cache is too large, it will throw on `cache.keys()`
      // await storage.timeoutOperation(async(cache) => {
      //   const keys = await cache.keys();
      //   await Promise.all(keys.map(request => cache.delete(request)));
      // });
    }));
  }

  public static getOpenEncryptableStorages() {
    return this.STORAGES.filter(storage => storage.isEncryptable);
  }

  public static resetOpenEncryptableCacheStorages() {
    const storages = this.getOpenEncryptableStorages();
    storages.forEach(storage => storage.reset());
  }

  public static getOpenStoragesByNames(names: CacheStorageDbName[]) {
    return this.STORAGES.filter(storage => names.includes(storage.dbName));
  }

  public static async resetOpenStoragesByNames(names: CacheStorageDbName[]) {
    const storages = this.getOpenStoragesByNames(names);
    storages.forEach(storage => storage.reset());
  }
}

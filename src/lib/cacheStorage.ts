/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Modes from '../config/modes';
import blobConstruct from '../helpers/blob/blobConstruct';
import FileManager from './fileManager';
//import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
//import { logger } from './polyfill';

export type CacheStorageDbName = 'cachedFiles' | 'cachedStreamChunks' | 'cachedAssets';

export default class CacheStorageController {
  private static STORAGES: CacheStorageController[] = [];
  private openDbPromise: Promise<Cache>;

  private useStorage = true;

  //private log: ReturnType<typeof logger> = logger('CS');

  constructor(private dbName: CacheStorageDbName) {
    if(Modes.test) {
      this.dbName += '_test';
    }

    if(CacheStorageController.STORAGES.length) {
      this.useStorage = CacheStorageController.STORAGES[0].useStorage;
    }
    
    this.openDatabase();
    CacheStorageController.STORAGES.push(this);
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

  public get(entryName: string) {
    return this.timeoutOperation((cache) => cache.match('/' + entryName));
  }

  public save(entryName: string, response: Response) {
    // return new Promise((resolve) => {}); // DEBUG
    return this.timeoutOperation((cache) => cache.put('/' + entryName, response));
  }

  public getFile(fileName: string, method: 'blob' | 'json' | 'text' = 'blob'): Promise<any> {
    /* if(method === 'blob') {
      return Promise.reject();
    } */

    // const str = `get fileName: ${fileName}`;
    // console.time(str);
    return this.get(fileName).then((response) => {
      if(!response) {
        //console.warn('getFile:', response, fileName);
        throw 'NO_ENTRY_FOUND';
      }

      const promise = response[method]();
      // promise.then(() => {
      //   console.timeEnd(str);
      // });
      return promise;
    });
  }

  public saveFile(fileName: string, blob: Blob | Uint8Array) {
    //return Promise.resolve(blobConstruct([blob]));
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
      return Promise.reject('STORAGE_OFFLINE');
    }

    return new Promise<T>(async(resolve, reject) => {
      let rejected = false;
      const timeout = setTimeout(() => {
        reject();
        //console.warn('CACHESTORAGE TIMEOUT');
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

  public getFileWriter(fileName: string, fileSize: number, mimeType: string) {
    const fakeWriter = FileManager.getFakeFileWriter(mimeType, fileSize, (blob) => {
      return this.saveFile(fileName, blob).catch(() => blob);
    });

    return Promise.resolve(fakeWriter);
  }

  public static toggleStorage(enabled: boolean, clearWrite: boolean) {
    return Promise.all(this.STORAGES.map((storage) => {
      storage.useStorage = enabled;

      if(!clearWrite) {
        return;
      }
      
      if(!enabled) {
        return storage.deleteAll();
      }
    }));
  }
}

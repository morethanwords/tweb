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

import { Database } from '../config/databases';
import Modes from '../config/modes';
import blobConstruct from '../helpers/blob/blobConstruct';
import { safeAssign } from '../helpers/object';
import { logger } from './logger';

/**
 * https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/createIndex
 */
export type IDBIndex = {
  indexName: string,
  keyPath: string,
  objectParameters: IDBIndexParameters
};

export type IDBStore = {
  name: string, 
  indexes?: IDBIndex[]
};

export type IDBOptions = {
  name?: string,
  storeName: string,
  stores?: IDBStore[],
  version?: number
};

const DEBUG = false;

export default class IDBStorage<T extends Database<any>> {
  private static STORAGES: IDBStorage<Database<any>>[] = [];
  private openDbPromise: Promise<IDBDatabase>;
  private db: IDBDatabase;
  private storageIsAvailable = true;

  private log: ReturnType<typeof logger>;
  
  private name: string;
  private version: number;
  private stores: IDBStore[];
  private storeName: T['stores'][0]['name'];

  constructor(db: T, storeName: typeof db['stores'][0]['name']) {
    safeAssign(this, db);

    if(Modes.test) {
      this.name += '_test';
    }

    this.storeName = storeName;

    this.log = logger('IDB-' + this.storeName);

    this.openDatabase(true);

    IDBStorage.STORAGES.push(this);
  }

  public static closeDatabases(preserve?: IDBStorage<Database<any>>) {
    this.STORAGES.forEach(storage => {
      if(preserve && preserve === storage) {
        return;
      }

      const db = storage.db;
      if(db) {
        db.onclose = () => {};
        db.close();
      }
    });
  }

  /**
   * ! WARNING ! function requires at least one opened connection
   */
  /* public static clearObjectStores() {
    const storage = this.STORAGES[0];
    this.closeDatabases(storage);

    const names = Array.from(storage.db.objectStoreNames);
    const promises = names.map(name => storage.clear(name));
    return Promise.all(promises);
  } */

  /* public static deleteDatabase() {
    this.closeDatabases();

    const storages = this.STORAGES;
    const dbNames = Array.from(new Set(storages.map(storage => storage.name)));
    const promises = dbNames.map(dbName => {
      return new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
  
        deleteRequest.onerror = () => {
          reject();
        };
  
        deleteRequest.onsuccess = () => {
          resolve();
        };
      });
    });

    return Promise.all(promises);
  } */

  public isAvailable() {
    return this.storageIsAvailable;
  }

  public openDatabase(createNew = false): Promise<IDBDatabase> {
    if(this.openDbPromise && !createNew) {
      return this.openDbPromise;
    }

    const createObjectStore = (db: IDBDatabase, store: IDBStore) => {
      const os = db.createObjectStore(store.name);

      if(store.indexes?.length) {
        for(const index of store.indexes) {
          os.createIndex(index.indexName, index.keyPath, index.objectParameters);
        }
      }
    };

    try {
      var request = indexedDB.open(this.name, this.version);

      if(!request) {
        return Promise.reject();
      }
    } catch(error) {
      this.log.error('error opening db', (error as Error).message);
      this.storageIsAvailable = false;
      return Promise.reject(error);
    }

    let finished = false;
    setTimeout(() => {
      if(!finished) {
        request.onerror({type: 'IDB_CREATE_TIMEOUT'} as Event);
      }
    }, 3000);

    return this.openDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = (event) => {
        finished = true;
        const db = request.result;
        let calledNew = false;

        this.log('Opened');
  
        db.onerror = (error) => {
          this.storageIsAvailable = false;
          this.log.error('Error creating/accessing IndexedDB database', error);
          reject(error);
        };

        db.onclose = (e) => {
          this.log.error('closed:', e);
          !calledNew && this.openDatabase();
        };

        db.onabort = (e) => {
          this.log.error('abort:', e);
          const transaction = e.target as IDBTransaction;
          
          this.openDatabase(calledNew = true);

          if(transaction.onerror) {
            transaction.onerror(e);
          }

          db.close();
        };

        db.onversionchange = (e) => {
          this.log.error('onversionchange, lol?');
        };

        resolve(this.db = db);
      };
  
      request.onerror = (event) => {
        finished = true;
        this.storageIsAvailable = false;
        this.log.error('Error creating/accessing IndexedDB database', event);
        reject(event);
      };
  
      request.onupgradeneeded = (event) => {
        finished = true;
        this.log.warn('performing idb upgrade from', event.oldVersion, 'to', event.newVersion);

        // @ts-ignore
        var db = event.target.result as IDBDatabase;
        this.stores.forEach((store) => {
          /* if(db.objectStoreNames.contains(store.name)) {
            //if(event.oldVersion === 1) {
              db.deleteObjectStore(store.name);
            //}
          } */
    
          if(!db.objectStoreNames.contains(store.name)) {
            createObjectStore(db, store);
          }
        });
      };
    });
  }

  public delete(entryName: string | string[]): Promise<void> {
    //return Promise.resolve();
    if(!Array.isArray(entryName)) {
      entryName = [].concat(entryName);
    }

    return this.getObjectStore('readwrite', (objectStore) => {
      return (entryName as string[]).map((entryName) => objectStore.delete(entryName));
    }, DEBUG ? 'delete: ' + entryName.join(', ') : '');
  }

  public clear(storeName?: IDBStorage<T>['storeName']) {
    return this.getObjectStore('readwrite', (objectStore) => objectStore.clear(), DEBUG ? 'clear' : '', storeName);
  }

  public save(entryName: string | string[], value: any | any[]) {
    // const handleError = (error: Error) => {
    //   this.log.error('save: transaction error:', entryName, value, db, error, error && error.name);
    //   if((!error || error.name === 'InvalidStateError')/*  && false */) {
    //     setTimeout(() => {
    //       this.save(entryName, value);
    //     }, 2e3);
    //   } else {
    //     //console.error('IndexedDB saveFile transaction error:', error, error && error.name);
    //   }
    // };

    if(!Array.isArray(entryName)) {
      entryName = [].concat(entryName);
      value = [].concat(value);
    }
    
    return this.getObjectStore('readwrite', (objectStore) => {
      return (entryName as string[]).map((entryName, idx) => objectStore.put(value[idx], entryName));
    }, DEBUG ? 'save: ' + entryName.join(', ') : '');
  }

  public saveFile(fileName: string, blob: Blob | Uint8Array) {
    //return Promise.resolve(blobConstruct([blob]));
    if(!(blob instanceof Blob)) {
      blob = blobConstruct([blob]) as Blob;
    }

    return this.save(fileName, blob);
  }

  /* public saveFileBase64(db: IDBDatabase, fileName: string, blob: Blob | any): Promise<Blob> {
    if(this.getBlobSize(blob) > 10 * 1024 * 1024) {
      return Promise.reject();
    }

    if(!(blob instanceof Blob)) {
      var safeMimeType = blobSafeMimeType(blob.type || 'image/jpeg');
      var address = 'data:' + safeMimeType + ';base64,' + bytesToBase64(blob);
      return this.storagePutB64String(db, fileName, address).then(() => {
        return blob;
      });
    }

    try {
      var reader = new FileReader();
    } catch (e) {
      this.storageIsAvailable = false;
      return Promise.reject();
    }

    let promise = new Promise<Blob>((resolve, reject) => {
      reader.onloadend = () => {
        this.storagePutB64String(db, fileName, reader.result as string).then(() => {
          resolve(blob);
        }, reject);
      }
  
      reader.onerror = reject;
    });
    

    try {
      reader.readAsDataURL(blob);
    } catch (e) {
      this.storageIsAvailable = false;
      return Promise.reject();
    }

    return promise;
  }

  public storagePutB64String(db: IDBDatabase, fileName: string, b64string: string) {
    try {
      var objectStore = db.transaction([this.storeName], 'readwrite')
        .objectStore(this.storeName);
      var request = objectStore.put(b64string, fileName);
    } catch(error) {
      this.storageIsAvailable = false;
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      request.onsuccess = function(event) {
        resolve();
      };
  
      request.onerror = reject;
    });
  }

  public getBlobSize(blob: any) {
    return blob.size || blob.byteLength || blob.length;
  } */

  public get<T>(entryName: string[]): Promise<T[]>;
  public get<T>(entryName: string): Promise<T>;
  public get<T>(entryName: string | string[]): Promise<T> | Promise<T[]> {
    //return Promise.reject();

    if(!Array.isArray(entryName)) {
      entryName = [].concat(entryName);
    }

    return this.getObjectStore<T>('readonly', (objectStore) => {
      return (entryName as string[]).map((entryName) => objectStore.get(entryName));
    }, DEBUG ? 'get: ' + entryName.join(', ') : '');
  }

  private getObjectStore<T>(mode: IDBTransactionMode, objectStore: (objectStore: IDBObjectStore) => IDBRequest | IDBRequest[], log?: string, storeName = this.storeName) {
    let perf: number;

    if(log) {
      perf = performance.now();
      this.log(log + ': start');
    }

    return this.openDatabase().then((db) => {
      return new Promise<T>((resolve, reject) => {
        /* if(mode === 'readwrite') {
          return;
        } */

        const transaction = db.transaction([storeName], mode);

        transaction.onerror = (e) => {
          clearTimeout(timeout);
          reject(transaction.error);
        };
  
        transaction.oncomplete = (e) => {
          clearTimeout(timeout);

          if(log) {
            this.log(log + ': end', performance.now() - perf);
          }

          const results = r.map(r => r.result);
          resolve(isArray ? results : results[0]);
        };
  
        const timeout = setTimeout(() => {
          this.log.error('transaction not finished', transaction);
        }, 10000);
  
        /* transaction.addEventListener('abort', (e) => {
          //handleError();
          this.log.error('IndexedDB: transaction abort!', transaction.error);
        }); */
  
        const requests = objectStore(transaction.objectStore(storeName));

        const isArray = Array.isArray(requests);
        const r: IDBRequest[] = isArray ? requests : [].concat(requests) as any;

        // const length = r.length;
        // /* let left = length;

        // const onRequestFinished = (error?: Error) => {
        //   if(!--left) {
        //     resolve(result);
        //     clearTimeout(timeout);
        //   }
        // }; */

        // for(let i = 0; i < length; ++i) {
        //   const request = r[i];
        //   request.onsuccess = () => {
        //     onRequestFinished();
        //   };

        //   request.onerror = (e) => {
        //     onRequestFinished(transaction.error);
        //   };
        // }
      });
    });
  }

  public getAll<T>(): Promise<T[]> {
    return this.getObjectStore<T[]>('readonly', (objectStore) => objectStore.getAll(), DEBUG ? 'getAll' : '');
  }

  /* public getAllKeys(): Promise<Array<string>> {
    console.time('getAllEntries');
    return this.openDatabase().then((db) => {
      var objectStore = db.transaction([this.storeName], 'readonly')
        .objectStore(this.storeName);
      var request = objectStore.getAllKeys();

      return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
          // @ts-ignore
          var result = event.target.result;
          resolve(result);
          console.timeEnd('getAllEntries');
        }
  
        request.onerror = reject;
      });
    });
  } */

  /* public isFileExists(fileName: string): Promise<boolean> {
    console.time('isFileExists');
    return this.openDatabase().then((db) => {
      var objectStore = db.transaction([this.storeName], 'readonly')
        .objectStore(this.storeName);
      var request = objectStore.openCursor(fileName);

      return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
          // @ts-ignore
          var cursor = event.target.result;
          resolve(!!cursor);
          console.timeEnd('isFileExists');
        }
  
        request.onerror = reject;
      });
    });
  } */

  /* public getFileWriter(fileName: string, mimeType: string) {
    var fakeWriter = FileManager.getFakeFileWriter(mimeType, (blob) => {
      return this.saveFile(fileName, blob);
    });

    return Promise.resolve(fakeWriter);
  } */
}

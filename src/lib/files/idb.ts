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

import {Database} from '../../config/databases';
import Modes from '../../config/modes';
import makeError from '../../helpers/makeError';
import safeAssign from '../../helpers/object/safeAssign';
import {logger} from '../logger';

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

export class IDB {
  private static INSTANCES: IDB[] = [];
  private openDbPromise: Promise<IDBDatabase>;
  private db: IDBDatabase;
  private storageIsAvailable: boolean;
  private log: ReturnType<typeof logger>;
  private name: string;
  private version: number;
  private stores: IDBStore[];

  constructor(db: Database<any>) {
    safeAssign(this, db);

    if(Modes.test) {
      this.name += '_test';
    }

    this.storageIsAvailable = true;
    this.log = logger(['IDB', db.name].join('-'));
    this.log('constructor');

    this.openDatabase(true);

    IDB.INSTANCES.push(this);
  }

  public isAvailable() {
    return this.storageIsAvailable;
  }

  public openDatabase(createNew = false): Promise<IDBDatabase> {
    if(this.openDbPromise && !createNew) {
      return this.openDbPromise;
    }

    const createIndexes = (os: IDBObjectStore, store: IDBStore) => {
      const indexNames = Array.from(os.indexNames);
      for(const indexName of indexNames) {
        os.deleteIndex(indexName);
      }

      if(!store.indexes?.length) {
        return;
      }

      for(const index of store.indexes) {
        if(os.indexNames.contains(index.indexName)) {
          continue;
        }

        os.createIndex(index.indexName, index.keyPath, index.objectParameters);
      }
    };

    const createObjectStore = (db: IDBDatabase, store: IDBStore) => {
      const os = db.createObjectStore(store.name);
      createIndexes(os, store);
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
        request.onerror(makeError('IDB_CREATE_TIMEOUT') as Event);
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

        const target = event.target as IDBOpenDBRequest;
        const db = target.result;
        this.stores.forEach((store) => {
          /* if(db.objectStoreNames.contains(store.name)) {
            //if(event.oldVersion === 1) {
              db.deleteObjectStore(store.name);
            //}
          } */

          if(!db.objectStoreNames.contains(store.name)) {
            createObjectStore(db, store);
          } else {
            const txn = target.transaction;
            const os = txn.objectStore(store.name);
            createIndexes(os, store);
          }
        });
      };
    });
  }

  public static create<T extends Database<any>>(db: T) {
    return this.INSTANCES.find((instance) => instance.name === db.name) ?? new IDB(db);
  }

  public static closeDatabases(preserve?: IDB) {
    this.INSTANCES.forEach((storage) => {
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
}

export default class IDBStorage<T extends Database<any>, StoreName extends string = T['stores'][0]['name']> {
  private log: ReturnType<typeof logger>;
  private storeName: T['stores'][0]['name'];
  private idb: IDB;

  constructor(db: T, storeName: typeof db['stores'][0]['name']) {
    this.storeName = storeName;
    this.log = logger(['IDB', db.name, storeName].join('-'));
    this.idb = IDB.create(db);
  }

  /**
   * ! WARNING ! function requires at least one opened connection
   */
  /* public static clearObjectStores() {
    const storage = this.STORAGES[0];
    this.closeDatabases(storage);

    const names = Array.from(storage.db.objectStoreNames);
    const promises = names.map((name) => storage.clear(name));
    return Promise.all(promises);
  } */

  /* public static deleteDatabase() {
    this.closeDatabases();

    const storages = this.STORAGES;
    const dbNames = Array.from(new Set(storages.map((storage) => storage.name)));
    const promises = dbNames.map((dbName) => {
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

  public delete(entryName: string | string[], storeName?: StoreName): Promise<void> {
    // return Promise.resolve();
    const isArray = Array.isArray(entryName);
    if(!isArray) {
      entryName = [].concat(entryName);
    }

    return this.getObjectStore('readwrite', (objectStore) => {
      const promises = (entryName as string[]).map((entryName) => objectStore.delete(entryName));
      return isArray ? promises : promises[0];
    }, DEBUG ? 'delete: ' + (entryName as string[]).join(', ') : '', storeName);
  }

  public clear(storeName?: StoreName): Promise<void> {
    return this.getObjectStore('readwrite', (objectStore) => objectStore.clear(), DEBUG ? 'clear' : '', storeName);
  }

  public save(entryName: string | string[], value: any | any[], storeName?: StoreName) {
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

    const isArray = Array.isArray(entryName);
    if(!isArray) {
      entryName = [].concat(entryName);
      value = [].concat(value);
    }

    return this.getObjectStore('readwrite', (objectStore) => {
      const promises = (entryName as string[]).map((entryName, idx) => objectStore.put(value[idx], entryName));
      return isArray ? promises : promises[0];
    }, DEBUG ? 'save: ' + (entryName as string[]).join(', ') : '', storeName);
  }

  // public saveFile(fileName: string, blob: Blob | Uint8Array) {
  //   //return Promise.resolve(blobConstruct([blob]));
  //   if(!(blob instanceof Blob)) {
  //     blob = blobConstruct(blob);
  //   }

  //   return this.save(fileName, blob);
  // }

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

  public get<T>(entryName: string[], storeName?: StoreName): Promise<T[]>;
  public get<T>(entryName: string, storeName?: StoreName): Promise<T>;
  public get<T>(entryName: string | string[], storeName?: StoreName): Promise<T> | Promise<T[]> {
    // return Promise.reject();

    const isArray = Array.isArray(entryName);
    if(!isArray) {
      if(!entryName) {
        return undefined;
      }

      entryName = [].concat(entryName);
    } else if(!entryName.length) {
      return Promise.resolve([]) as any;
    }

    return this.getObjectStore<T>('readonly', (objectStore) => {
      const promises = (entryName as string[]).map((entryName) => objectStore.get(entryName));
      return isArray ? promises : promises[0];
    }, DEBUG ? 'get: ' + (entryName as string[]).join(', ') : '', storeName);
  }

  private getObjectStore<T>(
    mode: IDBTransactionMode,
    callback: (objectStore: IDBObjectStore) => IDBRequest | IDBRequest[],
    log?: string,
    storeName = this.storeName
  ) {
    let perf: number;

    if(log) {
      perf = performance.now();
      this.log(log + ': start');
    }

    return this.idb.openDatabase().then((db) => {
      return new Promise<T>((resolve, reject) => {
        /* if(mode === 'readwrite') {
          return;
        } */

        const transaction = db.transaction([storeName], mode);

        const onError = () => {
          clearTimeout(timeout);
          reject(transaction.error);
        };

        // let resolved = false;
        const onComplete = (/* what: string */) => {
          clearTimeout(timeout);

          if(log) {
            this.log(log + ': end', performance.now() - perf/* , what */);
          }

          // if(resolved) {
          //   return;
          // }

          // resolved = true;
          const results = requests.map((r) => r.result);
          resolve(isArray ? results : results[0]);
        };

        transaction.onerror = onError;

        // * have to wait while clearing or setting something
        const waitForTransactionComplete = mode === 'readwrite';
        if(waitForTransactionComplete) {
          transaction.oncomplete = () => onComplete(/* 'transaction' */);
        }

        const timeout = setTimeout(() => {
          this.log.error('transaction not finished', transaction, log);
        }, 10000);

        /* transaction.addEventListener('abort', (e) => {
          //handleError();
          this.log.error('IndexedDB: transaction abort!', transaction.error);
        }); */

        const callbackResult = callback(transaction.objectStore(storeName));

        const isArray = Array.isArray(callbackResult);
        const requests: IDBRequest[] = isArray ? callbackResult : [].concat(callbackResult) as any;

        if(waitForTransactionComplete) {
          return;
        }

        const length = requests.length;
        let left = length;

        const onRequestFinished = () => {
          if(transaction.error) {
            return;
          }

          if(!--left) {
            onComplete(/* 'requests' */);
          }
        };

        for(let i = 0; i < length; ++i) {
          const request = requests[i];
          request.onerror = onError;
          request.onsuccess = onRequestFinished;
        }
      });
    });
  }

  public getAll<T>(storeName?: StoreName): Promise<T[]> {
    return this.getObjectStore<T[]>('readonly', (objectStore) => objectStore.getAll(), DEBUG ? 'getAll' : '', storeName);
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

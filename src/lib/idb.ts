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

import Database from '../config/database';
import { blobConstruct } from '../helpers/blob';
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

export default class IDBStorage {
  //public static STORAGES: IDBStorage[] = [];
  public openDbPromise: Promise<IDBDatabase>;
  public storageIsAvailable = true;

  private log: ReturnType<typeof logger> = logger('IDB');
  
  public name: string = Database.name;
  public version: number = Database.version;
  public stores: IDBStore[] = Database.stores;

  public storeName: string;

  constructor(options: IDBOptions) {
    safeAssign(this, options);

    this.openDatabase(true);

    //IDBStorage.STORAGES.push(this);
  }

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
        throw new Error();
      }
    } catch(error) {
      this.log.error('error opening db', error.message)
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

        resolve(db);
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

  public delete(entryName: string): Promise<void> {
    //return Promise.resolve();
    return this.openDatabase().then((db) => {
      try {
        //this.log('delete: `' + entryName + '`');
        var objectStore = db.transaction([this.storeName], 'readwrite')
          .objectStore(this.storeName);

        var request = objectStore.delete(entryName);
      } catch(error) {
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('delete: request not finished!', entryName, request);
          resolve();
        }, 3000);

        request.onsuccess = (event) => {
          //this.log('delete: deleted file', event);
          resolve();
          clearTimeout(timeout);
        };
  
        request.onerror = (error) => {
          reject(error);
          clearTimeout(timeout);
        };
      });
    });
  }

  public deleteAll() {
    return this.openDatabase().then((db) => {
      //this.log('deleteAll');

      try {
        const transaction = db.transaction([this.storeName], 'readwrite');

        const objectStore = transaction.objectStore(this.storeName);
        var request = objectStore.clear();
      } catch(error) {
        return Promise.reject(error);
      }

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('deleteAll: request not finished', request);
        }, 3000);

        request.onsuccess = (event) => {
          resolve();
          clearTimeout(timeout);
        };
  
        request.onerror = (error) => {
          reject(error);
          clearTimeout(timeout);
        };
      });
    });
  }

  public save(entryName: string, value: any) {
    return this.openDatabase().then((db) => {
      //this.log('save:', entryName, value);

      const handleError = (error: Error) => {
        this.log.error('save: transaction error:', entryName, value, db, error, error && error.name);
        if((!error || error.name === 'InvalidStateError')/*  && false */) {
          setTimeout(() => {
            this.save(entryName, value);
          }, 2e3);
        } else {
          //console.error('IndexedDB saveFile transaction error:', error, error && error.name);
        }
      };

      try {
        const transaction = db.transaction([this.storeName], 'readwrite');
        transaction.onerror = (e) => {
          handleError(transaction.error);
        };
        /* transaction.oncomplete = (e) => {
          this.log('save: transaction complete:', entryName);
        }; */

        /* transaction.addEventListener('abort', (e) => {
          //handleError();
          this.log.error('IndexedDB: save transaction abort!', transaction.error);
        }); */

        const objectStore = transaction.objectStore(this.storeName);
        var request = objectStore.put(value, entryName);
      } catch(error) {
        handleError(error);
        return Promise.reject(error);
        
        /* this.storageIsAvailable = false;
        throw error; */
      }

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('save: request not finished', entryName, request);
        }, 10000);

        request.onsuccess = (event) => {
          resolve();
          clearTimeout(timeout);
        };
  
        request.onerror = (error) => {
          reject(error);
          clearTimeout(timeout);
        };
      });
    });
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

  public get<T>(entryName: string): Promise<T> {
    //return Promise.reject();
    return this.openDatabase().then((db) => {
      //this.log('get pre:', fileName);

      try {
        const transaction = db.transaction([this.storeName], 'readonly');
        /* transaction.onabort = (e) => {
          this.log.error('get transaction onabort?', e);
        }; */
        const objectStore = transaction.objectStore(this.storeName);
        var request = objectStore.get(entryName);
        
        //this.log.log('IDB get:', fileName, request);
      } catch(err) {
        this.log.error('get error:', err, entryName, request, request.error);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('get request not finished!', entryName, request);
          reject();
        }, 3000);

        request.onsuccess = function(event) {
          const result = request.result;
          if(result === undefined) {
            reject('NO_ENTRY_FOUND');
          } /* else if(typeof result === 'string' &&
            result.substr(0, 5) === 'data:') {
            resolve(dataUrlToBlob(result));
          }  */else {
            resolve(result);
          }

          clearTimeout(timeout);
        }
  
        request.onerror = () => {
          clearTimeout(timeout);
          reject();
        };
      });
    });
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
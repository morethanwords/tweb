import {blobConstruct, bytesToBase64, blobSafeMimeType, dataUrlToBlob} from './bin_utils';
import FileManager from './filemanager';
import { logger } from './logger';

class IdbFileStorage {
  public dbName = 'cachedFiles';
  public dbStoreName = 'files';
  public dbVersion = 2;
  public openDbPromise: Promise<IDBDatabase>;
  public storageIsAvailable = true;
  public name = 'IndexedDB';

  private log: ReturnType<typeof logger> = logger('IDB');

  constructor() {
    this.openDatabase(true);
  }

  public isAvailable() {
    return this.storageIsAvailable;
  }

  public openDatabase(createNew = false): Promise<IDBDatabase> {
    if(this.openDbPromise && !createNew) {
      return this.openDbPromise;
    }

    const createObjectStore = (db: IDBDatabase) => {
      db.createObjectStore(this.dbStoreName);
    };

    try {
      var request = indexedDB.open(this.dbName, this.dbVersion);

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
        if(event.oldVersion == 1) {
          db.deleteObjectStore(this.dbStoreName);
        }
  
        createObjectStore(db);
      };
    });
  }

  public deleteFile(fileName: string): Promise<void> {
    //return Promise.resolve();
    return this.openDatabase().then((db) => {
      try {
        this.log('Delete file: `' + fileName + '`');
        var objectStore = db.transaction([this.dbStoreName], 'readwrite')
          .objectStore(this.dbStoreName);

        var request = objectStore.delete(fileName);
      } catch(error) {
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('deleteFile request not finished!', fileName, request);
          resolve();
        }, 3000);

        request.onsuccess = (event) => {
          this.log('deleted file', event);
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

  public saveFile(fileName: string, blob: Blob | Uint8Array): Promise<Blob> {
    return Promise.resolve(blobConstruct([blob]));
    return this.openDatabase().then((db) => {
      if(!(blob instanceof Blob)) {
        blob = blobConstruct([blob]) as Blob;
      }

      this.log('saveFile:', fileName, blob);

      const handleError = (error: Error) => {
        this.log.error('saveFile transaction error:', fileName, blob, db, error, error && error.name);
        if((!error || error.name === 'InvalidStateError')/*  && false */) {
          setTimeout(() => {
            this.saveFile(fileName, blob);
          }, 2e3);
        } else {
          //console.error('IndexedDB saveFile transaction error:', error, error && error.name);
        }
      };

      try {
        const transaction = db.transaction([this.dbStoreName], 'readwrite');
        transaction.onerror = (e) => {
          handleError(transaction.error);
        };
        transaction.oncomplete = (e) => {
          this.log('saveFile transaction complete:', fileName);
        };

        /* transaction.addEventListener('abort', (e) => {
          //handleError();
          this.log.error('IndexedDB: saveFile transaction abort!', transaction.error);
        }); */

        const objectStore = transaction.objectStore(this.dbStoreName);
        var request = objectStore.put(blob, fileName);
      } catch(error) {
        handleError(error);
        return blob;
        
        /* this.storageIsAvailable = false;
        throw error; */
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('saveFile request not finished', fileName, request);
        }, 3000);

        request.onsuccess = (event) => {
          resolve(blob as Blob);
          clearTimeout(timeout);
        };
  
        request.onerror = (error) => {
          reject(error);
          clearTimeout(timeout);
        };
      });
    });
  }

  public saveFileBase64(db: IDBDatabase, fileName: string, blob: Blob | any): Promise<Blob> {
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
      var objectStore = db.transaction([this.dbStoreName], 'readwrite')
        .objectStore(this.dbStoreName);
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
  }

  public getFile(fileName: string): Promise<Blob> {
    //return Promise.reject();
    return this.openDatabase().then((db) => {
      this.log('getFile pre:', fileName);

      try {
        const transaction = db.transaction([this.dbStoreName], 'readonly');
        transaction.onabort = (e) => {
          this.log.error('getFile transaction onabort?', e);
        };
        const objectStore = transaction.objectStore(this.dbStoreName);
        var request = objectStore.get(fileName);
        
        //this.log.log('IDB getFile:', fileName, request);
      } catch(err) {
        this.log.error('getFile error:', err, fileName, request, request.error);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.log.error('getFile request not finished!', fileName, request);
          reject();
        }, 3000);

        request.onsuccess = function(event) {
          const result = request.result;
          if(result === undefined) {
            reject();
          } else if(typeof result === 'string' &&
            result.substr(0, 5) === 'data:') {
            resolve(dataUrlToBlob(result));
          } else {
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

  public getAllKeys(): Promise<Array<string>> {
    console.time('getAllEntries');
    return this.openDatabase().then((db) => {
      var objectStore = db.transaction([this.dbStoreName], 'readonly')
        .objectStore(this.dbStoreName);
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
  }

  public isFileExists(fileName: string): Promise<boolean> {
    console.time('isFileExists');
    return this.openDatabase().then((db) => {
      var objectStore = db.transaction([this.dbStoreName], 'readonly')
        .objectStore(this.dbStoreName);
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
  }

  public getFileWriter(fileName: string, mimeType: string) {
    var fakeWriter = FileManager.getFakeFileWriter(mimeType, (blob) => {
      return this.saveFile(fileName, blob);
    });

    return Promise.resolve(fakeWriter);
  }
}

const idbFileStorage = new IdbFileStorage(); 
(window as any).IdbFileStorage = idbFileStorage;
export default idbFileStorage;

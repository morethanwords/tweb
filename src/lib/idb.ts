import {blobConstruct, bytesToBase64, blobSafeMimeType, dataUrlToBlob} from './bin_utils';
import FileManager from './filemanager';

class IdbFileStorage {
  public dbName = 'cachedFiles';
  public dbStoreName = 'files';
  public dbVersion = 2;
  public openDbPromise: Promise<IDBDatabase>;
  public storageIsAvailable: boolean;
  public storeBlobsAvailable: boolean;
  public name = 'IndexedDB';

  constructor() {
    // @ts-ignore
    //window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB;
    // @ts-ignore
    window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.OIDBTransaction || window.msIDBTransaction;
    
    this.storageIsAvailable = window.indexedDB !== undefined && window.IDBTransaction !== undefined;

    // IndexedDB is REALLY slow without blob support in Safari 8, no point in it
    if(this.storageIsAvailable &&
      navigator.userAgent.indexOf('Safari') != -1 &&
      navigator.userAgent.indexOf('Chrome') == -1 &&
      navigator.userAgent.match(/Version\/[678]/)
    ) {
      this.storageIsAvailable = false;
    }

    this.storeBlobsAvailable = this.storageIsAvailable || false;
    this.openDatabase();
  }

  public isAvailable() {
    return this.storageIsAvailable;
  }

  public openDatabase(): Promise<IDBDatabase> {
    if(this.openDbPromise) {
      return this.openDbPromise;
    }

    var createObjectStore: any;
    try {
      var request = indexedDB.open(this.dbName, this.dbVersion);

      createObjectStore = (db: any) => {
        db.createObjectStore(this.dbStoreName);
      };

      if(!request) {
        throw new Error();
      }
    } catch(error) {
      console.error('error opening db', error.message)
      this.storageIsAvailable = false;
      return Promise.reject(error);
    }

    var finished = false;
    setTimeout(() => {
      if(!finished) {
        request.onerror({type: 'IDB_CREATE_TIMEOUT'} as Event);
      }
    }, 3000);

    return this.openDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = (event) => {
        finished = true;
        var db = request.result;
  
        db.onerror = (error) => {
          this.storageIsAvailable = false;
          console.error('Error creating/accessing IndexedDB database', error);
          reject(error);
        }
  
        resolve(db);
      };
  
      request.onerror = (event) => {
        finished = true;
        this.storageIsAvailable = false;
        console.error('Error creating/accessing IndexedDB database', event);
        reject(event);
      };
  
      request.onupgradeneeded = (event) => {
        finished = true;
        console.warn('performing idb upgrade from', event.oldVersion, 'to', event.newVersion);
  
        // @ts-ignore
        var db = event.target.result;
        if(event.oldVersion == 1) {
          db.deleteObjectStore(this.dbStoreName);
        }
  
        createObjectStore(db);
      };
    });
  }

  public deleteFile(fileName: string): Promise<void> {
    return this.openDatabase().then((db) => {
      try {
        // @ts-ignore
        var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ_WRITE || 'readwrite')
          .objectStore(this.dbStoreName);

        console.log('Delete file: `' + fileName + '`');
        var request = objectStore.delete(fileName);
      } catch(error) {
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
          console.log('deleted file', event);
          resolve();
        };
  
        request.onerror = function(error) {
          reject(error);
        };
      });
    });
  }

  public saveFile(fileName: string, blob: any): Promise<Blob> {
    return this.openDatabase().then((db) => {
      if(!this.storeBlobsAvailable) {
        return this.saveFileBase64(db, fileName, blob);
      }

      if(!(blob instanceof Blob)) {
        blob = blobConstruct([blob]);
      }

      try {
        // @ts-ignore
        var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ_WRITE || 'readwrite')
          .objectStore(this.dbStoreName);
        var request = objectStore.put(blob, fileName);
      } catch(error) {
        if(this.storeBlobsAvailable) {
          this.storeBlobsAvailable = false;
          return this.saveFileBase64(db, fileName, blob);
        }

        this.storageIsAvailable = false;
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
          resolve(blob);
        };
  
        request.onerror = function(error) {
          reject(error);
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
      // @ts-ignore
      var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ_WRITE || 'readwrite')
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

  public getFile(fileName: string, size?: any): Promise<Blob> {
    return this.openDatabase().then((db) => {
      // @ts-ignore
      var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ || 'readonly')
        .objectStore(this.dbStoreName);
      var request = objectStore.get(fileName);

      return new Promise((resolve, reject) => {
        request.onsuccess = function(event) {
          // @ts-ignore
          var result = event.target.result;
          if(result === undefined) {
            reject();
          } else if(typeof result === 'string' &&
            result.substr(0, 5) === 'data:') {
            resolve(dataUrlToBlob(result));
          } else {
            resolve(result);
          }
        }
  
        request.onerror = reject;
      });
    });
  }

  public getAllKeys(): Promise<Array<string>> {
    console.time('getAllEntries');
    return this.openDatabase().then((db) => {
      // @ts-ignore
      var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ || 'readonly')
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
      // @ts-ignore
      var objectStore = db.transaction([this.dbStoreName], IDBTransaction.READ || 'readonly')
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
    var fakeWriter = FileManager.getFakeFileWriter(mimeType, (blob: any) => {
      this.saveFile(fileName, blob);
    });

    return Promise.resolve(fakeWriter);
  }
}

const idbFileStorage = new IdbFileStorage(); 

(window as any).IdbFileStorage = idbFileStorage;

export default idbFileStorage;

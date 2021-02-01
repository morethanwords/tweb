import { blobConstruct } from '../helpers/blob';
import FileManager from './filemanager';
//import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
//import { logger } from './polyfill';

export default class CacheStorageController {
  //public dbName = 'cachedFiles';
  public openDbPromise: Promise<Cache>;

  //private log: ReturnType<typeof logger> = logger('CS');

  constructor(public dbName: string) {
    this.openDatabase();
  }

  public openDatabase(): Promise<Cache> {
    if(this.openDbPromise) {
      return this.openDbPromise;
    }

    return this.openDbPromise = caches.open(this.dbName);
  }

  public delete(entryName: string) {
    return this.timeoutOperation(async(cache) => {
      const deleted = await cache.delete('/' + entryName);
    });
  }

  public deleteAll() {
    return caches.delete(this.dbName);
  }

  public save(entryName: string, response: Response) {
    return this.timeoutOperation((cache) => {
      return cache.put('/' + entryName, response);
    });
  }

  public saveFile(fileName: string, blob: Blob | Uint8Array) {
    //return Promise.resolve(blobConstruct([blob]));
    if(!(blob instanceof Blob)) {
      blob = blobConstruct(blob) as Blob;
    }

    return this.save(fileName, new Response(blob)).then(() => {
      return blob as Blob;
    });
  }

  /* public getBlobSize(blob: any) {
    return blob.size || blob.byteLength || blob.length;
  } */

  public getFile(fileName: string, method: 'blob' | 'json' | 'text' = 'blob'): Promise<any> {
    /* if(method == 'blob') {
      return Promise.reject();
    } */

    // const str = `get fileName: ${fileName}`;
    // console.time(str);
    return this.timeoutOperation(async(cache) => {
      const response = await cache.match('/' + fileName);

      if(!response || !cache) {
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

  private timeoutOperation<T>(callback: (cache: Cache) => Promise<T>) {
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

  public getFileWriter(fileName: string, mimeType: string) {
    const fakeWriter = FileManager.getFakeFileWriter(mimeType, (blob) => {
      return this.saveFile(fileName, blob);
    });

    return Promise.resolve(fakeWriter);
  }
}

//const cacheStorage = new CacheStorageController(); 
//MOUNT_CLASS_TO && (MOUNT_CLASS_TO.cacheStorage = cacheStorage);
//export default cacheStorage;

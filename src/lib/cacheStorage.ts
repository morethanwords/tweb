import {blobConstruct} from './bin_utils';
import FileManager from './filemanager';
import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
//import { logger } from './polyfill';

class CacheStorageController {
  public dbName = 'cachedFiles';
  public openDbPromise: Promise<Cache>;

  //private log: ReturnType<typeof logger> = logger('CS');

  constructor() {
    this.openDatabase();
  }

  public openDatabase(): Promise<Cache> {
    if(this.openDbPromise) {
      return this.openDbPromise;
    }

    return this.openDbPromise = caches.open(this.dbName);
  }

  public deleteFile(fileName: string) {
    return this.timeoutOperation(async(cache) => {
      const deleted = await cache.delete('/' + fileName);
    });
  }

  public saveFile(fileName: string, blob: Blob | Uint8Array) {
    //return Promise.resolve(blobConstruct([blob]));
    if(!(blob instanceof Blob)) {
      blob = blobConstruct(blob) as Blob;
    }

    return this.timeoutOperation(async(cache) => {
      await cache.put('/' + fileName, new Response(blob));

      return blob as Blob;
    });
  }

  public getBlobSize(blob: any) {
    return blob.size || blob.byteLength || blob.length;
  }

  public getFile(fileName: string) {
    //return Promise.reject();

    // const str = `get fileName: ${fileName}`;
    // console.time(str);
    return this.timeoutOperation(async(cache) => {
      const response = await cache.match('/' + fileName);

      if(!response || !cache) {
        //console.warn('getFile:', response, fileName);
        throw 'No response???';
      }
   
      const promise = response.blob();
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
      }, 5e3);

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

const cacheStorage = new CacheStorageController(); 
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.cacheStorage = cacheStorage);
export default cacheStorage;

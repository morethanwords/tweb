import {blobConstruct} from './bin_utils';
import FileManager from './filemanager';
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

  public async deleteFile(fileName: string): Promise<void> {
    const cache = await this.openDatabase();
    const deleted = await cache.delete('/' + fileName);
  }

  public async saveFile(fileName: string, blob: Blob | Uint8Array): Promise<Blob> {
    //return Promise.resolve(blobConstruct([blob]));
    if(!(blob instanceof Blob)) {
      blob = blobConstruct(blob) as Blob;
    }

    const cache = await this.openDatabase();
    await cache.put('/' + fileName, new Response(blob));

    return blob;
  }

  public getBlobSize(blob: any) {
    return blob.size || blob.byteLength || blob.length;
  }

  public async getFile(fileName: string): Promise<Blob> {
    //return Promise.reject();

    const cache = await this.openDatabase();
    const response = await cache.match('/' + fileName);

    return response.blob();
  }

  public getFileWriter(fileName: string, mimeType: string) {
    const fakeWriter = FileManager.getFakeFileWriter(mimeType, (blob: any) => {
      this.saveFile(fileName, blob);
    });

    return Promise.resolve(fakeWriter);
  }
}

const cacheStorage = new CacheStorageController(); 
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).cacheStorage = cacheStorage;
}
export default cacheStorage;

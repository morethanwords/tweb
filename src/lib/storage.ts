import CacheStorageController from './cacheStorage';
import { MOUNT_CLASS_TO } from './mtproto/mtproto_config';
//import { stringify } from '../helpers/json';

class AppStorage {
  //private log = (...args: any[]) => console.log('[SW LS]', ...args);
  private log = (...args: any[]) => {};

  private cacheStorage = new CacheStorageController('session');

  //public noPrefix = false;
  private cache: {[key: string]: any} = {};
  private useCS = true;

  constructor() {

  }

  public storageGetPrefix() {
    /* if(this.noPrefix) {
      this.noPrefix = false;
      return '';
    } */

    return '';
    //return this.keyPrefix;
  }

  public async get<T>(...keys: string[]): Promise<T> {
    const single = keys.length === 1;
    const result: any[] = [];
    const prefix = this.storageGetPrefix();
    for(let key of keys) {
      key = prefix + key;
  
      if(this.cache.hasOwnProperty(key)) {
        result.push(this.cache[key]);
      } else if(this.useCS) {
        let value: any;
        try {
          value = await this.cacheStorage.getFile(key, 'text');
          value = JSON.parse(value);
        } catch(e) {
          if(e !== 'NO_ENTRY_FOUND') {
            this.useCS = false;
            value = undefined;
            console.error('[AS]: get error:', e, key, value);
          }
        }
  
        // const str = `[get] ${keys.join(', ')}`;
        // console.time(str);
        try {
          value = (value === undefined || value === null) ? false : value;
        } catch(e) {
          value = false;
        }
        //console.timeEnd(str);
        result.push(this.cache[key] = value);
      } else {
        throw 'something went wrong';
      }
    }
  
    return single ? result[0] : result;
  }

  public async set(obj: any) {
    let keyValues: any = {};
    let prefix = this.storageGetPrefix(),
      key, value;

    //console.log('storageSetValue', obj, callback, arguments);

    for(key in obj) {
      if(obj.hasOwnProperty(key)) {
        value = obj[key];
        key = prefix + key;
        this.cache[key] = value;

        value = JSON.stringify(value);
        /* let perf = performance.now();
        let value2 = JSON.stringify(value);
        console.log('LocalStorage set: stringify time by JSON.stringify:', performance.now() - perf, value2);

        perf = performance.now();
        value = stringify(value);
        console.log('LocalStorage set: stringify time by own stringify:', performance.now() - perf); */

        if(this.useCS) {
          try {
            //console.log('setItem', key, value);
            await this.cacheStorage.save(key, new Response(value, {headers: {'Content-Type': 'application/json'}}));
          } catch(e) {
            //this.useCS = false;
            console.error('[AS]: set error:', e, value);
          }
        } else {
          keyValues[key] = value;
        }
      }
    }
  }

  public async remove(...keys: any[]) {
    if(!Array.isArray(keys)) {
      keys = Array.prototype.slice.call(arguments);
    }

    let prefix = this.storageGetPrefix(),
      i, key;

    for(i = 0; i < keys.length; i++) {
      key = keys[i] = prefix + keys[i];
      delete this.cache[key];
      if(this.useCS) {
        try {
          await this.cacheStorage.delete(key);
        } catch(e) {
          this.useCS = false;
          console.error('[AS]: remove error:', e);
        }
      }
    }
  }

  public clear() {
    return this.cacheStorage.deleteAll();
  }
}

const appStorage = new AppStorage();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStorage = appStorage);
export default appStorage;

import CacheStorageController from './cacheStorage';
import { DEBUG, MOUNT_CLASS_TO } from './mtproto/mtproto_config';
//import { stringify } from '../helpers/json';

class AppStorage {
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
    const prefix = this.storageGetPrefix();
    //console.log('storageSetValue', obj, callback, arguments);

    for(let key in obj) {
      if(obj.hasOwnProperty(key)) {
        let value = obj[key];
        key = prefix + key;
        this.cache[key] = value;

        let perf = /* DEBUG */false ? performance.now() : 0;
        value = JSON.stringify(value);

        if(perf) {
          let elapsedTime = performance.now() - perf;
          if(elapsedTime > 10) {
            console.warn('LocalStorage set: stringify time by JSON.stringify:', elapsedTime, key);
          }
        }
        /* perf = performance.now();
        value = stringify(value);
        console.log('LocalStorage set: stringify time by own stringify:', performance.now() - perf); */

        if(this.useCS) {
          try {
            //console.log('setItem: will set', key/* , value */);
            //await this.cacheStorage.delete(key); // * try to prevent memory leak in Chrome leading to 'Unexpected internal error.'
            await this.cacheStorage.save(key, new Response(value, {headers: {'Content-Type': 'application/json'}}));
            //console.log('setItem: have set', key/* , value */);
          } catch(e) {
            //this.useCS = false;
            console.error('[AS]: set error:', e, key/* , value */);
          }
        }
      }
    }
  }

  public async remove(...keys: any[]) {
    if(!Array.isArray(keys)) {
      keys = Array.prototype.slice.call(arguments);
    }

    const prefix = this.storageGetPrefix();
    for(let i = 0; i < keys.length; i++) {
      const key = keys[i] = prefix + keys[i];
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

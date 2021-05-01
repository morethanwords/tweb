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

import { DatabaseStore, DatabaseStoreName } from "../config/database";
import { CancellablePromise, deferredPromise } from "../helpers/cancellablePromise";
import { throttle } from "../helpers/schedulers";
import IDBStorage, { IDBOptions } from "./idb";

export default class AppStorage<Storage extends Record<string, any>/* Storage extends {[name: string]: any} *//* Storage extends Record<string, any> */> {
  private static STORAGES: AppStorage<any>[] = [];
  private storage: IDBStorage;//new CacheStorageController('session');

  //private cache: Partial<{[key: string]: Storage[typeof key]}> = {};
  private cache: Partial<Storage> = {};
  private useStorage = true;

  private getPromises: Map<keyof Storage, CancellablePromise<Storage[keyof Storage]>> = new Map();
  private getThrottled: () => void;

  private keysToSet: Set<keyof Storage> = new Set();
  private saveThrottled: () => void;
  private saveDeferred = deferredPromise<void>();

  constructor(storageOptions: Omit<IDBOptions, 'storeName' | 'stores'> & {stores?: DatabaseStore[], storeName: DatabaseStoreName}) {
    this.storage = new IDBStorage(storageOptions);

    AppStorage.STORAGES.push(this);

    this.saveThrottled = throttle(async() => {
      const deferred = this.saveDeferred;
      this.saveDeferred = deferredPromise<void>();

      if(this.keysToSet.size) {
        const keys = Array.from(this.keysToSet.values()) as string[];
        this.keysToSet.clear();

        try {
          //console.log('setItem: will set', key/* , value */);
          //await this.cacheStorage.delete(key); // * try to prevent memory leak in Chrome leading to 'Unexpected internal error.'
          //await this.storage.save(key, new Response(value, {headers: {'Content-Type': 'application/json'}}));
          await this.storage.save(keys, keys.map(key => this.cache[key]));
          //console.log('setItem: have set', key/* , value */);
        } catch(e) {
          //this.useCS = false;
          console.error('[AS]: set error:', e, keys/* , value */);
        }
      }

      deferred.resolve();
    }, 16, false);

    this.getThrottled = throttle(async() => {
      const keys = Array.from(this.getPromises.keys());

      this.storage.get(keys as string[]).then(values => {
        for(let i = 0, length = keys.length; i < length; ++i) {
          const key = keys[i];
          const deferred = this.getPromises.get(key);
          if(deferred) {
            // @ts-ignore
            deferred.resolve(this.cache[key] = values[i]);
            this.getPromises.delete(key);
          }
        }
      }, (error) => {
        if(!['NO_ENTRY_FOUND', 'STORAGE_OFFLINE'].includes(error)) {
          this.useStorage = false;
          console.error('[AS]: get error:', error, keys);
        }

        for(let i = 0, length = keys.length; i < length; ++i) {
          const key = keys[i];
          const deferred = this.getPromises.get(key);
          if(deferred) {
            deferred.reject(error);
            this.getPromises.delete(key);
          }
        }
      });
    }, 16, false);
  }

  public getCache() {
    return this.cache;
  }

  public getFromCache(key: keyof Storage) {
    return this.cache[key];
  }

  public setToCache(key: keyof Storage, value: Storage[typeof key]) {
    return this.cache[key] = value;
  }

  public async get(key: keyof Storage): Promise<Storage[typeof key]> {
    if(this.cache.hasOwnProperty(key)) {
      return this.getFromCache(key);
    } else if(this.useStorage) {
      const r = this.getPromises.get(key);
      if(r) return r;

      const p = deferredPromise<Storage[typeof key]>();
      this.getPromises.set(key, p);

      this.getThrottled();

      return p;
    }/*  else {
      throw 'something went wrong';
    } */
  }

  public getAll() {
    return this.storage.getAll();
  }

  public set(obj: Partial<Storage>, onlyLocal = false) {
    //console.log('storageSetValue', obj, callback, arguments);

    for(const key in obj) {
      if(obj.hasOwnProperty(key)) {
        const value = obj[key];
        this.setToCache(key, value);

        // let perf = /* DEBUG */false ? performance.now() : 0;
        // value = JSON.stringify(value);

        // if(perf) {
        //   let elapsedTime = performance.now() - perf;
        //   if(elapsedTime > 10) {
        //     console.warn('LocalStorage set: stringify time by JSON.stringify:', elapsedTime, key);
        //   }
        // }
        
        /* perf = performance.now();
        value = stringify(value);
        console.log('LocalStorage set: stringify time by own stringify:', performance.now() - perf); */

        if(this.useStorage && !onlyLocal) {
          this.keysToSet.add(key);
          this.saveThrottled();
        }
      }
    }

    return this.saveDeferred;
  }

  public async delete(key: keyof Storage, saveLocal = false) {
    /* if(!this.cache.hasOwnProperty(key)) {
      return;
    } */

    // ! it is needed here
    key = '' + key;

    if(!saveLocal) {
      delete this.cache[key];
    }
    
    if(this.useStorage) {
      this.keysToSet.delete(key);
      
      try {
        await this.storage.delete(key as string);
      } catch(e) {
        this.useStorage = false;
        console.error('[AS]: remove error:', e);
      }
    }
  }

  public clear() {
    return this.storage.deleteAll();
  }

  public static toggleStorage(enabled: boolean) {
    return Promise.all(this.STORAGES.map(storage => {
      storage.useStorage = enabled;
      
      if(!enabled) {
        storage.keysToSet.clear();
        storage.getPromises.forEach((deferred) => deferred.resolve());
        storage.getPromises.clear();
        return storage.clear();
      } else {
        return storage.set(storage.cache);
      }
    }));
  }

  public deleteDatabase() {
    return IDBStorage.deleteDatabase();
  }
}

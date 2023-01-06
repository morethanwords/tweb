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

import Modes from '../config/modes';
import {IS_WORKER} from '../helpers/context';
import {WorkerTaskTemplate} from '../types';
import MTProtoMessagePort from './mtproto/mtprotoMessagePort';
// import { stringify } from '../helpers/json';

class LocalStorage<Storage extends Record<string, any>> {
  private prefix = '';
  private cache: Partial<Storage> = {};
  private useStorage = true;

  constructor(/* private preserveKeys: (keyof Storage)[] */) {
    if(Modes.test) {
      this.prefix = 't_';
    }
  }

  public get<T extends keyof Storage>(key: T, useCache = true): Storage[T] {
    if(this.cache.hasOwnProperty(key) && useCache) {
      return this.cache[key];
    } else if(this.useStorage) {
      let value: Storage[T];
      try {
        value = localStorage.getItem(this.prefix + (key as string)) as any;
      } catch(err) {
        this.useStorage = false;
      }

      if(value !== null) {
        try {
          value = JSON.parse(value);
        } catch(err) {
          // console.error(err);
        }
      } else {
        value = undefined;
      }

      return value;
    }/*  else {
      throw 'something went wrong';
    } */
  }

  public set(obj: Partial<Storage>, onlyLocal = false) {
    for(const key in obj) {
      if(obj.hasOwnProperty(key)) {
        const value = obj[key];
        this.cache[key] = value;

        if(this.useStorage && !onlyLocal) {
          try {
            const stringified = JSON.stringify(value);
            localStorage.setItem(this.prefix + key, stringified);
          } catch(err) {
            this.useStorage = false;
          }
        }
      }
    }
  }

  public delete(key: keyof Storage, saveLocal = false) {
    // ! it is needed here
    key = '' + (key as string);

    if(!saveLocal) {
      delete this.cache[key];
    }

    // if(this.useStorage) {
    try {
      localStorage.removeItem(this.prefix + (key as string));
    } catch(err) {

    }
    // }
  }

  /* public clear(preserveKeys: (keyof Storage)[] = this.preserveKeys) {
    // if(this.useStorage) {
      try {
        let obj: Partial<Storage> = {};
        if(preserveKeys) {
          preserveKeys.forEach((key) => {
            const value = this.get(key);
            if(value !== undefined) {
              obj[key] = value;
            }
          });
        }

        localStorage.clear();

        if(preserveKeys) {
          this.set(obj);
        }
      } catch(err) {

      }
    // }
  } */

  public clear() {
    const keys: string[] = ['dc', 'server_time_offset', 'xt_instance', 'user_auth', 'state_id', 'k_build'];
    for(let i = 1; i <= 5; ++i) {
      keys.push(`dc${i}_server_salt`);
      keys.push(`dc${i}_auth_key`);
    }

    for(const key of keys) {
      this.delete(key, true);
    }
  }

  public toggleStorage(enabled: boolean, clearWrite: boolean) {
    this.useStorage = enabled;

    if(!clearWrite) {
      return;
    }

    if(!enabled) {
      this.clear();
    } else {
      return this.set(this.cache);
    }
  }
}

export interface LocalStorageProxyTask extends WorkerTaskTemplate {
  type: 'localStorageProxy',
  payload: {
    type: 'set' | 'get' | 'delete' | 'clear' | 'toggleStorage',
    args: any[]
  }
};

export interface LocalStorageProxyTaskResponse extends WorkerTaskTemplate {
  type: 'localStorageProxy',
  payload: any
};

export default class LocalStorageController<Storage extends Record<string, any>> {
  private static STORAGES: LocalStorageController<any>[] = [];
  // private log = (...args: any[]) => console.log('[SW LS]', ...args);
  // private log = (...args: any[]) => {};

  private storage: LocalStorage<Storage>;

  constructor(/* private preserveKeys: (keyof Storage)[] = [] */) {
    LocalStorageController.STORAGES.push(this);

    if(!IS_WORKER) {
      this.storage = new LocalStorage(/* preserveKeys */);
    }
  }

  private async proxy<T>(type: LocalStorageProxyTask['payload']['type'], ...args: LocalStorageProxyTask['payload']['args']): Promise<T> {
    if(IS_WORKER) {
      const port = MTProtoMessagePort.getInstance<false>();
      return port.invoke('localStorageProxy', {type, args});
    }

    args = Array.prototype.slice.call(args);

    // @ts-ignore
    return this.storage[type].apply(this.storage, args as any);
  }

  public get<T extends keyof Storage>(key: T, useCache?: boolean) {
    return this.proxy<Storage[T]>('get', key, useCache);
  }

  public set(obj: Partial<Storage>, onlyLocal?: boolean) {
    return this.proxy<void>('set', obj, onlyLocal);
  }

  public delete(key: keyof Storage, saveLocal?: boolean) {
    return this.proxy<void>('delete', key, saveLocal);
  }

  public clear(/* preserveKeys?: (keyof Storage)[] */) {
    return this.proxy<void>('clear'/* , preserveKeys */);
  }

  public toggleStorage(enabled: boolean, clearWrite: boolean) {
    return this.proxy<void>('toggleStorage', enabled, clearWrite);
  }
}

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
import { notifySomeone, IS_WORKER } from '../helpers/context';
import { WorkerTaskTemplate } from '../types';
//import { stringify } from '../helpers/json';

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
        value = localStorage.getItem(this.prefix + key as string) as any;
      } catch(err) {
        this.useStorage = false;
      }

      if(value !== null) {
        try {
          value = JSON.parse(value);
        } catch(err) {
          //console.error(err);
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
    key = '' + key;

    if(!saveLocal) {
      delete this.cache[key];
    }
    
    //if(this.useStorage) {
      try {
        localStorage.removeItem(this.prefix + key);
      } catch(err) {
        
      }
    //}
  }

  /* public clear(preserveKeys: (keyof Storage)[] = this.preserveKeys) {
    // if(this.useStorage) {
      try {
        let obj: Partial<Storage> = {};
        if(preserveKeys) {
          preserveKeys.forEach(key => {
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
    const keys: string[] = ['dc', 'server_time_offset', 'xt_instance', 'user_auth', 'state_id'];
    for(let i = 1; i <= 5; ++i) {
      keys.push(`dc${i}_server_salt`);
      keys.push(`dc${i}_auth_key`);
    }

    for(let key of keys) {
      this.delete(key, true);
    }
  }

  public toggleStorage(enabled: boolean) {
    this.useStorage = enabled;

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
  private taskId = 0;
  private tasks: {[taskID: number]: (result: any) => void} = {};
  //private log = (...args: any[]) => console.log('[SW LS]', ...args);
  //private log = (...args: any[]) => {};

  private storage: LocalStorage<Storage>;

  constructor(/* private preserveKeys: (keyof Storage)[] = [] */) {
    LocalStorageController.STORAGES.push(this);

    if(!IS_WORKER) {
      this.storage = new LocalStorage(/* preserveKeys */);
    }
  }

  public finishTask(taskId: number, result: any) {
    //this.log('finishTask:', taskID, result, Object.keys(this.tasks));

    if(!this.tasks.hasOwnProperty(taskId)) {
      //this.log('no such task:', taskID, result);
      return;
    }

    this.tasks[taskId](result);
    delete this.tasks[taskId];
  }

  private proxy<T>(type: LocalStorageProxyTask['payload']['type'], ...args: LocalStorageProxyTask['payload']['args']) {
    return new Promise<T>((resolve, reject) => {
      if(IS_WORKER) {
        const taskId = this.taskId++;

        this.tasks[taskId] = resolve;
        const task: LocalStorageProxyTask = {
          type: 'localStorageProxy', 
          id: taskId,
          payload: {
            type,
            args
          }
        };

        notifySomeone(task);
      } else {
        args = Array.prototype.slice.call(args);

        // @ts-ignore
        const result: any = this.storage[type].apply(this.storage, args as any);
        resolve(result);
      }
    });
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

  public toggleStorage(enabled: boolean) {
    return this.proxy<void>('toggleStorage', enabled);
  }
}

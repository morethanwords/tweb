import { Modes } from './mtproto/mtproto_config';
import { notifySomeone, isWorker } from '../helpers/context';
//import { stringify } from '../helpers/json';

class ConfigStorage {
  public keyPrefix = '';
  public noPrefix = false;
  private cache: {[key: string]: any} = {};
  private useLs = true;

  storageGetPrefix() {
    if(this.noPrefix) {
      this.noPrefix = false;
      return '';
    }

    return this.keyPrefix;
  }

  get(keys: string | string[], callback: any) {
    var single = false;
    if(!Array.isArray(keys)) {
      keys = Array.prototype.slice.call(arguments);
      callback = keys.pop();
      single = keys.length == 1;
    }
    var result = [];
    var allFound = true;
    var prefix = this.storageGetPrefix();

    for(let key of keys) {
      key = prefix + key;

      if(this.cache.hasOwnProperty(key)) {
        result.push(this.cache[key]);
      } else if(this.useLs) {
        let value: any;
        try {
          value = localStorage.getItem(key);
        } catch(e) {
          this.useLs = false;
        }

        // const str = `[get] ${keys.join(', ')}`;
        // console.time(str);
        try {
          value = (value === undefined || value === null) ? false : JSON.parse(value);
        } catch(e) {
          value = false;
        }
        //console.timeEnd(str);
        result.push(this.cache[key] = value);
      } else {
        allFound = false;
      }
    }

    if(allFound) {
      return callback(single ? result[0] : result);
    }
  }

  set(obj: any, callback: any) {
    var keyValues: any = {};
    var prefix = this.storageGetPrefix(),
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

        if(this.useLs) {
          try {
            //console.log('setItem', key, value);
            localStorage.setItem(key, value);
          } catch (e) {
            this.useLs = false;
          }
        } else {
          keyValues[key] = value;
        }
      }
    }

    if(this.useLs) {
      if(callback) {
        callback();
      }

      return;
    }
  }

  remove(keys: any, callback: any) {
    if(!Array.isArray(keys)) {
      keys = Array.prototype.slice.call(arguments)
      if(typeof keys[keys.length - 1] === 'function') {
        callback = keys.pop();
      }
    }

    var prefix = this.storageGetPrefix(),
      i, key;

    for(i = 0; i < keys.length; i++) {
      key = keys[i] = prefix + keys[i];
      delete this.cache[key];
      if(this.useLs) {
        try {
          localStorage.removeItem(key);
        } catch(e) {
          this.useLs = false;
        }
      }
    }

    if(callback) {
      callback();
    }
  }

  clear() {
    localStorage.clear();
    location.reload();
  }
}

class AppStorage {
  private taskID = 0;
  private tasks: {[taskID: number]: (result: any) => void} = {};
  //private log = (...args: any[]) => console.log('[SW LS]', ...args);
  private log = (...args: any[]) => {};

  private configStorage: ConfigStorage;

  constructor() {
    if(Modes.test) {
      this.setPrefix('t_');
    }

    if(!isWorker) {
      this.configStorage = new ConfigStorage();
    }
  }

  public setPrefix(newPrefix: string) {
    if(this.configStorage) {
      this.configStorage.keyPrefix = newPrefix;
    }
  }

  public noPrefix() {
    if(this.configStorage) {
      this.configStorage.noPrefix = true;
    }
  }

  public finishTask(taskID: number, result: any) {
    this.log('finishTask:', taskID, result, Object.keys(this.tasks));

    if(!this.tasks.hasOwnProperty(taskID)) {
      this.log('no such task:', taskID, result);
      return;
    }

    this.tasks[taskID](result);
    delete this.tasks[taskID];
  }

  private proxy<T>(methodName: 'set' | 'get' | 'remove' | 'clear', ..._args: any[]) {
    return new Promise<T>((resolve, reject) => {
      if(isWorker) {
        const taskID = this.taskID++;

        this.tasks[taskID] = resolve;
        const task = {useLs: true, task: methodName, taskID, args: _args};

        notifySomeone(task);
      } else {
        let args = Array.prototype.slice.call(_args);
        args.push((result: T) => {
          resolve(result);
        });

        this.configStorage[methodName].apply(this.configStorage, args as any);
      }
    });
  }

  public get<T>(...args: any[]) {
    return this.proxy<T>('get', ...args);
  }

  public set<T>(...args: any[]) {
    //console.trace(...args);
    return this.proxy<T>('set', ...args);
  }

  public remove<T>(...args: any[]) {
    return this.proxy<T>('remove', ...args);
  }

  public clear() {
    return this.proxy('clear');
  }
}

export default new AppStorage();

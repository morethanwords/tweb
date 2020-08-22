import { Modes } from './mtproto/mtproto_config';

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

  get(keys: any, callback: any) {
    var single = false;
    if(!Array.isArray(keys)) {
      keys = Array.prototype.slice.call(arguments);
      callback = keys.pop();
      single = keys.length == 1;
    }
    var result = [],
      value;
    var allFound = true;
    var prefix = this.storageGetPrefix(),
      i, key;

    for(i = 0; i < keys.length; i++) {
      key = keys[i] = prefix + keys[i];
      if(key.substr(0, 3) != 'xt_' && this.cache[key] !== undefined) {
        result.push(this.cache[key]);
      } else if(this.useLs) {
        try {
          value = localStorage.getItem(key);
        } catch(e) {
          this.useLs = false;
        }

        try {
          value = (value === undefined || value === null) ? false : JSON.parse(value);
        } catch(e) {
          value = false;
        }
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
        value = JSON.stringify(value, (key, value) => {
          if(key == 'downloaded' || (key == 'url' && value.indexOf('blob:') === 0)) return undefined;
          return value;
        });

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

  clear(callback: any) {
    if(this.useLs) {
      try {
        localStorage.clear();
      } catch (e) {
        this.useLs = false;
      }
    }

    this.cache = {};
    callback();
  }
}

class AppStorage {
  private isWorker: boolean;
  private taskID = 0;
  private tasks: {[taskID: number]: (result: any) => void} = {};
  //private log = (...args: any[]) => console.log('[SW LS]', ...args);
  private log = (...args: any[]) => {};

  private configStorage: ConfigStorage;

  constructor() {
    if(Modes.test) {
      this.setPrefix('t_');
    }

    // @ts-ignore
    //this.isWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
    this.isWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;

    if(!this.isWorker) {
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
      if(this.isWorker) {
        const taskID = this.taskID++;

        this.tasks[taskID] = resolve;

        (self as any as ServiceWorkerGlobalScope)
        .clients
        .matchAll({ includeUncontrolled: false, type: 'window' })
        .then((listeners) => {
          if(!listeners.length) {
            //console.trace('no listeners?', self, listeners);
            return;
          }

          this.log('will proxy', {useLs: true, task: methodName, taskID, args: _args});
          listeners[0].postMessage({useLs: true, task: methodName, taskID, args: _args});
        });

        // @ts-ignore
        //self.postMessage({useLs: true, task: methodName, taskID: this.taskID, args: _args});
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

  public clear<T>(...args: any[]) {
    return this.proxy<T>('clear', ...args);
  }
}

export default new AppStorage();

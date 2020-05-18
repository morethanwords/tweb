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

const configStorage = new ConfigStorage();

/* private cache: {[key: string]: any} = {};
private request: Promise<Cache>;
private cacheURL: string;
constructor(cacheName: string) {
  this.request = new Promise((resolve, reject) => {
    let promise = caches.open(cacheName);
    promise.then(cache => {
      cache.keys().then(requests => {
        if(!requests.length) {
          return cache.put(this.cacheURL = '/session/' + Date.now(), new Response('{}'));
        } else {
          this.cacheURL = requests[0].url;
          return cache.match(requests[0]).then(response => response.json()).then(j => this.cache = j);
        }
      }).then(() => {
        resolve(promise);
      });
    })
  });
} */

class AppStorage {
  private isWebWorker: boolean;
  private taskID = 0;
  private tasks: {[taskID: number]: (result: any) => void} = {};

  constructor() {
    if(Modes.test) {
      this.setPrefix('t_');
    }

    // @ts-ignore
    this.isWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
  }

  public setPrefix(newPrefix: string) {
    configStorage.keyPrefix = newPrefix;
  }

  public noPrefix() {
    configStorage.noPrefix = true;
  }

  public finishTask(taskID: number, result: any) {
    this.tasks[taskID](result);
    delete this.tasks[taskID];
  }

  private proxy<T>(methodName: string, ..._args: any[]) {
    return new Promise<T>((resolve, reject) => {
      if(this.isWebWorker) {
        this.tasks[this.taskID] = resolve;
        // @ts-ignore
        self.postMessage({useLs: true, task: methodName, taskID: this.taskID, args: _args});
        this.taskID++;
      } else {
        let args = Array.prototype.slice.call(_args);
        args.push((result: T) => {
          resolve(result);
        });

        // @ts-ignore
        configStorage[methodName].apply(configStorage, args);
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

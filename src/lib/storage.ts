import {Storage as ConfigStorage, Modes} from './config';

class AppStorage {
  public setPrefix(newPrefix: string) {
    ConfigStorage.prefix(newPrefix);
  }

  public noPrefix() {
    ConfigStorage.noPrefix();
  }

  private proxy<T>(methodName: string, ..._args: any[]) {
    let args = Array.prototype.slice.call(_args);

    let promise = new Promise<T>((resolve, reject) => {
      args.push((result: T) => {
        resolve(result);
      });

      ConfigStorage[methodName].apply(ConfigStorage, args);
    });
    
    return promise;
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

  constructor() {
    if(Modes.test) {
      this.setPrefix('t_');
    }
  }
}

export default new AppStorage();

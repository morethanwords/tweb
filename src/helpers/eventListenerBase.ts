import type { ArgumentTypes, SuperReturnType } from "../types";

/**
 * Better not to remove listeners during setting
 * Should add listener callback only once
 */
export default class EventListenerBase<Listeners extends {[name: string]: Function}> {
  protected listeners: Partial<{
    [k in keyof Listeners]: Array<{callback: Listeners[k], once?: boolean}>
  }>;
  protected listenerResults: Partial<{
    [k in keyof Listeners]: ArgumentTypes<Listeners[k]>
  }>;

  private reuseResults: boolean;

  constructor(reuseResults?: boolean) {
    this._constructor(reuseResults);
  }

  public _constructor(reuseResults = false): any {
    this.reuseResults = reuseResults;
    this.listeners = {};
    this.listenerResults = {};
  }

  public addListener(name: keyof Listeners, callback: Listeners[typeof name], once?: boolean) {
    if(this.listenerResults.hasOwnProperty(name)) {
      callback(...this.listenerResults[name]);
      
      if(once) {
        return;
      }
    }
    
    (this.listeners[name] ?? (this.listeners[name] = [])).push({callback, once});
  }

  public removeListener(name: keyof Listeners, callback: Listeners[typeof name]) {
    if(this.listeners[name]) {
      this.listeners[name].findAndSplice(l => l.callback === callback);
    }
  }

  // * must be protected, but who cares
  public setListenerResult(name: keyof Listeners, ...args: ArgumentTypes<Listeners[typeof name]>) {
    if(this.reuseResults) {
      this.listenerResults[name] = args;
    }

    const arr: Array<SuperReturnType<Listeners[typeof name]>> = [];
    const listeners = this.listeners[name];
    if(listeners) {
      // ! this one will guarantee execution even if delete another listener during setting
      const left = listeners.slice();
      left.forEach(listener => {
        const index = listeners.findIndex(l => l.callback === listener.callback);
        if(index === -1) {
          return;
        }

        arr.push(listener.callback(...args));

        if(listener.once) {
          this.removeListener(name, listener.callback);
        }
      });

      /* for(let i = 0, length = listeners.length; i < length; ++i) {
        const listener = listeners[i];
        arr.push(listener.callback(...args));

        if(listener.once) {
          listeners.splice(i, 1);
          --i;
          --length;
        }
      } */
    }

    return arr;
  }

  public cleanup() {
    this.listeners = {}; 
    this.listenerResults = {};
  }
}

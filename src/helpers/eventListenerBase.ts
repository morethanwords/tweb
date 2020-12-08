import type { ArgumentTypes } from "../types";

export default class EventListenerBase<Listeners extends {[name: string]: Function}> {
  protected listeners: Partial<{
    [k in keyof Listeners]: Array<{callback: Listeners[k], once?: true}>
  }> = {};
  protected listenerResults: Partial<{
    [k in keyof Listeners]: ArgumentTypes<Listeners[k]>
  }> = {};

  constructor(private reuseResults?: true) {

  }

  public addListener(name: keyof Listeners, callback: Listeners[typeof name], once?: true) {
    (this.listeners[name] ?? (this.listeners[name] = [])).push({callback, once});

    if(this.listenerResults.hasOwnProperty(name)) {
      callback(...this.listenerResults[name]);

      if(once) {
        this.removeListener(name, callback);
      }
    }
  }

  public removeListener(name: keyof Listeners, callback: Listeners[typeof name]) {
    if(this.listeners[name]) {
      this.listeners[name].findAndSplice(l => l.callback == callback);
    }
  }

  // * must be protected, but who cares
  public setListenerResult(name: keyof Listeners, ...args: ArgumentTypes<Listeners[typeof name]>) {
    if(this.reuseResults) {
      this.listenerResults[name] = args;
    }

    if(this.listeners[name]) {
      this.listeners[name].forEach(listener => {
        listener.callback(...args);

        if(listener.once) {
          this.removeListener(name, listener.callback);
        }
      });
    }
  }
}
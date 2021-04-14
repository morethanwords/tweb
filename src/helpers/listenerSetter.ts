/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { RootScope } from "../lib/rootScope";
import { ArgumentTypes } from "../types";

/* export type Listener<T extends ListenerElement> = {
  element: ListenerElement, 
  event: ListenerEvent<T>, 
  callback: ListenerCallback<T>, 
  options?: ListenerOptions
};

export type ListenerElement = HTMLElement | RootScope;
export type ListenerEvent<T extends ListenerElement> = ArgumentTypes<T['addEventListener']>[0];
export type ListenerCallback<T extends ListenerElement> = ArgumentTypes<T['addEventListener']>[1];
export type ListenerOptions = any; */
export type Listener<T extends ListenerElement> = {
  element: ListenerElement, 
  event: ListenerEvent<T>, 
  callback: ListenerCallback, 
  options?: ListenerOptions
};

export type ListenerElement = Window | Document | HTMLElement | Element | RootScope | any;
//export type ListenerEvent<T extends ListenerElement> = ArgumentTypes<T['addEventListener']>[0];
export type ListenerEvent<T extends ListenerElement> = string;
export type ListenerCallback = (...args: any[]) => any;
export type ListenerOptions = any;

export default class ListenerSetter {
  private listeners: Set<Listener<any>> = new Set();

  public add<T extends ListenerElement>(element: T, event: ListenerEvent<T>, callback: ListenerCallback, options?: ListenerOptions) {
    const listener: Listener<T> = {element, event, callback, options};
    this.addManual(listener);
    return listener;
  }

  public addManual<T extends ListenerElement>(listener: Listener<T>) {
    // @ts-ignore
    listener.element.addEventListener(listener.event, listener.callback, listener.options);
    this.listeners.add(listener);
  }

  public remove<T extends ListenerElement>(listener: Listener<T>) {
    // @ts-ignore
    listener.element.removeEventListener(listener.event, listener.callback, listener.options);
    this.listeners.delete(listener);
  }

  public removeManual<T extends ListenerElement>(element: T, event: ListenerEvent<T>, callback: ListenerCallback, options?: ListenerOptions) {
    let listener: Listener<T>;
    for(const _listener of this.listeners) {
      if(_listener.element === element && _listener.event === event && _listener.callback === callback && _listener.options === options) {
        listener = _listener;
        break;
      }
    }

    if(listener) {
      this.remove(listener);
    }
  }

  public removeAll() {
    this.listeners.forEach(listener => {
      this.remove(listener);
    });
  }
}

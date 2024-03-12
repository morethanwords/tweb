/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type EventListenerBase from './eventListenerBase';

export type Listener = {
  element: ListenerElement,
  event: ListenerEvent,
  callback: ListenerCallback,
  options?: ListenerOptions,

  onceFired?: true, // will be set only when options.once is set
  onceCallback?: () => void,
};

export type ListenerElement = Window | Document | HTMLElement | Element | EventListenerBase<any> | EventTarget;
export type ListenerEvent = string;
export type ListenerCallback = Function;
export type ListenerOptions = AddEventListenerOptions;

/* const originalAddEventListener = HTMLElement.prototype.addEventListener;
HTMLElement.prototype.addEventListener = function(this, name: string, callback: EventListenerOrEventListenerObject, options: AddEventListenerOptions) {
  console.log('nu zdarova', name);
  originalAddEventListener.call(this, name, callback, options);

  if(options?.ls) {
    return options.ls.addFromElement(this, name, callback as any, options);
  }
}; */

export default class ListenerSetter {
  private listeners: Set<Listener> = new Set();

  public add<T extends ListenerElement>(element: T): T['addEventListener'] {
    return ((event: string, callback: Function, options: ListenerOptions) => {
      const listener: Listener = {element, event, callback, options};
      this.addManual(listener);
      return listener;
    }) as any;
  }

  /* public addFromElement<T extends ListenerElement>(element: T, event: ListenerEvent, callback: ListenerCallback, options: ListenerOptions) {
    const listener: Listener = {element, event, callback, options};
    this.addManual(listener);
    return listener;
  } */

  public addManual(listener: Listener) {
    // @ts-ignore
    listener.element.addEventListener(listener.event, listener.callback, listener.options);

    if(listener.options?.once) { // remove listener when its called
      listener.onceCallback = () => {
        this.remove(listener);
        listener.onceFired = true;
      };

      // @ts-ignore
      listener.element.addEventListener(listener.event, listener.onceCallback, listener.options);
    }

    this.listeners.add(listener);
  }

  public remove(listener: Listener) {
    if(!listener.onceFired) {
      // @ts-ignore
      listener.element.removeEventListener(listener.event, listener.callback, listener.options);

      if(listener.onceCallback) {
        // @ts-ignore
        listener.element.removeEventListener(listener.event, listener.onceCallback, listener.options);
      }
    }

    this.listeners.delete(listener);
  }

  public removeManual<T extends ListenerElement>(
    element: T,
    event: ListenerEvent,
    callback: ListenerCallback,
    options?: ListenerOptions
  ) {
    let listener: Listener;
    for(const _listener of this.listeners) {
      if(_listener.element === element &&
        _listener.event === event &&
        _listener.callback === callback &&
        _listener.options === options) {
        listener = _listener;
        break;
      }
    }

    if(listener) {
      this.remove(listener);
    }
  }

  public removeAll() {
    this.listeners.forEach((listener) => {
      this.remove(listener);
    });
  }
}

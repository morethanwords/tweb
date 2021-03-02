export type Listener = {element: ListenerElement, event: ListenerEvent, callback: ListenerCallback, options?: ListenerOptions};
export type ListenerElement = any;
export type ListenerEvent = string;
export type ListenerOptions = any;
export type ListenerCallback = (...args: any[]) => any;
export default class ListenerSetter {
  private listeners: Set<Listener> = new Set();

  public add(element: ListenerElement, event: ListenerEvent, callback: ListenerCallback, options?: ListenerOptions) {
    const listener = {element, event, callback, options};
    this.addManual(listener);
    return listener;
  }

  public addManual(listener: Listener) {
    listener.element.addEventListener(listener.event, listener.callback, listener.options);
    this.listeners.add(listener);
  }

  public remove(listener: Listener) {
    listener.element.removeEventListener(listener.event, listener.callback, listener.options);
    this.listeners.delete(listener);
  }

  public removeManual(element: ListenerElement, event: ListenerEvent, callback: ListenerCallback, options?: ListenerOptions) {
    let listener: Listener;
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

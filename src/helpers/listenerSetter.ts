import type EventListenerBase from '@helpers/eventListenerBase';

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

// * by its shape: a node of another window (Document Picture-in-Picture) is no instance of this one's Node
const isNode = (element: ListenerElement): element is Node => typeof((element as Node).nodeType) === 'number';

// * the dead refs a setter may keep before it drops them
const NODES_SWEEP_MIN = 64;

export default class ListenerSetter {
  // * listeners on what is not a DOM node - emitters, windows: kept until removed
  private listeners: Set<Listener> = new Set();
  // * a DOM node's only for as long as the node lives: one that left the DOM with its listeners still
  // * here - an item of a list or a menu that outlives it - kept itself and all they hold
  private nodeListeners: WeakMap<Node, {ref: WeakRef<Node>, listeners: Set<Listener>}> = new WeakMap();
  private nodes: Set<WeakRef<Node>> = new Set();
  private nodesSweepAt = NODES_SWEEP_MIN;
  private cleanups: Set<() => void> = new Set();

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

    const {element} = listener;
    if(!isNode(element)) {
      this.listeners.add(listener);
      return;
    }

    let entry = this.nodeListeners.get(element);
    if(!entry) {
      this.nodeListeners.set(element, entry = {ref: new WeakRef(element), listeners: new Set()});
      this.nodes.add(entry.ref);
      if(this.nodes.size >= this.nodesSweepAt) {
        this.sweepNodes();
      }
    }

    entry.listeners.add(listener);
  }

  private sweepNodes() {
    for(const ref of this.nodes) {
      if(!ref.deref()) {
        this.nodes.delete(ref);
      }
    }

    this.nodesSweepAt = Math.max(NODES_SWEEP_MIN, this.nodes.size * 2);
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

    const {element} = listener;
    if(!isNode(element)) {
      this.listeners.delete(listener);
      return;
    }

    // * a node left with no listener goes from both: one listened on again gets a new entry, and its old
    // * reference kept here would look alive to every sweep
    const entry = this.nodeListeners.get(element);
    if(entry?.listeners.delete(listener) && !entry.listeners.size) {
      this.nodeListeners.delete(element);
      this.nodes.delete(entry.ref);
    }
  }

  public removeManual<T extends ListenerElement>(
    element: T,
    event: ListenerEvent,
    callback: ListenerCallback,
    options?: ListenerOptions
  ) {
    const listeners = isNode(element) ? this.nodeListeners.get(element)?.listeners : this.listeners;
    if(!listeners) {
      return;
    }

    for(const listener of listeners) {
      if(listener.element === element &&
        listener.event === event &&
        listener.callback === callback &&
        listener.options === options) {
        this.remove(listener);
        break;
      }
    }
  }

  public addCleanup(cleanup: () => void) {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }

  public removeAll() {
    this.listeners.forEach((listener) => {
      this.remove(listener);
    });
    for(const ref of this.nodes) {
      const node = ref.deref();
      const entry = node && this.nodeListeners.get(node);
      entry?.listeners.forEach((listener) => this.remove(listener));
    }
    this.nodes.clear();
    this.nodesSweepAt = NODES_SWEEP_MIN;
    this.cleanups.forEach((cleanup) => cleanup());
    this.cleanups.clear();
  }
}

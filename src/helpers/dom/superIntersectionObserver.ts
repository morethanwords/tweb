/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type IntersectionTarget = Element;
export type IntersectionCallback = (entry: IntersectionObserverEntry) => void;

export default class SuperIntersectionObserver {
  private observing: Map<IntersectionTarget, Set<IntersectionCallback>>;
  private observingQueue: SuperIntersectionObserver['observing'];
  private intersecting: Set<IntersectionTarget>;
  private observer: IntersectionObserver;
  private freezedObservingNew: boolean;

  constructor(init?: IntersectionObserverInit) {
    this.observing = new Map();
    this.observingQueue = new Map();
    this.intersecting = new Set();
    this.freezedObservingNew = false;

    this.observer = new IntersectionObserver((entries) => {
      const observing = this.observing;
      for(let i = 0, length = entries.length; i < length; ++i) {
        const entry = entries[i];
        const callbacks = observing.get(entry.target);
        if(!callbacks) {
          console.error('intersection process no callbacks:', entry);
          debugger;
          continue;
        }

        if(entry.isIntersecting) this.intersecting.add(entry.target);
        else this.intersecting.delete(entry.target);

        for(const callback of callbacks) {
          try {
            callback(entry);
          } catch(err) {
            console.error('intersection process callback error:', err);
          }
        }
      }
    }, init);
  }

  public getIntersecting() {
    return this.intersecting;
  }

  public disconnect() {
    this.observing.clear();
    this.observingQueue.clear();
    this.intersecting.clear();
    this.observer.disconnect();
  }

  public toggleObservingNew(value: boolean) {
    if(this.freezedObservingNew === value) {
      return;
    }

    this.freezedObservingNew = value;

    const queue = this.observingQueue;
    if(!value && queue.size) {
      for(const [target, callbacks] of queue) {
        for(const callback of callbacks) {
          this.observe(target, callback);
        }
      }

      queue.clear();
    }
  }

  public has(target: IntersectionTarget, callback: IntersectionCallback, observing = this.observing) {
    const callbacks = observing.get(target);
    return !!(callbacks && callbacks.has(callback));
  }

  public observe(target: IntersectionTarget, callback: IntersectionCallback) {
    if(this.freezedObservingNew && this.has(target, callback)) {
      return;
    }

    const observing = this.freezedObservingNew ? this.observingQueue : this.observing;
    let callbacks = observing.get(target);
    if(callbacks && callbacks.has(callback)) {
      return;
    }

    if(!callbacks) {
      callbacks = new Set();
      observing.set(target, callbacks);

      if(observing === this.observing) {
        this.observer.observe(target);
      }
    }

    callbacks.add(callback);
  }

  public unobserve(target: IntersectionTarget, callback: IntersectionCallback) {
    const observing = this.freezedObservingNew && !this.has(target, callback) ? this.observingQueue : this.observing;
    const callbacks = observing.get(target);
    if(!callbacks) {
      return;
    }

    callbacks.delete(callback);
    if(!callbacks.size) {
      observing.delete(target);
      this.observer.unobserve(target);
      this.intersecting.delete(target);
    }
  }
}

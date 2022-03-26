/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { logger, LogTypes } from "../lib/logger";
import VisibilityIntersector, { OnVisibilityChange } from "./visibilityIntersector";
import throttle from "../helpers/schedulers/throttle";
import findAndSpliceAll from "../helpers/array/findAndSpliceAll";
import indexOfAndSplice from "../helpers/array/indexOfAndSplice";
import findAndSplice from "../helpers/array/findAndSplice";

type LazyLoadElementBase = {
  load: () => Promise<any>
};

type LazyLoadElement = Omit<LazyLoadElementBase, 'load'> & {
  load: (target?: HTMLElement) => Promise<any>,
  div: HTMLElement
  wasSeen?: boolean,
};

const PARALLEL_LIMIT = 8;

export class LazyLoadQueueBase {
  public queueId = 0;
  protected queue: Array<LazyLoadElementBase> = [];
  protected inProcess: Set<LazyLoadElementBase> = new Set();

  protected lockPromise: Promise<void> = null;
  protected unlockResolve: () => void = null;

  protected log = logger('LL', LogTypes.Error);
  protected processQueue: () => void;

  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    this.processQueue = throttle(() => this._processQueue(), 20, false);
  }

  public clear() {
    this.inProcess.clear(); // ацтеки забьются, будет плохо

    this.queue.length = 0;
    // unreachable code
    /* for(let item of this.inProcess) { 
      this.lazyLoadMedia.push(item);
    } */
  }

  public lock() {
    if(this.lockPromise) return;

    //const perf = performance.now();
    this.lockPromise = new Promise((resolve, reject) => {
      this.unlockResolve = resolve;
    });

    /* if(DEBUG) {
      this.lockPromise.then(() => {
        this.log('was locked for:', performance.now() - perf);
      });
    } */
  }

  public unlock() {
    if(!this.unlockResolve) return;

    this.unlockResolve();
    this.unlockResolve = this.lockPromise = null;

    this.processQueue();
  }

  protected async processItem(item: LazyLoadElementBase) {
    if(this.lockPromise) {
      return;
    }

    this.inProcess.add(item);

    /* if(DEBUG) {
      this.log('will load media', this.lockPromise, item);
    } */

    try {
      //await new Promise((resolve) => setTimeout(resolve, 2e3));
      //await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      //await item.load(item.div);
      await this.loadItem(item);
    } catch(err) {
      if(!['NO_ENTRY_FOUND', 'STORAGE_OFFLINE'].includes(err as string)) {
        this.log.error('loadMediaQueue error:', err/* , item */);
      }
    }

    this.inProcess.delete(item);

    /* if(DEBUG) {
      this.log('loaded media', item);
    } */

    this.processQueue();
  }

  protected loadItem(item: LazyLoadElementBase) {
    return item.load();
  }

  protected getItem() {
    return this.queue.shift();
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElementBase) {
    this.queue[method](el);
    this.processQueue();
  }

  protected _processQueue(item?: LazyLoadElementBase) {
    if(!this.queue.length || this.lockPromise || (this.parallelLimit > 0 && this.inProcess.size >= this.parallelLimit)) return;

    //console.log('_processQueue start');
    let added = 0;
    do {
      if(item) {
        indexOfAndSplice(this.queue, item);
      } else {
        item = this.getItem();
      }
  
      if(item) {
        this.processItem(item);
      } else {
        break;
      }

      item = null;
      ++added;
    } while(this.inProcess.size < this.parallelLimit && this.queue.length);
    //console.log('_processQueue end, added', added, this.queue.length);
  }

  public push(el: LazyLoadElementBase) {
    this.addElement('push', el);
  }

  public unshift(el: LazyLoadElementBase) {
    this.addElement('unshift', el);
  }
}

export class LazyLoadQueueIntersector extends LazyLoadQueueBase {
  protected queue: Array<LazyLoadElement> = [];
  protected inProcess: Set<LazyLoadElement> = new Set();

  public intersector: VisibilityIntersector;
  protected intersectorTimeout: number;

  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    super(parallelLimit);
  }

  public lock() {
    super.lock();
    this.intersector.lock();
  }

  public unlock() {
    super.unlock();
    this.intersector.unlock();
  }

  public unlockAndRefresh() {
    super.unlock();
    this.intersector.unlockAndRefresh();
  }

  public clear() {
    super.clear();
    this.intersector.disconnect();
  }

  public refresh() {
    this.intersector.refresh();
  }

  protected loadItem(item: LazyLoadElement) {
    return item.load(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const item = this.queue.find(i => i.div === el.div && i.load === el.load);
    if(item) {
      return false;
    } else {
      for(const item of this.inProcess) {
        if(item.div === el.div && item.load === el.load) {
          return false;
        }
      }
    }

    this.queue[method](el);
    return true;
  }

  protected setProcessQueueTimeout() {
    if(!this.intersectorTimeout) {
      this.intersectorTimeout = window.setTimeout(() => {
        this.intersectorTimeout = 0;
        this.processQueue();
      }, 0);
    }
  }

  public push(el: LazyLoadElement) {
    super.push(el);
  }

  public unshift(el: LazyLoadElement) {
    super.unshift(el);
  }

  public unobserve(el: HTMLElement) {
    findAndSpliceAll(this.queue, (i) => i.div === el);

    this.intersector.unobserve(el);
  }
}

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);
  }

  private onVisibilityChange = (target: HTMLElement, visible: boolean) => {
    if(visible) {
      /* if(DEBUG) {
        this.log('isIntersecting', target);
      } */

      // need for set element first if scrolled
      findAndSpliceAll(this.queue, (i) => i.div === target).forEach(item => {
        item.wasSeen = true;
        this.queue.unshift(item);
        //this.processQueue(item);
      });

      this.setProcessQueueTimeout();
    }
  };

  protected getItem() {
    return findAndSplice(this.queue, item => item.wasSeen);
  }

  public async processItem(item: LazyLoadElement) {
    await super.processItem(item);
    this.intersector.unobserve(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const inserted = super.addElement(method, el);

    if(!inserted) return false;

    this.intersector.observe(el.div);
    /* if(el.wasSeen) {
      this.processQueue(el);
    } else  */if(!el.hasOwnProperty('wasSeen')) {
      el.wasSeen = false;
    }
    
    return true;
  }
}

export class LazyLoadQueueRepeat extends LazyLoadQueueIntersector {
  private _queue: Map<HTMLElement, LazyLoadElement> = new Map();

  constructor(protected parallelLimit = PARALLEL_LIMIT, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((target, visible) => {
      const spliced = findAndSpliceAll(this.queue, (i) => i.div === target);
      if(visible) {
        const items = spliced.length ? spliced : [this._queue.get(target)];
        items.forEach(item => {
          this.queue.unshift(item || this._queue.get(target));
        });
      }
  
      this.onVisibilityChange && this.onVisibilityChange(target, visible);
      this.setProcessQueueTimeout();
    });
  }

  public clear() {
    super.clear();
    this._queue.clear();
  }

  /* public async processItem(item: LazyLoadElement) {
    //await super.processItem(item);
    await LazyLoadQueueBase.prototype.processItem.call(this, item);

    if(this.lazyLoadMedia.length) {
      this.processQueue();
    }
  } */

  public observe(el: LazyLoadElement) {
    this._queue.set(el.div, el);
    this.intersector.observe(el.div);
  }
}

export class LazyLoadQueueRepeat2 extends LazyLoadQueueIntersector {
  constructor(protected parallelLimit = PARALLEL_LIMIT, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((target, visible) => {
      const spliced = findAndSpliceAll(this.queue, (i) => i.div === target);
      if(visible && spliced.length) {
        spliced.forEach(item => {
          this.queue.unshift(item);
        });
      }
  
      this.onVisibilityChange && this.onVisibilityChange(target, visible);
      this.setProcessQueueTimeout();
    });
  }

  public observe(el: HTMLElement) {
    this.intersector.observe(el);
  }
}

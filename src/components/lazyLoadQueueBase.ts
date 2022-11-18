/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from '../helpers/array/indexOfAndSplice';
import {Middleware} from '../helpers/middleware';
import throttle from '../helpers/schedulers/throttle';
import {logger, LogTypes} from '../lib/logger';

const PARALLEL_LIMIT = 8;
const IGNORE_ERRORS: Set<ErrorType> = new Set(['NO_ENTRY_FOUND', 'STORAGE_OFFLINE', 'MIDDLEWARE', 'NO_AUTO_DOWNLOAD']);

export type LazyLoadElementBase = {
  load: () => Promise<any>,
  middleware?: Middleware
};

export default class LazyLoadQueueBase {
  public queueId = 0;
  protected queue: Array<LazyLoadElementBase> = [];
  protected inProcess: Set<LazyLoadElementBase> = new Set();

  protected lockPromise: Promise<void> = null;
  protected unlockResolve: () => void = null;

  protected log = logger('LL', LogTypes.Error);
  protected processQueue: () => void;

  constructor(protected parallelLimit = PARALLEL_LIMIT) {
    this.processQueue = throttle(() => this._processQueue(), 8, false);
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

    // const perf = performance.now();
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
      // await new Promise((resolve) => setTimeout(resolve, 2e3));
      // await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      // await item.load(item.div);
      await this.loadItem(item);
    } catch(err) {
      if(!IGNORE_ERRORS.has((err as ApiError)?.type)) {
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

    // console.log('_processQueue start');
    // let added = 0;
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
      // ++added;
    } while(this.inProcess.size < this.parallelLimit && this.queue.length);
    // console.log('_processQueue end, added', added, this.queue.length);
  }

  public push(el: LazyLoadElementBase) {
    this.addElement('push', el);
  }

  public unshift(el: LazyLoadElementBase) {
    this.addElement('unshift', el);
  }
}

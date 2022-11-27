/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findAndSpliceAll from '../helpers/array/findAndSpliceAll';
import LazyLoadQueueBase, {LazyLoadElementBase} from './lazyLoadQueueBase';
import VisibilityIntersector from './visibilityIntersector';

export type LazyLoadElement = Omit<LazyLoadElementBase, 'load'> & {
  load: (target?: HTMLElement) => Promise<any>,
  div: HTMLElement
  wasSeen?: boolean,
  visible?: boolean
};

export default class LazyLoadQueueIntersector extends LazyLoadQueueBase {
  protected queue: Array<LazyLoadElement> = [];
  protected inProcess: Set<LazyLoadElement> = new Set();

  public intersector: VisibilityIntersector;
  protected intersectorTimeout: number;

  constructor(parallelLimit?: number) {
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
    const item = this.queue.find((i) => i.div === el.div && i.load === el.load);
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
    this.intersectorTimeout ??= window.setTimeout(() => {
      this.intersectorTimeout = undefined;
      this.processQueue();
    }, 0);
  }

  public push(el: LazyLoadElement) {
    super.push(el);
  }

  public unshift(el: LazyLoadElement) {
    super.unshift(el);
  }

  public delete(el: Omit<LazyLoadElement, 'load'>) {
    findAndSpliceAll(this.queue, (i) => i.div === el.div);
    this.unobserve(el);
  }

  public observe(el: LazyLoadElement) {
    this.intersector.observe(el.div);
  }

  public unobserve(el: Omit<LazyLoadElement, 'load'>) {
    this.intersector.unobserve(el.div);
  }
}

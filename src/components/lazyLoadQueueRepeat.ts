/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findAndSpliceAll from "../helpers/array/findAndSpliceAll";
import LazyLoadQueueIntersector, { LazyLoadElement } from "./lazyLoadQueueIntersector";
import VisibilityIntersector, { OnVisibilityChange } from "./visibilityIntersector";

export default class LazyLoadQueueRepeat extends LazyLoadQueueIntersector {
  private _queue: Map<HTMLElement, LazyLoadElement> = new Map();

  constructor(parallelLimit?: number, protected onVisibilityChange?: OnVisibilityChange, options?: IntersectionObserverInit) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((item) => {
      const {target, visible} = item;
      const spliced = findAndSpliceAll(this.queue, (i) => i.div === target);
      if(visible) {
        const items = spliced.length ? spliced : [this._queue.get(target)];
        items.forEach((item) => {
          this.queue.unshift(item || this._queue.get(target));
        });
      }
  
      this.onVisibilityChange && this.onVisibilityChange(item);
      this.setProcessQueueTimeout();
    }, options);
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

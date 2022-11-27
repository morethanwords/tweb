/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from '../helpers/array/indexOfAndSplice';
import LazyLoadQueueIntersector, {LazyLoadElement} from './lazyLoadQueueIntersector';
import VisibilityIntersector, {OnVisibilityChange} from './visibilityIntersector';

export default class LazyLoadQueueRepeat extends LazyLoadQueueIntersector {
  private elementsMap: Map<HTMLElement, LazyLoadElement> = new Map();

  constructor(
    parallelLimit?: number,
    protected onVisibilityChange?: OnVisibilityChange,
    options?: IntersectionObserverInit
  ) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((item) => {
      const {target, visible} = item;

      const queueItem = this.elementsMap.get(target);
      queueItem.visible = visible;

      if(visible) {
        queueItem.wasSeen = true;
        if(!this.queue.includes(queueItem)) {
          this.queue.push(queueItem);
        }
      } else {
        indexOfAndSplice(this.queue, queueItem);
      }

      this.onVisibilityChange?.(item);
      this.setProcessQueueTimeout();
    }, options);
  }

  public clear() {
    super.clear();
    this.elementsMap.clear();
  }

  /* public async processItem(item: LazyLoadElement) {
    //await super.processItem(item);
    await LazyLoadQueueBase.prototype.processItem.call(this, item);

    if(this.lazyLoadMedia.length) {
      this.processQueue();
    }
  } */

  public observe(el: LazyLoadElement) {
    this.elementsMap.set(el.div, el);
    super.observe(el);
  }

  public unobserve(el: LazyLoadElement) {
    this.elementsMap.delete(el.div);
    super.unobserve(el);
  }
}

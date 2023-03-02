/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import VisibilityIntersector, {OnVisibilityChangeItem} from './visibilityIntersector';
import findAndSpliceAll from '../helpers/array/findAndSpliceAll';
import findAndSplice from '../helpers/array/findAndSplice';
import LazyLoadQueueIntersector, {LazyLoadElement} from './lazyLoadQueueIntersector';
import useHeavyAnimationCheck from '../hooks/useHeavyAnimationCheck';

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  constructor(parallelLimit?: number, ignoreHeavyAnimation?: boolean) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);

    !ignoreHeavyAnimation && useHeavyAnimationCheck(() => {
      this.lock();
    }, () => {
      this.unlockAndRefresh();
    });
  }

  private onVisibilityChange = ({target, visible}: OnVisibilityChangeItem) => {
    // if(DEBUG) {
    //   this.log('isIntersecting', target, visible);
    // }

    // if visible - will move to the end of visible arary
    findAndSpliceAll(this.queue, (i) => i.div === target).forEach((item) => {
      if(visible) {
        item.wasSeen = true;
      }

      item.visible = visible;
      const index = this.queue.findIndex((item) => !item.visible);
      this.queue.splice(Math.max(0, index), 0, item);
    });

    this.setProcessQueueTimeout();
  };

  protected getItem() {
    return findAndSplice(this.queue, (item) => item.wasSeen);
  }

  public async processItem(item: LazyLoadElement) {
    await super.processItem(item);
    this.intersector.unobserve(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const inserted = super.addElement(method, el);

    if(!inserted) return false;

    this.observe(el);
    /* if(el.wasSeen) {
      this.processQueue(el);
    } else  */
    el.wasSeen ??= false;

    return true;
  }

  public setAllSeen() {
    this.queue.forEach((item) => {
      item.wasSeen = true;
    });

    this.setProcessQueueTimeout();
  }
}

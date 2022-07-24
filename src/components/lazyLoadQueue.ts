/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import VisibilityIntersector, { OnVisibilityChangeItem } from "./visibilityIntersector";
import findAndSpliceAll from "../helpers/array/findAndSpliceAll";
import findAndSplice from "../helpers/array/findAndSplice";
import LazyLoadQueueIntersector, { LazyLoadElement } from "./lazyLoadQueueIntersector";

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  constructor(parallelLimit?: number) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);
  }

  private onVisibilityChange = ({target, visible}: OnVisibilityChangeItem) => {
    if(visible) {
      /* if(DEBUG) {
        this.log('isIntersecting', target);
      } */

      // need for set element first if scrolled
      findAndSpliceAll(this.queue, (i) => i.div === target).forEach((item) => {
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

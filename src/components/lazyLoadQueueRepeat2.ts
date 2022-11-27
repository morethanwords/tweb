/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findAndSpliceAll from '../helpers/array/findAndSpliceAll';
import LazyLoadQueueIntersector, {LazyLoadElement} from './lazyLoadQueueIntersector';
import VisibilityIntersector, {OnVisibilityChange} from './visibilityIntersector';

export default class LazyLoadQueueRepeat2 extends LazyLoadQueueIntersector {
  constructor(parallelLimit?: number, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((item) => {
      const {target, visible} = item;
      const spliced = findAndSpliceAll(this.queue, (i) => i.div === target);
      if(visible && spliced.length) {
        spliced.forEach((item) => {
          this.queue.unshift(item);
        });
      }

      this.onVisibilityChange && this.onVisibilityChange(item);
      this.setProcessQueueTimeout();
    });
  }

  public observe(el: LazyLoadElement) {
    super.observe(el);
  }
}

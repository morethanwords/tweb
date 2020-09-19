import { logger, LogLevels } from "../lib/logger";
import VisibilityIntersector, { OnVisibilityChange } from "./visibilityIntersector";

type LazyLoadElementBase = {
  div: HTMLDivElement, 
  load: (target?: HTMLDivElement) => Promise<any>
};

type LazyLoadElement = LazyLoadElementBase & {
  wasSeen?: boolean
};

export class LazyLoadQueueBase {
  protected lazyLoadMedia: Array<LazyLoadElementBase> = [];
  protected inProcess: Set<LazyLoadElementBase> = new Set();

  protected lockPromise: Promise<void> = null;
  protected unlockResolve: () => void = null;

  protected log = logger('LL', LogLevels.error);

  constructor(protected parallelLimit = 5) {
  }

  public clear() {
    this.inProcess.clear(); // ацтеки забьются, будет плохо

    this.lazyLoadMedia.length = 0;
    // unreachable code
    /* for(let item of this.inProcess) { 
      this.lazyLoadMedia.push(item);
    } */
  }

  public lock() {
    if(this.lockPromise) return;
    this.lockPromise = new Promise((resolve, reject) => {
      this.unlockResolve = resolve;
    });
  }

  public unlock() {
    if(!this.unlockResolve) return;
    this.lockPromise = null;
    this.unlockResolve();
    this.unlockResolve = null;
  }

  public async processItem(item: LazyLoadElementBase) {
    this.inProcess.add(item);

    this.log('will load media', this.lockPromise, item);

    try {
      if(this.lockPromise/*  && false */) {
        const perf = performance.now();
        await this.lockPromise;

        this.log('waited lock:', performance.now() - perf);
      }
      
      //await new Promise((resolve) => setTimeout(resolve, 2e3));
      //await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      await item.load(item.div);
    } catch(err) {
      this.log.error('loadMediaQueue error:', err/* , item */);
    }

    this.inProcess.delete(item);

    this.log('loaded media', item);

    if(this.lazyLoadMedia.length) {
      this.processQueue();
    }
  }

  protected getItem() {
    return this.lazyLoadMedia.shift();
  }

  protected addElement(el: LazyLoadElementBase) {
    this.processQueue(el);
  }

  public async processQueue(item?: LazyLoadElementBase) {
    if(this.parallelLimit > 0 && this.inProcess.size >= this.parallelLimit) return;

    do {
      if(item) {
        this.lazyLoadMedia.findAndSplice(i => i == item);
      } else {
        item = this.getItem();
      }
  
      if(item) {
        this.processItem(item);
      } else {
        break;
      }

      item = null;
    } while(this.inProcess.size < this.parallelLimit && this.lazyLoadMedia.length);
  }

  public push(el: LazyLoadElementBase) {
    this.lazyLoadMedia.push(el);
    this.addElement(el);
  }

  public unshift(el: LazyLoadElementBase) {
    this.lazyLoadMedia.unshift(el);
    this.addElement(el);
  }
}

export class LazyLoadQueueIntersector extends LazyLoadQueueBase {
  public intersector: VisibilityIntersector;
  protected intersectorTimeout: number;

  constructor(protected parallelLimit = 5) {
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

  protected setProcessQueueTimeout() {
    if(!this.intersectorTimeout) {
      this.intersectorTimeout = window.setTimeout(() => {
        this.intersectorTimeout = 0;
        this.processQueue();
      }, 0);
    }
  }
}

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  protected lazyLoadMedia: Array<LazyLoadElement> = [];
  protected inProcess: Set<LazyLoadElement> = new Set();

  constructor(protected parallelLimit = 5) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);
  }

  private onVisibilityChange = (target: HTMLElement, visible: boolean) => {
    if(visible) {
      this.log('isIntersecting', target);

      // need for set element first if scrolled
      const item = this.lazyLoadMedia.findAndSplice(i => i.div == target);
      if(item) {
        item.wasSeen = true;
        this.lazyLoadMedia.unshift(item);
        //this.processQueue(item);
      }

      this.setProcessQueueTimeout();
    }
  };

  protected getItem() {
    return this.lazyLoadMedia.findAndSplice(item => item.wasSeen);
  }

  public async processItem(item: LazyLoadElement) {
    await super.processItem(item);
    this.intersector.unobserve(item.div);
  }

  protected addElement(el: LazyLoadElement) {
    //super.addElement(el);
    if(el.wasSeen) {
      super.processQueue(el);
    } else {
      el.wasSeen = false;
      this.intersector.observe(el.div);
    }
  }

  public push(el: LazyLoadElement) {
    super.push(el);
  }

  public unshift(el: LazyLoadElement) {
    super.unshift(el);
  }
}

export class LazyLoadQueueRepeat extends LazyLoadQueueIntersector {
  private _lazyLoadMedia: Map<HTMLElement, LazyLoadElementBase> = new Map();

  constructor(protected parallelLimit = 5, protected onVisibilityChange?: OnVisibilityChange) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector((target, visible) => {
      if(visible) {
        const item = this.lazyLoadMedia.findAndSplice(i => i.div == target);
        this.lazyLoadMedia.unshift(item || this._lazyLoadMedia.get(target));
      } else {
        this.lazyLoadMedia.findAndSplice(i => i.div == target);
      }
  
      this.onVisibilityChange && this.onVisibilityChange(target, visible);
      this.setProcessQueueTimeout();
    });
  }

  /* public async processItem(item: LazyLoadElement) {
    //await super.processItem(item);
    await LazyLoadQueueBase.prototype.processItem.call(this, item);

    if(this.lazyLoadMedia.length) {
      this.processQueue();
    }
  } */

  public observe(el: LazyLoadElementBase) {
    this._lazyLoadMedia.set(el.div, el);
    this.intersector.observe(el.div);
  }
}

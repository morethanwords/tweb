import { logger, LogLevels } from "../lib/logger";

type LazyLoadElement = {
  div: HTMLDivElement, 
  load: () => Promise<any>, 
  wasSeen?: boolean
};

export default class LazyLoadQueue {
  private lazyLoadMedia: Array<LazyLoadElement> = [];
  private inProcess: Array<LazyLoadElement> = [];

  private lockPromise: Promise<void> = null;
  private unlockResolve: () => void = null;

  private log = logger('LL', LogLevels.error);

  // Observer will call entry only 1 time per element
  private observer: IntersectionObserver;

  private intersectionLocked = false;

  constructor(private parallelLimit = 5, private noObserver = false) {
    if(noObserver) return;

    this.observer = new IntersectionObserver(entries => {
      if(this.lockPromise) return;

      const intersecting = entries.filter(entry => entry.isIntersecting);
      intersecting.forEachReverse(entry => {
        const target = entry.target as HTMLElement;

        this.log('isIntersecting', target);

        // need for set element first if scrolled
        const item = this.lazyLoadMedia.findAndSplice(i => i.div == target);
        if(item) {
          item.wasSeen = true;
          this.lazyLoadMedia.unshift(item);
          //this.processQueue(item);
        }
      });

      if(intersecting.length) {
        this.processQueue();
      }
    });
  }

  public clear() {
    this.inProcess.length = 0; // ацтеки забьются, будет плохо

    this.lazyLoadMedia.length = 0;
    for(let item of this.inProcess) {
      this.lazyLoadMedia.push(item);
    }

    if(this.observer) {
      this.observer.disconnect();
    }
  }

  public length() {
    return this.lazyLoadMedia.length + this.inProcess.length;
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

  public async processQueue(item?: LazyLoadElement) {
    if(this.parallelLimit > 0 && this.inProcess.length >= this.parallelLimit) return;

    if(item) {
      this.lazyLoadMedia.findAndSplice(i => i == item);
    } else {
      item = this.lazyLoadMedia.findAndSplice(i => i.wasSeen);
    }

    if(item) {
      this.inProcess.push(item);

      this.log('will load media', this.lockPromise, item);

      try {
        if(this.lockPromise/*  && false */) {
          let perf = performance.now();
          await this.lockPromise;

          this.log('waited lock:', performance.now() - perf);
        }
        
        //await new Promise((resolve) => setTimeout(resolve, 2e3));
        //await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        await item.load();
      } catch(err) {
        this.log.error('loadMediaQueue error:', err/* , item */);
      }

      if(!this.noObserver) {
        this.observer.unobserve(item.div);
      }

      this.inProcess.findAndSplice(i => i == item);

      this.log('loaded media', item);

      if(this.lazyLoadMedia.length) {
        this.processQueue();
      }
    }
  }

  public addElement(el: LazyLoadElement) {
    if(el.wasSeen) {
      this.processQueue(el);
    } else {
      el.wasSeen = false;

      if(this.observer) {
        this.observer.observe(el.div);
      }
    }
  }
  
  public push(el: LazyLoadElement) {
    this.lazyLoadMedia.push(el);
    this.addElement(el);
  }

  public unshift(el: LazyLoadElement) {
    this.lazyLoadMedia.unshift(el);
    this.addElement(el);
  }

  public refresh() {
    const items = this.lazyLoadMedia;
    if(items && items.length) {
      items.forEach(item => {
        this.observer.unobserve(item.div);
      });

      window.requestAnimationFrame(() => {
        items.forEach(item => {
          this.observer.observe(item.div);
        });
      });
    }
  }

  public lockIntersection() {
    this.intersectionLocked = true;
  }

  public unlockIntersection() {
    this.intersectionLocked = false;
    this.refresh();
  }
}

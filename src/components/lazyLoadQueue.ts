import { isElementInViewport } from "../lib/utils";

type LazyLoadElement = {
  div: HTMLDivElement, 
  load: () => Promise<void>, 
  wasSeen?: boolean
};

export default class LazyLoadQueue {
  private lazyLoadMedia: Array<LazyLoadElement> = [];
  private loadingMedia = 0;
  private tempID = 0;

  private lockPromise: Promise<void> = null;
  private unlockResolve: () => void = null;

  constructor(private parallelLimit = 5) {

  }

  public clear() {
    this.tempID--;
    this.lazyLoadMedia.length = 0;
    this.loadingMedia = 0;
  }

  public length() {
    return this.lazyLoadMedia.length + this.loadingMedia;
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

  public async processQueue(id?: number) {
    if(this.parallelLimit > 0 && this.loadingMedia >= this.parallelLimit) return;

    let item: LazyLoadElement;
    let index: number;

    if(id !== undefined) item = this.lazyLoadMedia.splice(id, 1)[0];
    else {
      item = this.lazyLoadMedia.findAndSplice(i => isElementInViewport(i.div));
      if(!item) {
        let length = this.lazyLoadMedia.length;
        for(index = length - 1; index >= 0; --index) {
          if(this.lazyLoadMedia[index].wasSeen) {
            item = this.lazyLoadMedia.splice(index, 1)[0];
            break;
          }
        }
      }
    }

    if(item) {
      this.loadingMedia++;

      let tempID = this.tempID;

      console.log('lazyLoadQueue: will load media', this.lockPromise);

      try {
        if(this.lockPromise) {
          let perf = performance.now();
          await this.lockPromise; 
          console.log('lazyLoadQueue: waited lock:', performance.now() - perf);
        }
        
        await new Promise((resolve, reject) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        await item.load();
      } catch(err) {
        console.error('loadMediaQueue error:', err, item, id, index);
      }

      if(tempID == this.tempID) {
        this.loadingMedia--;
      }

      console.log('lazyLoadQueue: loaded media');

      if(this.lazyLoadMedia.length) {
        this.processQueue();
      }
    }
  }
  
  public check(id?: number) {
    if(id !== undefined) {
      let {div, wasSeen} = this.lazyLoadMedia[id];
      if(!wasSeen && isElementInViewport(div)) {
        //console.log('will load div by id:', div, div.getBoundingClientRect());
        this.lazyLoadMedia[id].wasSeen = true;
        this.processQueue(id);
      }
      
      return;
    }

    let length = this.lazyLoadMedia.length;
    for(let i = length - 1; i >= 0; --i) {
      let {div, wasSeen} = this.lazyLoadMedia[i];
      
      if(!wasSeen && isElementInViewport(div)) {
        //console.log('will load div:', div);
        this.lazyLoadMedia[i].wasSeen = true;
        this.processQueue(i);
        //this.lazyLoadMedia.splice(i, 1);
      }
    }
  }
  
  public push(el: LazyLoadElement) {
    let id = this.lazyLoadMedia.push(el) - 1;

    if(el.wasSeen) {
      this.processQueue(id);
    } else {
      el.wasSeen = false;
      this.check(id);
    }
  }
}

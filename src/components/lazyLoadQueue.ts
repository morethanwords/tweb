import { isElementInViewport } from "../lib/utils";

export default class LazyLoadQueue {
  private lazyLoadMedia: Array<{div: HTMLDivElement, load: () => Promise<void>, wasSeen?: boolean}> = [];
  private loadingMedia = 0;
  private tempID = 0;

  constructor(private parallelLimit = 0) {

  }

  public clear() {
    this.tempID--;
    this.lazyLoadMedia.length = 0;
    this.loadingMedia = 0;
  }

  public async processQueue(id?: number) {
    if(this.parallelLimit > 0 && this.loadingMedia >= this.parallelLimit) return;

    let item: {div: HTMLDivElement, load: () => Promise<void>, wasSeen?: boolean};
    let index: number;
    /* if(id) item = this.lazyLoadMedia.splice(id, 1) as any;
    else item = this.lazyLoadMedia.pop(); */

    if(id !== undefined) item = this.lazyLoadMedia.splice(id, 1)[0];
    else {
      index = this.lazyLoadMedia.findIndex(i => isElementInViewport(i.div));
      if(index !== -1) {
        item = this.lazyLoadMedia.splice(index, 1)[0];
      } else {
        //index = this.lazyLoadMedia.findIndex(i => i.wasSeen);
        //if(index !== -1) {
          //item = this.lazyLoadMedia.splice(index, 1)[0];
        /*} else {
          item = this.lazyLoadMedia.pop();
        } */

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

      try {
        await item.load();
      } catch(err) {
        console.error('loadMediaQueue error:', err, item, id, index);
      }

      if(tempID == this.tempID) {
        this.loadingMedia--;
      }

      if(this.lazyLoadMedia.length) {
        this.processQueue();
      }
    }
  }
  
  public check(id?: number) {
    /* if(id !== undefined) {
      let {div, load} = this.lazyLoadMedia[id];
      if(isElementInViewport(div)) {
        //console.log('will load div by id:', div, div.getBoundingClientRect());
        load();
        this.lazyLoadMedia.splice(id, 1);
      }
      
      return;
    }

    let length = this.lazyLoadMedia.length;
    for(let i = length - 1; i >= 0; --i) {
      let {div, load} = this.lazyLoadMedia[i];
      
      if(isElementInViewport(div)) {
        console.log('will load div:', div);
        load();
        this.lazyLoadMedia.splice(i, 1);
      }
    } */

    if(id !== undefined) {
      let {div} = this.lazyLoadMedia[id];
      if(isElementInViewport(div)) {
        //console.log('will load div by id:', div, div.getBoundingClientRect());
        this.lazyLoadMedia[id].wasSeen = true;
        this.processQueue(id);
      }
      
      return;
    }

    let length = this.lazyLoadMedia.length;
    for(let i = length - 1; i >= 0; --i) {
      let {div} = this.lazyLoadMedia[i];
      
      if(isElementInViewport(div)) {
        console.log('will load div:', div);
        this.lazyLoadMedia[i].wasSeen = true;
        this.processQueue(i);
        //this.lazyLoadMedia.splice(i, 1);
      }
    }
    
    /* this.lazyLoadMedia = this.lazyLoadMedia.filter(({div, load}) => {
      if(isElementInViewport(div)) {
        //console.log('will load div:', div, div.getBoundingClientRect());
        load();
        return false;
      }
      
      return true;
    }); */
  }
  
  public push(el: {div: HTMLDivElement, load: () => Promise<void>, wasSeen?: boolean}) {
    el.wasSeen = false;
    let id = this.lazyLoadMedia.push(el) - 1;
    
    this.check(id);
  }
}

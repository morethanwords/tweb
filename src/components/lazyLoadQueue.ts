import { isElementInViewport } from "../lib/utils";

export default class LazyLoadQueue {
  private lazyLoadMedia: Array<{div: HTMLDivElement, load: () => Promise<void>}> = [];
  
  public check(id?: number) {
    /* let length = this.lazyLoadMedia.length;
    for(let i = length - 1; i >= 0; --i) {
      let {div, load} = this.lazyLoadMedia[i];
      
      if(isElementInViewport(div)) {
        console.log('will load div:', div);
        load();
        this.lazyLoadMedia.splice(i, 1);
      }
    } */
    if(id !== undefined) {
      let {div, load} = this.lazyLoadMedia[id];
      if(isElementInViewport(div)) {
        //console.log('will load div by id:', div, div.getBoundingClientRect());
        load();
        this.lazyLoadMedia.splice(id, 1);
      }
      
      return;
    }
    
    this.lazyLoadMedia = this.lazyLoadMedia.filter(({div, load}) => {
      if(isElementInViewport(div)) {
        //console.log('will load div:', div, div.getBoundingClientRect());
        load();
        return false;
      }
      
      return true;
    });
  }
  
  public push(el: {div: HTMLDivElement, load: () => Promise<void>}) {
    let id = this.lazyLoadMedia.push(el) - 1;
    
    this.check(id);
  }
}

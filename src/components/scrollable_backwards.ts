import { cancelEvent } from "../lib/utils";

//import {measure} from 'fastdom/fastdom.min';
import FastDom from 'fastdom';
import 'fastdom/src/fastdom-strict'; // exclude in production
import FastDomPromised from 'fastdom/extensions/fastdom-promised';

//const fastdom = FastDom.extend(FastDomPromised);
const fastdom = ((window as any).fastdom as typeof FastDom).extend(FastDomPromised);

(window as any).fastdom.strict(false);

setTimeout(() => {
  //(window as any).fastdom.strict(true);
}, 5e3);

/*
var el = $0;
var height = 0;
var checkUp = false;

do {
  height += el.scrollHeight;
} while(el = (checkUp ? el.previousElementSibling : el.nextElementSibling));
console.log(height);
*/

export default class Scrollable {
  public container: HTMLDivElement;
  public thumb: HTMLDivElement;
  
  public type: string;
  public side: string;
  public scrollType: string;
  public scrollSide: string;
  public clientAxis: string;
  
  public scrollSize = -1;
  public size = 0;
  public thumbSize = 0;
  
  public hiddenElements: {
    up: {element: Element, height: number}[],
    down: {element: Element, height: number}[]
  } = {
    up: [],
    down: []
  };
  public paddings = {up: 0, down: 0};
  
  public paddingTopDiv: HTMLDivElement;
  public paddingBottomDiv: HTMLDivElement;
  
  public splitUp: HTMLElement;
  
  public onAddedBottom: () => void = null;
  public onScrolledTop: () => void = null;
  public onScrolledBottom: () => void = null;
  
  public topObserver: IntersectionObserver;
  public bottomObserver: IntersectionObserver;
  
  public splitObserver: IntersectionObserver;
  public splitMeasure: Promise<{element: Element, height: number}[]> = null;
  public splitMeasureAdd: Promise<number> = null;
  public splitMeasureRemoveBad: Promise<Element> = null;
  public splitMutate: Promise<void> = null;
  
  constructor(public el: HTMLDivElement, x = false, y = true, public splitOffset = 300) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');
    
    let arr = [];
    for(let i = 0.001; i < 1; i += 0.001) arr.push(i);
    this.topObserver = new IntersectionObserver(entries => {
      let entry = entries[entries.length - 1];
      
      console.log('top intersection:', entries, entry.isIntersecting, entry.intersectionRatio > 0);
      if(entry.isIntersecting) {
        //this.onTopIntersection(entry);
        this.onTopIntersection(entry.intersectionRect.height);
        
        if(this.onScrolledTop) this.onScrolledTop();
      }
      // console.log('top intersection end');
    }, {threshold: arr, root: this.el});
    
    this.bottomObserver = new IntersectionObserver(entries => {
      let entry = entries[entries.length - 1];
      
      console.log('bottom intersection:', entries, entry, entry.isIntersecting, entry.intersectionRatio > 0);
      if(entry.isIntersecting) {
        //this.onBottomIntersection(entry);
        let scrollTop = entry.boundingClientRect.top;
        
        console.log('bottom intersection scrollTop', scrollTop);

        if(scrollTop < 0) {

        } //else this.onBottomIntersection(entry.intersectionRect.height);

        //this.onBottomIntersection(entry.boundingClientRect.height);
        
        if(this.onScrolledBottom) this.onScrolledBottom();
      }
    }, {threshold: arr, root: this.el});
    
    if(x) {
      this.container.classList.add('scrollable-x');
      this.type = 'width';
      this.side = 'left';
      this.scrollType = 'scrollWidth';
      this.scrollSide = 'scrollLeft';
      this.clientAxis = 'clientX';
      
      let scrollHorizontally = (e: any) => {
        e = window.event || e;
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        this.container.scrollLeft -= (delta * 20);
        e.preventDefault();
      };
      if(this.container.addEventListener) {
        // IE9, Chrome, Safari, Opera
        this.container.addEventListener("mousewheel", scrollHorizontally, false);
        // Firefox
        this.container.addEventListener("DOMMouseScroll", scrollHorizontally, false);
      } else {
        // IE 6/7/8
        // @ts-ignore
        this.container.attachEvent("onmousewheel", scrollHorizontally);
      }
    } else if(y) {
      this.container.classList.add('scrollable-y');
      this.type = 'height';
      this.side = 'top';
      this.scrollType = 'scrollHeight';
      this.scrollSide = 'scrollTop';
      this.clientAxis = 'clientY';
    } else {
      throw new Error('no side for scroll');
    }
    
    this.thumb = document.createElement('div');
    this.thumb.className = 'scrollbar-thumb';
    
    // @ts-ignore
    this.thumb.style[this.type] = '30px';
    
    // mouse scroll
    let onMouseMove = (e: MouseEvent) => {
      let rect = this.thumb.getBoundingClientRect();
      
      let diff: number;
      // @ts-ignore
      diff = e[this.clientAxis] - rect[this.side];
      // @ts-ignore
      this.container[this.scrollSide] += diff * 0.5;
      
      // console.log('onMouseMove', e, diff);
      
      cancelEvent(e);
    };
    
    this.thumb.addEventListener('mousedown', () => {
      window.addEventListener('mousemove', onMouseMove);
      
      window.addEventListener('mouseup', () => {
        window.removeEventListener('mousemove', onMouseMove);
      }, {once: true});
    });
    
    //this.container.addEventListener('mouseover', this.resize.bind(this)); // omg
    window.addEventListener('resize', this.resize.bind(this));
    
    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');
    
    this.topObserver.observe(this.paddingTopDiv);
    this.bottomObserver.observe(this.paddingBottomDiv);
    
    this.container.addEventListener('scroll', this.onScroll.bind(this));
    
    Array.from(el.children).forEach(c => this.container.append(c));
    
    el.append(this.container);
    this.container.parentElement.append(this.thumb);
    this.resize();
  }
  
  public detachTop(child: Element, needHeight = 0) {
    if(this.splitMeasure) fastdom.clear(this.splitMeasure);
    this.splitMeasure = fastdom.measure(() => {
      let sliced: {element: Element, height: number}[] = [];
      
      do {
        if(needHeight > 0) {
          needHeight -= child.scrollHeight;
        } else {
          sliced.push({element: child, height: child.scrollHeight});
        }
      } while(child = child.previousElementSibling);
      return sliced;
    });
    
    return this.splitMeasure.then(sliced => {
      if(this.splitMutate) fastdom.clear(this.splitMutate);
      
      return this.splitMutate = fastdom.mutate(() => {
        sliced.forEachReverse((child) => {
          let {element, height} = child;
          if(!this.splitUp.contains(element)) return;
          
          this.paddings.up += height;
          this.hiddenElements.up.push(child);
          this.splitUp.removeChild(element);
          //element.parentElement.removeChild(element);
        });
        
        console.log('onscroll sliced up', sliced);
        
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      });
    });
  }
  
  public detachBottom(child: Element, needHeight = 0) {
    if(this.splitMeasure) fastdom.clear(this.splitMeasure);
    this.splitMeasure = fastdom.measure(() => {
      let sliced: {element: Element, height: number}[] = [];
      
      do {
        if(needHeight > 0) {
          needHeight -= child.scrollHeight;
        } else {
          sliced.push({element: child, height: child.scrollHeight});
        }
      } while(child = child.nextElementSibling);
      return sliced;
    });
    
    return this.splitMeasure.then(sliced => {
      if(this.splitMutate) fastdom.clear(this.splitMutate);
      
      return this.splitMutate = fastdom.mutate(() => {
        sliced.forEachReverse((child) => {
          let {element, height} = child;
          if(!this.splitUp.contains(element)) return;
          
          this.paddings.down += height;
          this.hiddenElements.down.unshift(child);
          this.splitUp.removeChild(element);
          //element.parentElement.removeChild(element);
        });
        
        console.log('onscroll sliced down', sliced);
        
        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      });
    });
  }
  
  public splitObserve(entries: IntersectionObserverEntry[]) {
    let sorted: {
      intersecting: {
        top?: IntersectionObserverEntry,
        bottom?: IntersectionObserverEntry
      },
      notIntersecting: {
        top?: IntersectionObserverEntry,
        bottom?: IntersectionObserverEntry
      }
    } = {
      intersecting: {},
      notIntersecting: {}
    };
    
    for(let entry of entries) { // there may be duplicates (1st - not intersecting, 2nd - intersecting)
      //console.log('onscroll entry 1', entry.target, entry.isIntersecting, entry);
      if(!entry.target.parentElement || !entry.rootBounds) continue;
      
      if(!entry.isIntersecting) {
        let isTop = entry.boundingClientRect.top <= 0;
        let isBottom = entry.rootBounds.height <= entry.boundingClientRect.top;
        //console.log('onscroll entry notIntersecting', isTop, isBottom, entry.target, entry);
        
        if(isTop) {
          sorted.notIntersecting.top = entry;
        } else if(isBottom && !sorted.notIntersecting.bottom) {
          sorted.notIntersecting.bottom = entry;
        }
        
        //console.log('splitObserver', entry, entry.target, isTop);
      } else {
        let isTop = entry.boundingClientRect.top <= entry.rootBounds.top;
        let isBottom = entry.boundingClientRect.bottom >= entry.rootBounds.bottom;
        
        if(isTop) {
          sorted.intersecting.top = entry;
        } else if(isBottom && !sorted.intersecting.bottom) {
          sorted.intersecting.bottom = entry;
        }
        
        // if(isTop) {
        //   this.onTopIntersection(entry.boundingClientRect.height);
        // } else if(isBottom) {
        //   this.onTopIntersection(entry.boundingClientRect.height);
        // }
      }
    }

    console.log('splitObserve', entries, sorted);
    
    let needHeight = this.splitOffset;
    let isOutOfView: boolean;
    let entry: IntersectionObserverEntry;
    if(entry = sorted.notIntersecting.top) { // scrolled bottom
      let child = entry.target;

      let diff = entry.boundingClientRect.bottom + needHeight;
      if(diff < 0) { // maybe need <=, means out of view
        if(!(child = child.nextElementSibling)) {
          this.detachTop(this.splitUp.lastElementChild, 0);
        } else {
          if(this.splitMeasureRemoveBad) fastdom.clear(this.splitMeasureRemoveBad);
          this.splitMeasureRemoveBad = fastdom.measure(() => {
            do {
              diff += child.scrollHeight;
            } while(diff < 0 && (child = child.nextElementSibling));

            return child || this.splitUp.lastElementChild;
          });

          this.splitMeasureRemoveBad.then(child => {
            this.detachTop(child, 0);
          });
        }
      } else {
        this.detachTop(child, needHeight);
      }
    }
    
    if(entry = sorted.notIntersecting.bottom) { // scrolled top
      isOutOfView = (entry.boundingClientRect.top - needHeight) >= entry.rootBounds.height;
      this.detachBottom(entry.target, isOutOfView ? 0 : needHeight);
    }
    
    if(entry = sorted.intersecting.top) { // scrolling top
      let needHeight = this.splitOffset;
      
      let child = entry.target;
      if(this.splitMeasureAdd) fastdom.clear(this.splitMeasureAdd);
      this.splitMeasureAdd = fastdom.measure(() => {
        while(child = child.previousElementSibling) {
          needHeight -= child.scrollHeight;
        }
        
        return needHeight;
      });
      
      this.splitMeasureAdd.then(needHeight => {
        this.onTopIntersection(needHeight);
      });
    }
    
    if(entry = sorted.intersecting.bottom) { // scrolling bottom
      let needHeight = this.splitOffset;
      
      let child = entry.target;
      if(this.splitMeasureAdd) fastdom.clear(this.splitMeasureAdd);
      this.splitMeasureAdd = fastdom.measure(() => {
        while(child = child.nextElementSibling) {
          needHeight -= child.scrollHeight;
        }
        
        return needHeight;
      });
      
      this.splitMeasureAdd.then(needHeight => {
        this.onBottomIntersection(needHeight);
      });
    }
  }
  
  public async resize() {
    //console.time('scroll resize');
    
    await fastdom.measure(() => {
      // @ts-ignore
      this.scrollSize = this.container[this.scrollType];
      
      let rect = this.container.getBoundingClientRect();
      
      // @ts-ignore
      this.size = rect[this.type];
    });
    
    await fastdom.mutate(() => {
      if(!this.size || this.size == this.scrollSize) {
        this.thumbSize = 0;
        
        // @ts-ignore
        this.thumb.style[this.type] = this.thumbSize + 'px';
        //console.timeEnd('scroll resize');
        return;
      }
      //if(!height) return;
      
      let divider = this.scrollSize / this.size / 0.5;
      this.thumbSize = this.size / divider;
      
      if(this.thumbSize < 20) this.thumbSize = 20;
      
      // @ts-ignore
      this.thumb.style[this.type] = this.thumbSize + 'px';
    });
    
    //console.timeEnd('scroll resize');
    
    // @ts-ignore
    //console.log('onresize', thumb.style[type], thumbHeight, height);
  }
  
  public async setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    
    this.hiddenElements.up.length = this.hiddenElements.down.length = 0;
    this.paddings.up = this.paddings.down = 0;
    
    if(this.paddingTopDiv.parentElement) {
      fastdom.mutate(() => {
        this.paddingTopDiv.style.height = '';
        this.paddingBottomDiv.style.height = '';
      });
    }
    
    if(this.splitObserver) {
      this.splitObserver.disconnect();
    }
    
    this.splitObserver = new IntersectionObserver((entries) => this.splitObserve(entries), {root: this.el});
    
    if(el) {
      fastdom.mutate(() => {
        el.parentElement.insertBefore(this.paddingTopDiv, el);
        el.parentNode.insertBefore(this.paddingBottomDiv, el.nextSibling);
      });
    }
  }
  
  public async onScroll(e?: any) {
    //console.log('scroll onScroll', e, this.container.scrollTop);
    let {value, maxValue} = await fastdom.measure(() => {
      // @ts-ignore
      if(this.container[this.scrollType] != this.scrollSize || this.thumbSize == 0) {
        this.resize();
      }
      
      // @ts-ignore
      let value = this.container[this.scrollSide] / (this.scrollSize - this.size) * 100;
      let maxValue = 100 - (this.thumbSize / this.size * 100);
      
      return {value, maxValue};
    });
    
    //console.log('onscroll', container.scrollHeight, thumbHeight, height, value, maxValue);
    fastdom.mutate(() => {
      // @ts-ignore
      this.thumb.style[this.side] = (value >= maxValue ? maxValue : value) + '%';
    });
    
    //console.timeEnd('scroll onScroll');
  }
  
  public async onTopIntersection(/* entry: IntersectionObserverEntry */needHeight: number) {
    console.log('onTopIntersection', needHeight, this);
    
    if(this.hiddenElements.up.length && this.paddings.up) {
      //let needHeight = entry.intersectionRect.height || entry.boundingClientRect.height;
      //let needHeight = entry.intersectionRect.height || await fastdom.measure(() => this.splitUp.lastElementChild.scrollHeight);
      
      let fragment = document.createDocumentFragment();
      while(needHeight > 0 && this.paddings.up) {
        let child = this.hiddenElements.up.pop();
        
        // console.log('top returning from hidden', child);
        
        if(!child) {
          this.paddings.up = 0;
          break;
        }
        
        fragment.prepend(child.element);
        
        needHeight -= child.height;
        this.paddings.up -= child.height;
      }
      
      await fastdom.mutate(() => {
        this.splitUp.prepend(fragment);
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      });
    } else {
      await fastdom.mutate(() => {
        this.paddingTopDiv.style.height = '0px';
      });
    }
  }
  
  public async onBottomIntersection(/* entry: IntersectionObserverEntry */needHeight: number) {
    console.log('onBottomIntersection', needHeight, this);
    
    if(this.hiddenElements.down.length && this.paddings.down) {
      //let needHeight = entry.intersectionRect.height || entry.boundingClientRect.height;
      //let needHeight = entry.intersectionRect.height || await fastdom.measure(() => this.splitUp.firstElementChild.scrollHeight);
      
      let fragment = document.createDocumentFragment();
      while(needHeight > 0 && this.paddings.down) {
        let child = this.hiddenElements.down.shift();
        
        if(!child) {
          this.paddings.down = 0;
          break;
        }
        
        fragment.appendChild(child.element);
        
        needHeight -= child.height;
        this.paddings.down -= child.height;
      }
      
      await fastdom.mutate(() => {
        this.splitUp.appendChild(fragment);
        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      });
      if(this.onAddedBottom) this.onAddedBottom();
    } else {
      await fastdom.mutate(() => {
        this.paddingBottomDiv.style.height = '0px';
      });
    }
  }
  
  public prepend(...smth: (string | Node)[]) {
    if(this.splitUp) {
      if(this.hiddenElements.up.length) {
        smth.forEach(node => {
          if(typeof(node) !== 'string') {
            this.hiddenElements.up.push({
              element: node as Element, 
              height: (node as Element).scrollHeight || 1
            });
          }
        });
      } else {
        this.splitUp.prepend(...smth);
      }
      
      for(let node of smth) {
        if(typeof(node) !== 'string') {
          this.splitObserver.unobserve(node as Element);
          this.splitObserver.observe(node as Element);
        }
      }
    } else {
      this.container.prepend(...smth);
    }
  }
  
  public append(...smth: (string | Node)[]) {
    if(this.splitUp) {
      if(this.hiddenElements.down.length) {
        smth.forEachReverse(node => {
          if(typeof(node) !== 'string') {
            this.hiddenElements.down.unshift({
              element: node as Element, 
              height: (node as Element).scrollHeight || 1
            });
          }
        });
      } else {
        this.splitUp.append(...smth);
      }
      
      for(let node of smth) {
        if(typeof(node) !== 'string') {
          this.splitObserver.unobserve(node as Element);
          this.splitObserver.observe(node as Element);
        }
      }
    } else {
      this.container.append(...smth);
    }
  }
  
  public insertBefore(newChild: Element, refChild: Element) {
    if(this.splitUp) {
      this.splitObserver.unobserve(newChild);
      this.splitObserver.observe(newChild);
      
      let index = -1;
      index = this.hiddenElements.up.findIndex(c => c.element == refChild);
      
      // возможно здесь нужно очищать предыдущую высоту если newChild уже скрыт (но может и не нужно)
      if(index !== -1) {
        this.hiddenElements.up.splice(index, 0, {element: newChild, height: newChild.scrollHeight || 1});
        return index;
      } else {
        index = this.hiddenElements.down.findIndex(c => c.element == newChild);
        
        if(index !== -1) {
          this.hiddenElements.down.splice(index, 0, {element: newChild, height: newChild.scrollHeight || 1});
          return index;
        }
      }
      
      return this.splitUp.insertBefore(newChild, refChild);
    }
    
    return this.container.insertBefore(newChild, refChild);
  }
  
  set scrollTop(y: number) {
    fastdom.measure(() => {
      let scrollTop = this.container.scrollTop;
      if(scrollTop == y) return scrollTop;
      
      this.container.scrollTop = y;

      if(this.splitUp) {
        let isBottom = y > scrollTop;
        let diff = Math.abs(y - scrollTop);

        if(isBottom) {
          let el = this.splitUp.lastElementChild;
          let rect = el.getBoundingClientRect();
        } else {

        }
      }
    });
  }
  
  get scrollTop() {
    return this.container.scrollTop;
  }
  
  get scrollHeight() {
    return this.container.scrollHeight;
  }
  
  get parentElement() {
    return this.container.parentElement;
  }
  
  get offsetHeight() {
    return this.container.offsetHeight;
  }
}

import { cancelEvent } from "../lib/utils";

import 'fastdom/fastdom.min';
import FastDom from 'fastdom';
//import 'fastdom/src/fastdom-strict'; // exclude in production
import FastDomPromised from 'fastdom/extensions/fastdom-promised';
import { logger, deferredPromise, CancellablePromise } from "../lib/polyfill";

//const fastdom = FastDom.extend(FastDomPromised);
const fastdom = ((window as any).fastdom as typeof FastDom).extend(FastDomPromised);

//(window as any).fastdom.strict(false);

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
  public translate: string;
  public scrollType: string;
  public scrollSide: string;
  public clientAxis: string;
  public clientSize: string;
  
  public scrollSize = -1; // it will be scrollHeight
  public size = 0; // it will be outerHeight of container (not scrollHeight)
  public thumbSize = 0;
  
  public visibleElements: Array<{element: Element, height: number}> = [];
  public hiddenElements: {
    up: Scrollable['visibleElements'],
    down: Scrollable['visibleElements']
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
  public onScrolledTopFired = false;
  public onScrolledBottomFired = false;
  
  public topObserver: IntersectionObserver;
  public bottomObserver: IntersectionObserver;
  
  public splitMeasureTop: Promise<Promise<void>> = null;
  public splitMeasureBottom: Scrollable['splitMeasureTop'] = null;
  public splitMeasureAdd: Promise<void> = null;
  public splitMeasureRemoveBad: Promise<Element> = null;
  public splitMutateTop: Promise<void> = null;
  public splitMutateBottom: Scrollable['splitMutateTop'] = null;
  public splitMutateRemoveBad: Promise<void> = null;
  
  public splitMutateIntersectionTop: Promise<void> = null;
  public splitMutateIntersectionBottom: Promise<void> = null;
  
  public getScrollHeightPromises: Array<{
    element: Element,
    task: Promise<any>
  }> = [];
  
  public onScrollMeasure: number = null;
  
  public lastScrollTop: number = 0;
  public scrollTopOffset: number = 0;
  
  private disableHoverTimeout: number = 0;
  
  private log: ReturnType<typeof logger>;
  private debug = false;
  
  private measureMutex: CancellablePromise<void>;
  private prependLocked = false;
  private appendLocked = false;

  private prependFragment: DocumentFragment = null;
  private appendFragment: DocumentFragment = null;
  private prependFragmentId = 0;
  private appendFragmentId = 0;
  
  constructor(public el: HTMLElement, axis: 'y' | 'x' = 'y', public splitOffset = 300, logPrefix = '', public appendTo = el, public onScrollOffset = splitOffset) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');
    
    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''));
    
    this.measureMutex = deferredPromise<void>();
    this.measureMutex.resolve();
    
    if(axis == 'x') {
      this.container.classList.add('scrollable-x');
      this.type = 'width';
      this.side = 'left';
      this.translate = 'translateX';
      this.scrollType = 'scrollWidth';
      this.scrollSide = 'scrollLeft';
      this.clientAxis = 'clientX';
      this.clientSize = 'clientWidth';
      
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
    } else if(axis == 'y') {
      this.container.classList.add('scrollable-y');
      this.type = 'height';
      this.side = 'top';
      this.translate = 'translateY';
      this.scrollType = 'scrollHeight';
      this.scrollSide = 'scrollTop';
      this.clientAxis = 'clientY';
      this.clientSize = 'clientHeight';
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
    window.addEventListener('resize', () => {
      setTimeout(() => {
        // @ts-ignore
        this.size = this.container[this.clientSize];
        this.onScroll();
        this.resize();
      }, 0);
    });
    
    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');
    
    this.container.addEventListener('scroll', () => this.onScroll(), {passive: true, capture: true});
    
    Array.from(el.children).forEach(c => this.container.append(c));
    
    el.append(this.container);
    
    window.requestAnimationFrame(() => {
      // @ts-ignore
      this.size = this.container[this.clientSize];
      this.resize();
    });
    
    this.container.parentElement.append(this.thumb);
  }
  
  public detachTop(fromIndex: number, needHeight = 0, detachAll = false) {
    //if(this.splitMeasureBottom) fastdom.clear(this.splitMeasureBottom);
    if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
    if(this.prependLocked) return;
    
    //return this.splitMeasureBottom = fastdom.measure(() => {
    return this.splitMutateBottom = fastdom.mutate(() => {
      if(this.prependLocked) return;
      
      let spliceTo = -1;
      
      let needToDetachHeight = needHeight;
      for(; fromIndex >= 0; --fromIndex) {
        let child = this.visibleElements[fromIndex];
        if(needHeight > 0) {
          needHeight -= child.height;
        } else {
          needToDetachHeight -= child.height;
          if(spliceTo === -1) {
            spliceTo = fromIndex;
          }
        }
      }
      if((needToDetachHeight > 0 && !detachAll) || spliceTo === -1) return;
      
      //if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
      //return this.splitMutateBottom = fastdom.mutate(() => {
      let spliced = this.visibleElements.splice(0, spliceTo + 1);
      if(this.debug) {
        this.log('spliced up', spliced);
      }
      
      spliced.forEach((child, idx) => {
        if(!child.element.parentElement) {
          this.log.error('no child in splitUp (up):', child, child.element, 0, spliceTo + 1, idx, spliced);
        }
        
        this.paddings.up += child.height;
        this.splitUp.removeChild(child.element);
      });
      
      this.hiddenElements.up.push(...spliced);
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      //});
    });
  }
  
  public detachBottom(fromIndex: number, needHeight = 0, detachAll = false) {
    //if(this.splitMeasureBottom) fastdom.clear(this.splitMeasureBottom);
    if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
    if(this.appendLocked) return;
    
    //return this.splitMeasureBottom = fastdom.measure(() => {
    return this.splitMutateBottom = fastdom.mutate(() => {
      if(this.appendLocked) return;
      let spliceFrom = -1;
      let spliceTo = 0;
      
      let needToDetachHeight = needHeight;
      let length = this.visibleElements.length;
      for(; fromIndex < length; ++fromIndex) {
        let child = this.visibleElements[fromIndex];
        if(needHeight > 0) {
          needHeight -= child.height;
        } else {
          needToDetachHeight -= child.height;
          if(spliceFrom === -1) spliceFrom = fromIndex;
          spliceTo = fromIndex;
        }
      }
      if((needToDetachHeight > 0 && !detachAll) || spliceFrom === -1) return;
      
      //if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
      //return this.splitMutateBottom = fastdom.mutate(() => {
      let spliced = this.visibleElements.splice(spliceFrom, spliceTo - spliceFrom + 1);
      if(this.debug) {
        this.log('spliced down', spliced, spliceFrom, spliceTo - spliceFrom + 1, length);
      }
      
      spliced.forEach((child, idx) => {
        if(!child.element.parentElement) {
          this.log.error('no child in splitUp (down):', child, child.element, spliceFrom, spliceTo - spliceFrom + 1, idx, spliced);
        }
        
        this.paddings.down += child.height;
        this.splitUp.removeChild(child.element);
      });
      
      this.hiddenElements.down.unshift(...spliced);
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      //});
    });
  }
  
  public resize() {
    //console.time('scroll resize');
    //fastdom.mutate(() => {
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
    //});
    
    //console.timeEnd('scroll resize');
    
    // @ts-ignore
    //console.log('onresize', thumb.style[type], thumbHeight, height);
  }
  
  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    
    this.onScrolledBottomFired = this.onScrolledTopFired = false;
    this.hiddenElements.up.length = this.hiddenElements.down.length = this.visibleElements.length = 0;
    this.paddings.up = this.paddings.down = 0;
    this.lastScrollTop = 0;
    
    this.paddingTopDiv.style.height = '';
    this.paddingBottomDiv.style.height = '';
    
    this.log('setVirtualContainer:', el, this);
    
    this.getScrollTopOffset();
    
    if(el) {
      fastdom.mutate(() => {
        el.parentElement.insertBefore(this.paddingTopDiv, el);
        el.parentNode.insertBefore(this.paddingBottomDiv, el.nextSibling);
      });
    } else {
      this.paddingTopDiv.remove();
      this.paddingBottomDiv.remove();
    }
  }
  
  get state() {
    return {
      hiddenElements: {
        up: this.hiddenElements.up.slice(),
        down: this.hiddenElements.down.slice(),
      },
      paddings: {
        up: this.paddings.up,
        down: this.paddings.down
      },
      visibleElements: this.visibleElements.slice(),
      scrollSize: this.scrollSize
    };
  }
  
  set state(state: {
    visibleElements: Scrollable['visibleElements'],
    hiddenElements: Scrollable['hiddenElements'],
    paddings: Scrollable['paddings'],
    scrollSize: Scrollable['scrollSize']
  }) {
    this.visibleElements = state.visibleElements;
    this.hiddenElements = state.hiddenElements;
    this.paddings = state.paddings;
    this.scrollSize = state.scrollSize;
    
    fastdom.mutate(() => {
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      
      this.onScroll();
    });
  }
  
  public getScrollTopOffset() {
    if(this.splitUp && this.splitUp.parentElement && this.splitUp.parentElement != this.container) { // need to find offset
      fastdom.measure(() => {
        let rect = this.splitUp.getBoundingClientRect();
        let containerRect = this.container.getBoundingClientRect();
        
        this.scrollTopOffset = rect.top - containerRect.top;
        this.log('set scrollTopOffset to:', this.scrollTopOffset);
      });
    } else {
      this.scrollTopOffset = 0;
    }
  }
  
  public onScroll() {
    //return;
    if(this.debug) {
      this.log('onScroll call', this.onScrollMeasure);
    }
    
    let appendTo = this.splitUp || this.appendTo;
    
    clearTimeout(this.disableHoverTimeout);
    if(this.el != this.appendTo) {
      if(!appendTo.classList.contains('disable-hover')) {
        appendTo.classList.add('disable-hover');
      }
    }
    
    this.disableHoverTimeout = setTimeout(() => {
      appendTo.classList.remove('disable-hover');
      
      if(!this.measureMutex.isFulfilled) {
        this.measureMutex.resolve();
      }
    }, 100);
    
    if(this.onScrollMeasure) return; //window.cancelAnimationFrame(this.onScrollMeasure);
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      // @ts-ignore
      let scrollPos = this.container[this.scrollSide];
      
      if(this.measureMutex.isFulfilled) {
        // @ts-ignore quick brown fix
        this.size = this.container[this.clientSize];
        
        // @ts-ignore
        let scrollSize = this.container[this.scrollType];
        if(scrollSize != this.scrollSize || this.thumbSize == 0) {
          this.scrollSize = scrollSize;
          this.resize();
        } else this.scrollSize = scrollSize;
        
        this.measureMutex = deferredPromise<void>();
      }
      
      // let value = scrollPos / (this.scrollSize - this.size) * 100;
      // let maxValue = 100 - (this.thumbSize / this.size * 100);
      let value = scrollPos / (this.scrollSize - this.size) * this.size;
      let maxValue = this.size - this.thumbSize;
      
      //this.log(scrollPos, this.scrollSize, this.size, value, scrollPos / (this.scrollSize - this.size) * this.size);
      
      let scrollTop = scrollPos - this.scrollTopOffset;
      let maxScrollTop = this.scrollSize - this.scrollTopOffset - this.size;
      
      // @ts-ignore
      this.thumb.style.transform = this.translate + '(' + (value >= maxValue ? maxValue : value) + 'px)';
      
      if(this.onScrolledBottom) {
        if(!this.hiddenElements.down.length && (maxScrollTop - scrollTop) <= this.onScrollOffset) {
          //if(!this.onScrolledBottomFired) {
          this.onScrolledBottomFired = true;
          this.onScrolledBottom();
          //}
        } else {
          this.onScrolledBottomFired = false;
        }
      }
      
      if(this.onScrolledTop) {
        //this.log('onScrolledTop:', scrollTop, this.onScrollOffset);
        if(!this.hiddenElements.up.length && scrollTop <= this.onScrollOffset) {
          if(/* !this.onScrolledTopFired */!this.prependLocked) {
            this.onScrolledTopFired = true;
            this.onScrolledTop();
          }
        } else {
          this.onScrolledTopFired = false;
        }
      }
      
      if(!this.splitUp) {
        this.onScrollMeasure = 0;
        return;
      }
      
      let perf = performance.now();
      
      if(scrollTop < 0) scrollTop = 0;
      else if(scrollTop > maxScrollTop) scrollTop = maxScrollTop;
      
      let toBottom = scrollTop > this.lastScrollTop;
      
      let visibleFrom = scrollTop - this.paddings.up;
      let visibleUntil = visibleFrom + this.size;
      let sum = 0;
      
      let firstVisibleElementIndex = -1;
      let lastVisibleElementIndex = -1;
      
      let needHeight = this.splitOffset;
      let length = this.visibleElements.length;
      this.visibleElements.forEach((child, idx) => {
        if(sum < visibleUntil && (sum + child.height) >= visibleFrom && firstVisibleElementIndex === -1) { // if any part is in viewport
          firstVisibleElementIndex = idx;
        }
        
        if(sum < visibleUntil && firstVisibleElementIndex !== -1) {
          lastVisibleElementIndex = idx;
        }
        
        sum += child.height;
        
        //this.log(sum, element);
      });
      
      if(lastVisibleElementIndex === -1 && firstVisibleElementIndex !== -1) {
        lastVisibleElementIndex = firstVisibleElementIndex;
      }
      
      // возможно устанавливать прошлый скролл нужно уже после этого промиса, т.к. он может очиститься
      if(scrollTop == this.lastScrollTop) {
        if(this.debug) {
          this.log('onScroll ==', (performance.now() - perf).toFixed(3), length, scrollTop, maxScrollTop, toBottom, firstVisibleElementIndex, lastVisibleElementIndex, visibleFrom, visibleUntil, this.scrollTopOffset, this.scrollSize);
        }
        
        this.lastScrollTop = scrollTop;
        if(firstVisibleElementIndex !== -1) this.detachTop(firstVisibleElementIndex, needHeight);
        if(lastVisibleElementIndex !== -1) this.detachBottom(lastVisibleElementIndex, needHeight);
        this.onScrollMeasure = 0;
        return;
      }
      
      /* {
        this.log('onScroll', (performance.now() - perf).toFixed(3), length, scrollTop, 
        toBottom, firstVisibleElement, lastVisibleElement, visibleFrom, visibleUntil);
        return {value, maxValue};
      } */
      
      if(toBottom) { // scrolling bottom
        if(firstVisibleElementIndex !== -1) {
          if(this.debug) {
            this.log('will detach top by:', firstVisibleElementIndex, needHeight);
          }
          
          this.detachTop(firstVisibleElementIndex, needHeight);
          
          for(let i = lastVisibleElementIndex + 1; i < length; ++i) {
            needHeight -= this.visibleElements[i].height;
          }
          
          if(needHeight >= this.splitOffset) {
            //this.detachTop(firstVisibleElementIndex, this.splitOffset);
            this.onBottomIntersection(needHeight);
          }
        } else if(length) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('will detach all of top', length, this.splitUp.childElementCount, maxScrollTop, this.paddings, this.lastScrollTop);
          }
          
          this.detachTop(this.visibleElements.length - 1, 0, true).then(() => { // now need to move from one hidden array to another one
            this.onManualScrollBottom(scrollTop, needHeight);
          });
        } else if(this.paddings.down) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('seems manually scrolled bottom', this.paddings.up, this.lastScrollTop);
          }
          
          this.onManualScrollBottom(scrollTop, needHeight);
        }
      } else { // scrolling top
        if(lastVisibleElementIndex !== -1) {
          if(this.debug) {
            this.log('will detach bottom by:', lastVisibleElementIndex, needHeight);
          }
          
          //if((lastVisibleElementIndex + 1) < length) {
          this.detachBottom(lastVisibleElementIndex, needHeight);
          //}
          
          for(let i = firstVisibleElementIndex - 1; i >= 0; --i) {
            needHeight -= this.visibleElements[i].height;
          }
          
          if(needHeight >= this.splitOffset) {
            //this.detachBottom(lastVisibleElementIndex, this.splitOffset);
            this.onTopIntersection(needHeight);
          }
        } else if(length) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('will detach all of bottom', length, this.splitUp.childElementCount, maxScrollTop, this.paddings, this.lastScrollTop);
          }
          
          this.detachBottom(0, 0, true).then(() => { // now need to move from one hidden array to another one
            this.onManualScrollTop(scrollTop, needHeight, maxScrollTop);
          });
        } else if(this.paddings.up) {
          if(this.debug) {
            this.log.warn('seems manually scrolled top', this.paddings.down, this.lastScrollTop);
          }
          
          this.onManualScrollTop(scrollTop, needHeight, maxScrollTop);
        }
      }
      
      if(this.debug) {
        this.log('onScroll', (performance.now() - perf).toFixed(3), length, scrollTop, maxScrollTop, toBottom, firstVisibleElementIndex, lastVisibleElementIndex, visibleFrom, visibleUntil, this.scrollTopOffset);
      }
      
      this.lastScrollTop = scrollTop;
      this.onScrollMeasure = 0;
    });
  }
  
  public onManualScrollTop(scrollTop: number, needHeight: number, maxScrollTop: number) {
    //if(this.splitMutateRemoveBad) fastdom.clear(this.splitMutateRemoveBad);
    this.splitMutateRemoveBad = fastdom.mutate(() => {
      let h = maxScrollTop - (scrollTop + this.size);
      
      while(this.paddings.down < h && this.paddings.up) {
        let child = this.hiddenElements.up.pop();
        this.hiddenElements.down.unshift(child);
        this.paddings.down += child.height;
        this.paddings.up -= child.height;
      }
      
      if(this.debug) {
        this.log.warn('manual scroll top', this, length, this.splitUp.childElementCount, scrollTop, this.paddings.up, h);
      }
      
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';

      if(!this.paddings.up) this.onBottomIntersection((this.size * 2) + (needHeight * 2));
      else this.onTopIntersection((this.size * 2) + (needHeight * 2));
    });
  }
  
  public onManualScrollBottom(scrollTop: number, needHeight: number) {
    //if(this.splitMutateRemoveBad) fastdom.clear(this.splitMutateRemoveBad);
    this.splitMutateRemoveBad = fastdom.mutate(() => {
      let h = scrollTop - needHeight;
      
      while(this.paddings.up < h && this.paddings.down) {
        let child = this.hiddenElements.down.shift();
        this.hiddenElements.up.push(child);
        this.paddings.up += child.height;
        this.paddings.down -= child.height;
      }
      
      if(this.debug) {
        this.log.warn('manual scroll bottom', this, length, this.splitUp.childElementCount, scrollTop, this.paddings.down, h);
      }
      
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      
      if(!this.paddings.down) this.onTopIntersection(this.size + (needHeight * 2));
      else this.onBottomIntersection(this.size + (needHeight * 2));
    });
  }
  
  public onTopIntersection(needHeight: number) {
    if(this.debug) {
      this.log('onTopIntersection', needHeight, this);
    }
    
    if(this.splitMutateIntersectionBottom) fastdom.clear(this.splitMutateIntersectionBottom);
    this.splitMutateIntersectionBottom = fastdom.mutate(() => {
      if(this.hiddenElements.up.length && this.paddings.up) {
        let fragment = document.createDocumentFragment();
        while(needHeight > 0 && this.paddings.up) {
          let child = this.hiddenElements.up.pop();
          
          // console.log('top returning from hidden', child);
          
          if(!child) {
            this.paddings.up = 0;
            break;
          }
          
          this.visibleElements.unshift(child);
          fragment.prepend(child.element);
          
          needHeight -= child.height;
          this.paddings.up -= child.height;
        }
        
        this.splitUp.prepend(fragment);
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      } else {
        this.paddingTopDiv.style.height = '0px';
      }
    });
  }
  
  public onBottomIntersection(needHeight: number) {
    if(this.debug) {
      this.log('onBottomIntersection', needHeight, this);
    }
    
    if(this.splitMutateIntersectionBottom) fastdom.clear(this.splitMutateIntersectionBottom);
    this.splitMutateIntersectionBottom = fastdom.mutate(() => {
      if(this.hiddenElements.down.length && this.paddings.down) {
        let fragment = document.createDocumentFragment();
        while(needHeight > 0 && this.paddings.down) {
          let child = this.hiddenElements.down.shift();
          
          if(!child) {
            this.paddings.down = 0;
            break;
          }
          
          this.visibleElements.push(child);
          fragment.appendChild(child.element);
          
          needHeight -= child.height;
          this.paddings.down -= child.height;
        }
        
        this.splitUp.appendChild(fragment);
        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
        
        /* if(this.debug) {
          this.log('onBottomIntersection append:', fragment, needHeight);
        } */
        
        if(this.onAddedBottom) this.onAddedBottom();
      } else {
        this.paddingBottomDiv.style.height = '0px';
      }
    });
  }
  
  public prepend(element: HTMLElement) {
    if(this.splitUp) {
      this.removeElement(element);
      
      if(this.hiddenElements.up.length && !this.prependLocked) {
        this.splitUp.prepend(element);
        
        let height = element.scrollHeight;
        this.log('will append element to up hidden', element, height);
        this.paddings.up += height;
        this.hiddenElements.up.unshift({
          element: element, 
          height: height
        });
        element.parentElement.removeChild(element);
        
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
        this.onScroll();
      } else {
        this.splitUp.prepend(element);
        let el = {element, height: 0};
        this.visibleElements.unshift(el);
        
        fastdom.measure(() => {
          if(!element.parentElement) return;
          let height = element.scrollHeight;
          el.height = height;
          this.scrollSize += height;
        });
        this.onScroll();
      }
    } else {
      this.appendTo.prepend(element);
      this.visibleElements.unshift({element, height: 0});
      //this.onScroll();
    }
    
    //this.onScroll();
  }
  
  public append(element: HTMLElement) {
    if(this.splitUp) {
      this.removeElement(element);
      
      if(this.hiddenElements.down.length && !this.appendLocked) {
        fastdom.mutate(() => {
          this.splitUp.append(element);
        }).then(() => {
          return fastdom.measure(() => {
            let height = element.scrollHeight;
            this.log('will append element to down hidden', element, height);
            this.paddings.down += height;
            this.hiddenElements.down.push({
              element: element, 
              height: height
            });
          });
        }).then(() => {
          fastdom.mutate(() => {
            if(element.parentElement) {
              element.parentElement.removeChild(element);
            }
            
            this.paddingBottomDiv.style.height = this.paddings.down + 'px';
            
            this.onScroll();
          });
        });
      } else {
        this.splitUp.append(element);
        let el = {element, height: 0};
        this.visibleElements.push(el);
        
        fastdom.measure(() => {
          if(!element.parentElement) return;
          let height = element.scrollHeight;
          el.height = height;
          this.scrollSize += height;
        });
        this.onScroll();
      }
    } else {
      this.appendTo.append(element);
      this.visibleElements.push({element, height: 0});
      //this.onScroll();
    }
    
    //this.onScroll();
  }

  public prependByBatch(element: HTMLElement) {
    let perf = performance.now();
    let fragment = this.prependFragment ?? (this.prependFragment = document.createDocumentFragment());
    fragment.prepend(element);

    if(this.prependFragmentId) window.cancelAnimationFrame(this.prependFragmentId);
    this.prependFragmentId = window.requestAnimationFrame(() => {
      this.prependFragment = null;
      this.prependFragmentId = 0;

      for(let length = fragment.childElementCount, i = length - 1; i >= 0; --i) {
        let element = fragment.children[i];
        this.visibleElements.unshift({element, height: 0});
      }

      this.log('prependByBatch perf:', performance.now() - perf, fragment.childElementCount);
      this.appendTo.prepend(fragment);
      //this.onScroll();
    });
  }

  public appendByBatch(element: HTMLElement) {
    let fragment = this.appendFragment ?? (this.appendFragment = document.createDocumentFragment());
    fragment.append(element);

    if(this.appendFragmentId) window.cancelAnimationFrame(this.appendFragmentId);
    this.appendFragmentId = window.requestAnimationFrame(() => {
      this.appendFragment = null;
      this.appendFragmentId = 0;

      for(let i = 0, length = fragment.childElementCount; i < length; ++i) {
        let element = fragment.children[i];
        this.visibleElements.push({element, height: 0});
      }

      this.appendTo.append(fragment);
      //this.onScroll();
    });
  }
  
  public contains(element: Element) {
    if(!this.splitUp) {
      return this.appendTo.contains(element);
    }
    
    return !!element.parentElement || !!this.hiddenElements.up.find(c => c.element == element) || !!this.hiddenElements.down.find(c => c.element == element);
  }
  
  public removeElement(element: Element) {
    if(!this.splitUp) {
      if(this.container.contains(element)) {
        //fastdom.mutate(() => this.container.removeChild(element));
        this.container.removeChild(element);
      }
      
      return;
    } else {
      if(this.splitUp.contains(element)) {
        //fastdom.mutate(() => this.splitUp.removeChild(element));
        this.splitUp.removeChild(element);
        return;
      }
    }
    
    let child = this.hiddenElements.up.findAndSplice(c => c.element == element);
    let foundUp = false;
    if(child) {
      this.paddings.up -= child.height;
      foundUp = true;
    } else {
      child = this.hiddenElements.down.findAndSplice(c => c.element == element);
      if(child) {
        this.paddings.down -= child.height;
      }
    }
    
    if(!child) return;
    
    //fastdom.mutate(() => { 
    if(foundUp) {
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
    } else {
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
    }
    //});
    
    return child;
  }
  
  public insertBefore(newChild: Element, refChild: Element, height?: number) {
    this.log('insertBefore', newChild, newChild.textContent, refChild);
    //return;
    if(!this.splitUp) {
      let ret = this.appendTo.insertBefore(newChild, refChild);
      this.onScroll();
      return ret;
    }
    
    if(this.splitUp) {
      let index = -1;
      index = this.hiddenElements.up.findIndex(c => c.element == refChild);
      
      let child = this.removeElement(newChild);
      if(child) {
        height = child.height;
      } else if(height === undefined) {
        let p = this.getScrollHeightPromises.find(p => p.element == newChild);
        if(!p) p = {element: newChild, task: null};
        else fastdom.clear(p.task);
        
        let promise: any;
        
        return p.task = promise = fastdom.mutate(() => {
          this.splitUp.append(newChild);
          
          return fastdom.measure(() => {
            if(p.task != promise) return;
            
            let height = newChild.scrollHeight;
            
            return fastdom.mutate(() => {
              if(p.task != promise || !newChild.parentElement) return;
              
              this.splitUp.removeChild(newChild);
              
              this.insertBefore(newChild, refChild, height);
              
              this.getScrollHeightPromises = this.getScrollHeightPromises.filter(p => p.element != newChild);
              
              return height;
            });
          });
        });
      }
      
      if(index !== -1) {
        this.hiddenElements.up.splice(index, 0, {element: newChild, height: height});
        this.paddings.up += height;
        fastdom.mutate(() => {
          this.paddingTopDiv.style.height = this.paddings.up + 'px';
          this.onScroll();
        });
        return index;
      } else {
        index = this.hiddenElements.down.findIndex(c => c.element == refChild);
        
        if(index !== -1) {
          this.hiddenElements.down.splice(index, 0, {element: newChild, height: height});
          this.paddings.down += height;
          fastdom.mutate(() => {
            this.paddingBottomDiv.style.height = this.paddings.down + 'px';
            this.onScroll();
          });
          return index;
        }
      }
      
      fastdom.mutate(() => {
        this.log('inserting', newChild, 'before', refChild, this.splitUp.contains(refChild));
        if(!this.splitUp.contains(refChild)) {
          this.log.error('no refChild in splitUp', refChild, newChild, this.hiddenElements);
          return;
        }
        
        this.splitUp.insertBefore(newChild, refChild);
        this.onScroll();
      });
      return;
    }
  }
  
  public scrollIntoView(element: Element) {
    if(element.parentElement) {
      element.scrollIntoView();
    } else if(this.splitUp) {
      let index = this.hiddenElements.up.findIndex(e => e.element == element);
      let y = 0;
      if(index !== -1) {
        for(let i = 0; i < index; ++i) {
          y += this.hiddenElements.up[i].height;
        }
        
        this.scrollTop = y;
      } else if((index = this.hiddenElements.down.findIndex(e => e.element == element)) !== -1) {
        y += this.paddings.up + this.size;
        for(let i = 0; i < index; ++i) {
          y += this.hiddenElements.down[i].height;
        }
        
        this.scrollTop = y;
      }
    }
  }
  
  public lock(side: 'top' | 'down' | 'both' = 'down') {
    if(side == 'top') this.prependLocked = true;
    else if(side == 'down') this.appendLocked = true;
    else this.prependLocked = this.appendLocked = true;
  }
  
  public unlock(side: 'top' | 'down' | 'both' = 'down') {
    if(side == 'top') this.prependLocked = false;
    else if(side == 'down') this.appendLocked = false;
    else this.prependLocked = this.appendLocked = false;
  }
  
  set scrollTop(y: number) {
    //fastdom.mutate(() => {
      this.container.scrollTop = y;
    //});
  }
  
  get scrollTop() {
    return this.container.scrollTop;
  }
  
  get scrollHeight() {
    return this.container.scrollHeight;
  }

  get innerHeight() {
    return this.size;
  }
  
  get parentElement() {
    return this.container.parentElement;
  }
  
  get offsetHeight() {
    return this.container.offsetHeight;
  }
  
  get length() {
    return this.hiddenElements.up.length + this.visibleElements.length + this.hiddenElements.down.length;
  }
}

import { cancelEvent } from "../lib/utils";

//import {measure} from 'fastdom/fastdom.min';
import FastDom from 'fastdom';
import 'fastdom/src/fastdom-strict'; // exclude in production
import FastDomPromised from 'fastdom/extensions/fastdom-promised';
import { logger } from "../lib/polyfill";

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
  public translate: string;
  public scrollType: string;
  public scrollSide: string;
  public clientAxis: string;
  
  public scrollSize = -1; // it will be scrollHeight
  public size = 0; // it will be outerHeight of container (not scrollHeight)
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
  public onScrolledTopFired = false;
  public onScrolledBottomFired = false;
  
  public topObserver: IntersectionObserver;
  public bottomObserver: IntersectionObserver;
  
  public splitMeasureTop: Promise<{element: Element, height: number}[]> = null;
  public splitMeasureBottom: Scrollable['splitMeasureTop'] = null;
  public splitMeasureAdd: Promise<number> = null;
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
  
  public onScrollMeasure: Promise<any> = null;
  
  public lastScrollTop: number = 0;
  public scrollTopOffset: number = 0;
  
  private log: ReturnType<typeof logger>;
  private debug = true;
  
  constructor(public el: HTMLDivElement, x = false, y = true, public splitOffset = 300, logPrefix = '', public appendTo = el, public onScrollOffset = splitOffset) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');
    
    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''));
    
    if(x) {
      this.container.classList.add('scrollable-x');
      this.type = 'width';
      this.side = 'left';
      this.translate = 'translateX';
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
      this.translate = 'translateY';
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
    window.addEventListener('resize', () => {
      //this.resize.bind(this);
      this.onScroll();
      this.resize();
    });
    
    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');

    this.container.addEventListener('scroll', this.onScroll.bind(this));
    
    Array.from(el.children).forEach(c => this.container.append(c));
    
    el.append(this.container);
    this.container.parentElement.append(this.thumb);
    this.resize();
  }
  
  public detachTop(child: Element, needHeight = 0) {
    if(this.splitMeasureBottom) fastdom.clear(this.splitMeasureBottom);
    if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
    
    this.splitMeasureBottom = fastdom.measure(() => {
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
    
    return this.splitMeasureBottom.then(sliced => {
      if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
      
      return this.splitMutateBottom = fastdom.mutate(() => {
        sliced.forEachReverse((child) => {
          let {element, height} = child;
          if(!this.splitUp.contains(element)) return;
          
          this.paddings.up += height;
          this.hiddenElements.up.push(child);
          this.splitUp.removeChild(element);
          //element.parentElement.removeChild(element);
        });
        
        if(this.debug) {
          this.log('sliced up', sliced);
        }
        
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      });
    });
  }
  
  public detachBottom(child: Element, needHeight = 0) {
    if(this.splitMeasureBottom) fastdom.clear(this.splitMeasureBottom);
    if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
    
    this.splitMeasureBottom = fastdom.measure(() => {
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
    
    return this.splitMeasureBottom.then(sliced => {
      if(this.splitMutateBottom) fastdom.clear(this.splitMutateBottom);
      
      return this.splitMutateBottom = fastdom.mutate(() => {
        sliced.forEachReverse((child) => {
          let {element, height} = child;
          if(!this.splitUp.contains(element)) return;
          
          this.paddings.down += height;
          this.hiddenElements.down.unshift(child);
          this.splitUp.removeChild(element);
          //element.parentElement.removeChild(element);
        });
        
        if(this.debug) {
          this.log('sliced down', sliced);
        }
        
        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      });
    });
  }
  
  public resize() {
    //console.time('scroll resize');
    fastdom.mutate(() => {
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
  
  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    
    this.hiddenElements.up.length = this.hiddenElements.down.length = 0;
    this.paddings.up = this.paddings.down = 0;
    this.lastScrollTop = 0;
    
    if(this.paddingTopDiv.parentElement) {
      fastdom.mutate(() => {
        this.paddingTopDiv.style.height = '';
        this.paddingBottomDiv.style.height = '';
      });
    }
    
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
    this.log('onScroll call');

    if(this.onScrollMeasure) fastdom.clear(this.onScrollMeasure);
    this.onScrollMeasure = fastdom.measure(() => {
      // @ts-ignore quick brown fix
      this.size = this.parentElement[this.scrollType];
      
      // @ts-ignore
      let scrollSize = this.container[this.scrollType];
      if(scrollSize != this.scrollSize || this.thumbSize == 0) {
        this.resize();
      }
      this.scrollSize = scrollSize;

      // @ts-ignore
      let scrollPos = this.container[this.scrollSide];
      
      // let value = scrollPos / (this.scrollSize - this.size) * 100;
      // let maxValue = 100 - (this.thumbSize / this.size * 100);
      let value = scrollPos / (this.scrollSize - this.size) * this.size;
      let maxValue = this.size - this.thumbSize;
      
      //this.log(scrollPos, this.scrollSize, this.size, value, scrollPos / (this.scrollSize - this.size) * this.size);
      let ret = {value, maxValue};

      let scrollTop = scrollPos - this.scrollTopOffset;
      let maxScrollTop = this.scrollSize - this.scrollTopOffset - this.size;

      if(this.onScrolledBottom) {
        if(!this.hiddenElements.down.length && (maxScrollTop - scrollTop) <= this.onScrollOffset) {
          if(!this.onScrolledBottomFired) {
            this.onScrolledBottomFired = true;
            this.onScrolledBottom();
          }
        } else {
          this.onScrolledBottomFired = false;
        }
      }

      if(this.onScrolledTop) {
        //this.log('onScrolledTop:', scrollTop, this.onScrollOffset);
        if(!this.hiddenElements.up.length && scrollTop <= this.onScrollOffset) {
          if(!this.onScrolledTopFired) {
            this.onScrolledTopFired = true;
            this.onScrolledTop();
          }
        } else {
          this.onScrolledTopFired = false;
        }
      }
      
      if(!this.splitUp) {
        return ret;
      }
      
      let perf = performance.now();
      
      if(scrollTop < 0) scrollTop = 0;
      else if(scrollTop > maxScrollTop) scrollTop = maxScrollTop;
      
      let toBottom = scrollTop > this.lastScrollTop;
      
      let visibleFrom = /* scrollTop < this.paddings.up ? scrollTop :  */scrollTop - this.paddings.up;
      let visibleUntil = visibleFrom + this.size;
      let sum = 0;
      
      let firstVisibleElement: Element;
      let lastVisibleElement: Element;
      
      let needHeight = this.splitOffset;
      
      let children = this.splitUp.children;
      let length = children.length;
      for(let i = 0; i < length; ++i) {
        let element = children[i];
        
        let height = element.scrollHeight;
        if(sum < visibleUntil && (sum + height) >= visibleFrom && !firstVisibleElement) { // if any part is in viewport
          firstVisibleElement = element;
        }
        
        if(sum < visibleUntil && firstVisibleElement) {
          lastVisibleElement = element;
        }
        
        sum += element.scrollHeight;
        
        //this.log(sum, element);
      }
      
      if(!lastVisibleElement && firstVisibleElement) {
        lastVisibleElement = firstVisibleElement;
      }
      
      // возможно устанавливать прошлый скролл нужно уже после этого промиса, т.к. он может очиститься
      if(scrollTop == this.lastScrollTop) {
        this.lastScrollTop = scrollTop;
        if(firstVisibleElement) this.detachTop(firstVisibleElement, needHeight);
        if(lastVisibleElement) this.detachBottom(lastVisibleElement, needHeight);
        return ret;
      }
      
      /* {
        this.log('onScroll', (performance.now() - perf).toFixed(3), length, scrollTop, 
        toBottom, firstVisibleElement, lastVisibleElement, visibleFrom, visibleUntil);
        return {value, maxValue};
      } */
      
      if(toBottom) { // scrolling bottom
        if(firstVisibleElement) {
          if(this.debug) {
            this.log('will detach top by:', firstVisibleElement, needHeight);
          }
          
          this.detachTop(firstVisibleElement, needHeight);
          
          if(this.splitMeasureAdd) fastdom.clear(this.splitMeasureAdd);
          
          let child = lastVisibleElement;
          this.splitMeasureAdd = fastdom.measure(() => {
            while(child = child.nextElementSibling) {
              needHeight -= child.scrollHeight;
            }
            
            this.onBottomIntersection(needHeight);
            return needHeight;
          });
        } else if(length) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('will detach all of top', length, this.splitUp.childElementCount, maxScrollTop, this.paddings,  this.lastScrollTop);
          }
          
          this.detachTop(children[length - 1], 0).then(() => { // now need to move from one hidden array to another one
            this.onManualScrollBottom(scrollTop, needHeight);
          });
        } else if(this.paddings.down) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('seems manually scrolled bottom', this.paddings.up, this.lastScrollTop);
          }

          this.onManualScrollBottom(scrollTop, needHeight);
        }
      } else { // scrolling top
        if(lastVisibleElement) {
          if(this.debug) {
            this.log('will detach bottom by:', lastVisibleElement, needHeight);
          }
          
          this.detachBottom(lastVisibleElement, needHeight);
          
          let child = firstVisibleElement;
          if(this.splitMeasureAdd) fastdom.clear(this.splitMeasureAdd);
          this.splitMeasureAdd = fastdom.measure(() => {
            while(child = child.previousElementSibling) {
              needHeight -= child.scrollHeight;
            }
            
            this.onTopIntersection(needHeight);
            return needHeight;
          });
        } else if(length) { // scrolled manually or safari
          if(this.debug) {
            this.log.warn('will detach all of bottom', length, this.splitUp.childElementCount, maxScrollTop, this.paddings, this.lastScrollTop);
          }
          
          this.detachBottom(children[0], 0).then(() => { // now need to move from one hidden array to another one
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
        this.log('onScroll', (performance.now() - perf).toFixed(3), length, scrollTop, maxScrollTop, toBottom, firstVisibleElement, lastVisibleElement, visibleFrom, visibleUntil, this.scrollTopOffset);
      }
      
      this.lastScrollTop = scrollTop;
      
      return {value, maxValue};
    });
    
    this.onScrollMeasure.then(({value, maxValue}) => {
      //fastdom.mutate(() => {
        // @ts-ignore
        //this.thumb.style[this.side] = (value >= maxValue ? maxValue : value) + '%';
        this.thumb.style.transform = this.translate + '(' + (value >= maxValue ? maxValue : value) + 'px)';
      //});
    });
    
    //console.timeEnd('scroll onScroll');
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
        this.log.warn('bait it off now', this, length, this.splitUp.childElementCount, scrollTop, this.paddings.up, h);
      }
      
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      this.onTopIntersection((this.size * 2) + (needHeight * 2));
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
        this.log.warn('shake it off now', this, length, this.splitUp.childElementCount);
      }
      
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      this.onBottomIntersection(this.size + (needHeight * 2));
    });
  }
  
  public onTopIntersection(needHeight: number) {
    if(this.debug) {
      this.log('onTopIntersection', needHeight, this);
    }
    
    if(this.splitMutateIntersectionTop) fastdom.clear(this.splitMutateIntersectionTop);
    this.splitMutateIntersectionTop = fastdom.mutate(() => {
      if(this.hiddenElements.up.length && this.paddings.up) {
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
  
  public prepend(...smth: Element[]) {
    if(this.splitUp) {
      smth.forEach(node => {
        this.removeElement(node);
      });
      
      if(this.hiddenElements.up.length) {
        /* fastdom.mutate(() => {
          this.splitUp.append(...smth);
        }).then(() => {
          return fastdom.measure(() => {
            smth.forEachReverse(node => {
              let height = node.scrollHeight;
              this.log('will append element to up hidden', node, height);
              this.paddings.up += height;
              this.hiddenElements.up.unshift({
                element: node, 
                height: height
              });
            });
          });
        }).then(() => {
          fastdom.mutate(() => {
            smth.forEachReverse(node => {
              if(node.parentElement) {
                node.parentElement.removeChild(node);
              }
            });
            
            this.paddingTopDiv.style.height = this.paddings.up + 'px';
            
            this.onScroll();
          });
        }); */
        this.splitUp.prepend(...smth);
        smth.forEachReverse(node => {
          let height = node.scrollHeight;
          this.log('will append element to up hidden', node, height);
          this.paddings.up += height;
          this.hiddenElements.up.unshift({
            element: node, 
            height: height
          });
          node.parentElement.removeChild(node);
        });
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
        this.onScroll();
      } else {
        this.splitUp.prepend(...smth);
        this.onScroll();
      }
    } else {
      this.appendTo.prepend(...smth);
      this.onScroll();
    }
    
    //this.onScroll();
  }
  
  public append(...smth: Element[]) {
    if(this.splitUp) {
      smth.forEach(node => {
        this.removeElement(node);
      });
      
      if(this.hiddenElements.down.length) {
        fastdom.mutate(() => {
          this.splitUp.append(...smth);
        }).then(() => {
          return fastdom.measure(() => {
            smth.forEach(node => {
              let height = node.scrollHeight;
              this.log('will append element to down hidden', node, height);
              this.paddings.down += height;
              this.hiddenElements.down.push({
                element: node, 
                height: height
              });
            });
          });
        }).then(() => {
          fastdom.mutate(() => {
            smth.forEach(node => {
              if(node.parentElement) {
                node.parentElement.removeChild(node);
              }
            });
            
            this.paddingBottomDiv.style.height = this.paddings.down + 'px';
            
            this.onScroll();
          });
        });
      } else {
        this.splitUp.append(...smth);
        this.onScroll();
      }
    } else {
      this.appendTo.append(...smth);
      this.onScroll();
    }
    
    //this.onScroll();
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
    //this.log('insertBefore', newChild, refChild);
    return;
    
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
    
    let ret = this.container.insertBefore(newChild, refChild);
    this.onScroll();
    return ret;
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
  
  set scrollTop(y: number) {
    fastdom.mutate(() => {
      this.container.scrollTop = y;
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

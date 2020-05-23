import { logger } from "../lib/polyfill";
import smoothscroll from '../lib/smoothscroll';
(window as any).__forceSmoothScrollPolyfill__ = true;
smoothscroll.polyfill();
/*
var el = $0;
var height = 0;
var checkUp = false;

do {
  height += el.scrollHeight;
} while(el = (checkUp ? el.previousElementSibling : el.nextElementSibling));
console.log(height);
*/

/*
Array.from($0.querySelectorAll('.bubble__container')).forEach(_el => {
	//_el.style.display = '';	
	//return;

	let el = _el.parentElement;
	let height = el.scrollHeight;
	let width = el.scrollWidth;
	el.style.width = width + 'px';
	el.style.height = height + 'px';
	_el.style.display = 'none';
});
*/

export default class Scrollable {
  public container: HTMLDivElement;

  public splitUp: HTMLElement;
  
  public onScrolledTop: () => void = null;
  public onScrolledBottom: () => void = null;

  public onScrollMeasure: number = null;
  
  public lastScrollTop: number = 0;
  
  private disableHoverTimeout: number = 0;
  
  private log: ReturnType<typeof logger>;
  private debug = false;

  private sentinelsObserver: IntersectionObserver;
  private topSentinel: HTMLDivElement;
  private bottomSentinel: HTMLDivElement;

  private observer: IntersectionObserver;
  private visible: Set<HTMLElement>;
  private virtualTempIDTop = 0;
  private virtualTempIDBottom = 0;
  private lastTopID = 0;
  private lastBottomID = 0;
  private lastScrollDirection = 0; // true = bottom

  private onScrolledTopFired = false;
  private onScrolledBottomFired = false;

  public scrollLocked = 0;

  private setVisible(element: HTMLElement) {
    if(this.visible.has(element)) return;

    this.debug && this.log('setVisible id:', element.dataset.virtual);
    (element.firstElementChild as HTMLElement).style.display = '';
    this.visible.add(element);
  }

  private setHidden(element: HTMLElement) {
    if(!this.visible.has(element)) return;

    this.debug && this.log('setHidden id:', element.dataset.virtual);
    (element.firstElementChild as HTMLElement).style.display = 'none';
    this.visible.delete(element);
  }
  
  constructor(public el: HTMLElement, axis: 'y' | 'x' = 'y', logPrefix = '', public appendTo = el, public onScrollOffset = 300, public splitCount = 15) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');

    this.visible = new Set();
    this.observer = new IntersectionObserver(entries => {
      let filtered = entries.filter(entry => entry.isIntersecting);

      //this.log('entries:', entries);

      entries.forEach(entry => {
        let target = entry.target as HTMLElement;

        if(entry.isIntersecting) {
          this.setVisible(target);

          this.debug && this.log('intersection entry:', entry, this.lastTopID, this.lastBottomID);
        } else {
          let id = +target.dataset.virtual;
          let isTop = entry.boundingClientRect.top < 0;
          
          if(isTop) {
            this.lastTopID = id + 1;
          } else {
            this.lastBottomID = id - 1;
          }

          //this.setHidden(target);
          //this.log('intersection entry setHidden:', entry);
        }

        //this.debug && this.log('intersection entry:', entry, isTop, isBottom, this.lastTopID, this.lastBottomID);
      });

      if(!filtered.length || this.lastScrollDirection === 0) {
        return;
      }

      if(this.lastScrollDirection === 1) { // bottom
        let target = filtered[filtered.length - 1].target as HTMLElement;
        this.lastBottomID = +target.dataset.virtual;

        for(let i = 0; i < this.splitCount; ++i) {
          target = target.nextElementSibling as HTMLElement;
          if(!target) break;
          this.setVisible(target);
        }
      } else {
        let target = filtered[0].target as HTMLElement;
        this.lastTopID = +target.dataset.virtual;

        for(let i = 0; i < this.splitCount; ++i) {
          target = target.previousElementSibling as HTMLElement;
          if(!target) break;
          this.setVisible(target);
        }
      }

      this.debug && this.log('entries:', entries, filtered, this.lastScrollDirection, this.lastTopID, this.lastBottomID);

      let minVisibleID = this.lastTopID - this.splitCount;
      let maxVisibleID = this.lastBottomID + this.splitCount;
      for(let target of this.visible) {
        let id = +target.dataset.virtual;
        if(id < minVisibleID || id > maxVisibleID) {
          this.setHidden(target);
        }
      }
    });

    if(!appendTo) {
      this.appendTo = this.container;
    }
    
    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''));

    if(axis == 'x') {
      this.container.classList.add('scrollable-x');

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
    } else {
      throw new Error('no side for scroll');
    }
    
    window.addEventListener('resize', () => this.onScroll());
    this.container.addEventListener('scroll', () => this.onScroll(), {passive: true, capture: true});
    
    Array.from(el.children).forEach(c => this.container.append(c));
    
    el.append(this.container);
    //this.onScroll();
  }

  // public attachSentinels(container = this.container, offset = this.onScrollOffset) {
  //   if(!this.sentinelsObserver) {
  //     this.topSentinel = document.createElement('div');
  //     this.topSentinel.classList.add('scrollable-sentinel');
  //     this.topSentinel.style.top = offset + 'px';
  //     this.bottomSentinel = document.createElement('div');
  //     this.bottomSentinel.classList.add('scrollable-sentinel');
  //     this.bottomSentinel.style.bottom = offset + 'px';

  //     this.container.append(this.topSentinel, this.bottomSentinel);

  //     //let fire: () => void;

  //     this.sentinelsObserver = new IntersectionObserver(entries => {
  //       for(let entry of entries) {
  //         let top = entry.target == this.topSentinel;
  //         if(top) {
  //           this.onScrolledTopFired = entry.isIntersecting;
  //         } else {
  //           this.onScrolledBottomFired = entry.isIntersecting;
  //         }
  //       }

  //       /* this.debug &&  */this.log('Set onScrolledFires:', this.onScrolledTopFired, this.onScrolledBottomFired);

  //       /* if((this.onScrolledTopFired || this.onScrolledBottomFired) && !fire) {
  //         fire = () => window.requestAnimationFrame(() => {
  //           if(!this.scrollLocked) {
  //             if(this.onScrolledTopFired && this.onScrolledTop) this.onScrolledTop();
  //             if(this.onScrolledBottomFired && this.onScrolledBottom) this.onScrolledBottom(); 
  //           }

  //           if(!this.onScrolledTopFired && !this.onScrolledBottomFired) {
  //             fire = undefined;
  //           } else {
  //             fire();
  //           }
  //         });

  //         fire();
  //       } */
  //     });

  //     this.sentinelsObserver.observe(this.topSentinel);
  //     this.sentinelsObserver.observe(this.bottomSentinel);
  //   }

  //   container.prepend(this.topSentinel);
  //   container.append(this.bottomSentinel);
  // }

  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    this.lastScrollTop = 0;
    this.log('setVirtualContainer:', el, this);
  }

  public onScroll() {
    /* let scrollTop = this.scrollTop;
    this.lastScrollDirection = this.lastScrollTop < scrollTop;
    this.lastScrollTop = scrollTop;
    return; */

    /* if(this.debug) {
      this.log('onScroll call', this.onScrollMeasure);
    } */

    let appendTo = this.splitUp || this.appendTo;
    
    clearTimeout(this.disableHoverTimeout);
    if(this.el != this.appendTo && this.appendTo != this.container) {
      if(!appendTo.classList.contains('disable-hover')) {
        appendTo.classList.add('disable-hover');
      }
    }
    
    this.disableHoverTimeout = setTimeout(() => {
      appendTo.classList.remove('disable-hover');
      this.lastScrollDirection = 0;
    }, 100);

    if(this.onScrollMeasure) return;
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      this.checkForTriggers();

      this.onScrollMeasure = 0;
      if(!this.splitUp) return;

      let scrollTop = this.container.scrollTop;
      if(this.lastScrollTop != scrollTop) {
        this.lastScrollDirection = this.lastScrollTop < scrollTop ? 1 : -1;
        this.lastScrollTop = scrollTop;
      } else {
        this.lastScrollDirection = 0;
      }
    });
  }

  public checkForTriggers() {
    if(this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) return;

    let scrollTop = this.container.scrollTop;
    let maxScrollTop = this.container.scrollHeight - this.container.clientHeight;

    if(this.onScrolledTop && scrollTop <= this.onScrollOffset) {
      this.onScrolledTop();
    }

    if(this.onScrolledBottom && (maxScrollTop - scrollTop) <= this.onScrollOffset) {
      this.onScrolledBottom();
    }
  }

  public reorder() {
    (Array.from(this.splitUp.children) as HTMLElement[]).forEach((el, idx) => {
      el.dataset.virtual = '' + idx;
    });
  }

  public updateElement(element: HTMLElement) {
    element.style.minHeight = '';
    window.requestAnimationFrame(() => {
      let height = element.scrollHeight;
      
      window.requestAnimationFrame(() => {
        element.style.minHeight = height + 'px';
      });
    });
  }

  public prepareElement(element: HTMLElement, append = true) {
    element.dataset.virtual = '' + (append ? this.virtualTempIDBottom++ : this.virtualTempIDTop--);

    this.debug && this.log('prepareElement: prepared');
    
    window.requestAnimationFrame(() => {
      let {scrollHeight/* , scrollWidth */} = element;

      this.debug && this.log('prepareElement: first rAF');

      window.requestAnimationFrame(() => {
        //element.style.height = scrollHeight + 'px';
        element.style.minHeight = scrollHeight + 'px'; // height doesn't work for safari
        //element.style.width = scrollWidth + 'px';
        //(element.firstElementChild as HTMLElement).style.display = 'none';
      });

      this.visible.add(element);
      this.observer.observe(element);
    });
  }
  
  public prepend(element: HTMLElement, splitable = true) {
    if(splitable) this.prepareElement(element, false);

    if(this.splitUp) this.splitUp.prepend(element);
    else this.appendTo.prepend(element);
  }
  
  public append(element: HTMLElement, splitable = true) {
    if(splitable) this.prepareElement(element);

    if(this.splitUp) this.splitUp.append(element);
    else this.appendTo.append(element);
  }

  public contains(element: Element) {
    if(!this.splitUp) {
      return this.appendTo.contains(element);
    }
    
    return !!element.parentElement;
  }

  public scrollIntoView(element: HTMLElement, smooth = true) {
    if(element.parentElement && !this.scrollLocked) {
      let isFirstUnread = element.classList.contains('is-first-unread');
      let offsetTop = element.offsetTop;
      if(!smooth && isFirstUnread) {
        this.scrollTo(offsetTop, false);
        return;
      }

      let clientHeight = this.container.clientHeight;
      let height = element.scrollHeight;

      offsetTop -= (clientHeight - height) / 2;
      
      this.scrollTo(offsetTop, smooth);
    }
  }

  public scrollTo(top: number, smooth = true, important = false) {
    if(this.scrollLocked && !important) return;

    let scrollTop = this.scrollTop;
    if(scrollTop == Math.floor(top)) {
      return;
    }

    if(this.scrollLocked) clearTimeout(this.scrollLocked);
    this.scrollLocked = setTimeout(() => {
      this.scrollLocked = 0;
      this.onScroll();
    }, 468);

    this.container.scrollTo({behavior: smooth ? 'smooth' : 'auto', top});
  }

  public removeElement(element: Element) {
    element.remove();
  }

  set scrollTop(y: number) {
    this.container.scrollTop = y;
  }
  
  get scrollTop() {
    //this.log.trace('get scrollTop');
    return this.container.scrollTop;
  }
  
  get scrollHeight() {
    return this.container.scrollHeight;
  }

  get length() {
    return this.appendTo.childElementCount;
  }
}

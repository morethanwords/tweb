import { logger, LogLevels } from "../lib/logger";
import smoothscroll from '../lib/smoothscroll';
import { touchSupport, isSafari } from "../lib/config";
//import { isInDOM } from "../lib/utils";
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

/* const scrollables: Map<HTMLElement, Scrollable> = new Map();
const scrollsIntersector = new IntersectionObserver(entries => {
  for(let entry of entries) {
    const scrollable = scrollables.get(entry.target as HTMLElement);

    if(entry.isIntersecting) {
      scrollable.isVisible = true;
    } else {
      scrollable.isVisible = false;

      if(!isInDOM(entry.target)) {
        scrollsIntersector.unobserve(scrollable.container);
        scrollables.delete(scrollable.container);
      }
    }
  }
}); */

export default class Scrollable {
  //public container: HTMLDivElement;
  public overflowContainer: HTMLElement;

  public splitUp: HTMLElement;
  
  public onScrolledTop: () => void = null;
  public onScrolledBottom: () => void = null;

  public onScrollMeasure: number = null;
  
  public lastScrollTop: number = 0;
  
  private disableHoverTimeout: number = 0;
  
  private log: ReturnType<typeof logger>;

  /* private sentinelsObserver: IntersectionObserver;
  private topSentinel: HTMLDivElement;
  private bottomSentinel: HTMLDivElement; */

  private observer: IntersectionObserver;
  private visible: Set<HTMLElement>;
  private virtualTempIDTop = 0;
  private virtualTempIDBottom = 0;
  private lastTopID = 0;
  private lastBottomID = 0;
  private lastScrollDirection = 0; // true = bottom

  /* private onScrolledTopFired = false;
  private onScrolledBottomFired = false; */

  public scrollLocked = 0;
  public isVisible = false;

  private reorderTimeout: number;

  private setVisible(element: HTMLElement) {
    if(this.visible.has(element)) return;

    this.log.debug('setVisible id:', element.dataset.virtual);
    (element.firstElementChild as HTMLElement).style.display = '';
    this.visible.add(element);
  }

  private setHidden(element: HTMLElement) {
    if(!this.visible.has(element)) return;

    this.log.debug('setHidden id:', element.dataset.virtual);
    (element.firstElementChild as HTMLElement).style.display = 'none';
    this.visible.delete(element);
  }
  
  constructor(public el: HTMLElement, axis: 'y' | 'x' = 'y', logPrefix = '', public appendTo = el, public onScrollOffset = 300, public splitCount = 15, public container: HTMLElement = document.createElement('div')) {
    this.container.classList.add('scrollable');

    this.visible = new Set();
    this.observer = new IntersectionObserver(entries => {
      const filtered = entries.filter(entry => entry.isIntersecting);

      //return;

      //this.log('entries:', entries);

      entries.forEach(entry => {
        const target = entry.target as HTMLElement;

        if(entry.isIntersecting) {
          this.setVisible(target);

          this.log.debug('intersection entry:', entry, this.lastTopID, this.lastBottomID);
        } else {
          const id = +target.dataset.virtual;
          const isTop = entry.boundingClientRect.top < 0;
          
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

      this.log.debug('entries:', entries, filtered, this.lastScrollDirection, this.lastTopID, this.lastBottomID);

      const minVisibleID = this.lastTopID - this.splitCount;
      const maxVisibleID = this.lastBottomID + this.splitCount;
      for(const target of this.visible) {
        const id = +target.dataset.virtual;
        if(id < minVisibleID || id > maxVisibleID) {
          this.setHidden(target);
        }
      }
    });

    if(!appendTo) {
      this.appendTo = this.container;
    }
    
    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''), LogLevels.error);

    if(axis == 'x') {
      this.container.classList.add('scrollable-x');

      if(!touchSupport) {
        const scrollHorizontally = (e: any) => {
          e = window.event || e;
          const delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
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
      }
    } else if(axis == 'y') {
      this.container.classList.add('scrollable-y');
    } else {
      throw new Error('no side for scroll');
    }

    const binded = this.onScroll.bind(this);

    window.addEventListener('resize', () => {
      this.overflowContainer = window.innerWidth <= 720 && false ? document.documentElement : this.container;
      this.onScroll();
    });
    this.container.addEventListener('scroll', binded, {passive: true, capture: true});
    //document.documentElement.addEventListener('scroll', binded, {passive: true, capture: true});
    //window.addEventListener('scroll', binded, {passive: true, capture: true});
    
    if(el) {
      Array.from(el.children).forEach(c => this.container.append(c));

      el.append(this.container);
    }
    //this.onScroll();

    this.overflowContainer = window.innerWidth <= 720 && false ? document.documentElement : this.container;

    /* scrollables.set(this.container, this);
    scrollsIntersector.observe(this.container); */
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

    //if(!this.isVisible) return;

    //if(this.debug) {
      //this.log('onScroll call', this.onScrollMeasure);
    //}

    //let appendTo = this.splitUp || this.appendTo;

    // this.log('onScroll:', this.container.scrollTop);
    // if(this.container.scrollTop <= 0) {
    //   /* touchSupport &&  */(this.container.style.overflow = 'hidden');
    //   this.scrollTop = 0;
    //   /* touchSupport &&  */(this.container.style.overflow = '');
    // }
    
    if(this.splitUp) {
      clearTimeout(this.disableHoverTimeout);

      this.disableHoverTimeout = setTimeout(() => {
        //appendTo.classList.remove('disable-hover');
        this.lastScrollDirection = 0;
      }, 100);
    }
    
    /* if(this.el != this.appendTo && this.appendTo != this.container) {
      if(!appendTo.classList.contains('disable-hover')) {
        appendTo.classList.add('disable-hover');
      }
    } */

    if(this.onScrollMeasure || ((this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) && !this.splitUp)) return;
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      //if(!this.isVisible) return;

      this.checkForTriggers(this.overflowContainer);

      this.onScrollMeasure = 0;
      if(!this.splitUp) return;

      const scrollTop = this.overflowContainer.scrollTop;
      if(this.lastScrollTop != scrollTop) {
        this.lastScrollDirection = this.lastScrollTop < scrollTop ? 1 : -1;
        this.lastScrollTop = scrollTop;
      } else {
        this.lastScrollDirection = 0;
      }
    });
  }

  public checkForTriggers(container: HTMLElement) {
    if(this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) return;

    const scrollTop = container.scrollTop;
    const maxScrollTop = container.scrollHeight - container.clientHeight;

    //this.log('checkForTriggers:', scrollTop, maxScrollTop);

    if(this.onScrolledTop && scrollTop <= this.onScrollOffset) {
      this.onScrolledTop();
    }

    if(this.onScrolledBottom && (maxScrollTop - scrollTop) <= this.onScrollOffset) {
      this.onScrolledBottom();
    }
  }

  public reorder() {
    if(!this.splitUp || this.reorderTimeout) return;

    this.reorderTimeout = setTimeout(() => {
      this.reorderTimeout = 0;

      (Array.from(this.splitUp.children) as HTMLElement[]).forEach((el, idx) => {
        el.dataset.virtual = '' + idx;
      });
    }, 0);
  }

  public updateElement(element: HTMLElement) {
    element.style.minHeight = '';
    window.requestAnimationFrame(() => {
      const height = element.scrollHeight;
      
      window.requestAnimationFrame(() => {
        element.style.minHeight = height + 'px';
      });
    });
  }

  public prepareElement(element: HTMLElement, append = true) {
    if(!this.splitUp) return;
    //return;
    element.dataset.virtual = '' + (append ? this.virtualTempIDBottom++ : this.virtualTempIDTop--);

    this.log.debug('prepareElement: prepared');
    
    window.requestAnimationFrame(() => {
      const {scrollHeight/* , scrollWidth */} = element;

      this.log.debug('prepareElement: first rAF');

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
      const isFirstUnread = element.classList.contains('is-first-unread');

      let offsetTop = element.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
      offsetTop = this.container.scrollTop + offsetTop;
      
      if(!smooth && isFirstUnread) {
        this.scrollTo(offsetTop, false);
        return;
      }

      const clientHeight = this.container.clientHeight;
      const height = element.scrollHeight;
      
      const d = (clientHeight - height) / 2;
      offsetTop -= d;
      
      this.scrollTo(offsetTop, smooth);
    }
  }

  public scrollTo(top: number, smooth = true, important = false) {
    if(this.scrollLocked && !important) return;

    const scrollTop = this.scrollTop;
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

import { logger, deferredPromise, CancellablePromise } from "../lib/polyfill";

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

  public type: string;
  public side: string;
  public translate: string;
  public scrollType: string;
  public scrollSide: string;
  public clientAxis: string;
  public clientSize: string;
  
  public scrollSize = -1; // it will be scrollHeight
  public size = 0; // it will be outerHeight of container (not scrollHeight)
  
  public splitUp: HTMLElement;
  
  public onScrolledTop: () => void = null;
  public onScrolledBottom: () => void = null;
  public onScrolledTopFired = false;
  public onScrolledBottomFired = false;

  public onScrollMeasure: number = null;
  
  public lastScrollTop: number = 0;
  public scrollTopOffset: number = 0;
  
  private disableHoverTimeout: number = 0;
  
  private log: ReturnType<typeof logger>;
  private debug = false;
  
  private measureMutex: CancellablePromise<void>;

  private observer: IntersectionObserver;
  private visible: Set<HTMLElement>;
  private virtualTempIDTop = 0;
  private virtualTempIDBottom = 0;
  private lastTopID = 0;
  private lastBottomID = 0;
  private lastScrollDirection = 0; // true = bottom

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
  
  constructor(public el: HTMLElement, axis: 'y' | 'x' = 'y', public splitOffset = 300, logPrefix = '', public appendTo = el, public onScrollOffset = splitOffset, public splitCount = 15) {
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

    // внизу - самый производительный вариант
    if(false) this.observer = new IntersectionObserver(entries => {
      entries/* .filter(entry => entry.isIntersecting) */.forEach((entry, idx, arr) => {
        let target = entry.target as HTMLElement;

        if(entry.isIntersecting) {
          let isTop = entry.boundingClientRect.top <= 0;
          let isBottom = entry.rootBounds.height <= (entry.boundingClientRect.top + entry.boundingClientRect.height);
  
          /* let id = +target.dataset.virtual;
          let isOutOfRange = id < (this.lastTopID - 15) || id > (this.lastBottomID + 15);
          if(isOutOfRange) {
            this.debug && this.log('out of range, scroll jumped!');
            if(idx == 0) this.lastTopID = id;
            else if(idx == (arr.length - 1)) this.lastBottomID = id;
          } */
  
          this.setVisible(target);
          if(isTop) {
            /* this.lastTopID = id;
            this.debug && this.log('set lastTopID to:', this.lastTopID); */
  
            for(let i = 0; i < 15; ++i) {
              target = target.previousElementSibling as HTMLElement;
              if(!target) break;
              this.setVisible(target);
            }
          } else if(isBottom) {
            /* this.lastBottomID = id;
            this.debug && this.log('set lastBottomID to:', this.lastBottomID); */
  
            for(let i = 0; i < 15; ++i) {
              target = target.nextElementSibling as HTMLElement;
              if(!target) break;
              this.setVisible(target);
            }
          }
        } else {
          this.setHidden(target);
        }
        

        //this.debug && this.log('intersection entry:', entry, isTop, isBottom, this.lastTopID, this.lastBottomID);
      });

      /* let minVisibleID = this.lastTopID - 15;
      let maxVisibleID = this.lastBottomID + 15;
      for(let target of this.visible) {
        let id = +target.dataset.virtual;
        if(id < minVisibleID || id > maxVisibleID) {
          this.setHidden(target);
        }
      } */
    });

    if(!appendTo) {
      this.appendTo = this.container;
    }
    
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
    
    //this.container.addEventListener('mouseover', this.resize.bind(this)); // omg
    window.addEventListener('resize', () => {
      window.requestAnimationFrame(() => {
        this.onScroll();
      });
    });

    this.container.addEventListener('scroll', () => this.onScroll(), {passive: true, capture: true});
    
    Array.from(el.children).forEach(c => this.container.append(c));
    
    el.append(this.container);
    //this.onScroll();
  }

  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    
    this.onScrolledBottomFired = this.onScrolledTopFired = false;
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
      
      if(!this.measureMutex.isFulfilled) {
        this.measureMutex.resolve();
      }
    }, 100);
    
    if(this.onScrollMeasure) return; //window.cancelAnimationFrame(this.onScrollMeasure);
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      // @ts-ignore
      let scrollPos = this.container[this.scrollSide];

      //if(this.measureMutex.isFulfilled) {
        // @ts-ignore quick brown fix
        this.size = this.container[this.clientSize];
        
        // @ts-ignore
        let scrollSize = this.container[this.scrollType];
        this.scrollSize = scrollSize;
        
        //this.measureMutex = deferredPromise<void>();
      //}
      
      let scrollTop = scrollPos - this.scrollTopOffset;
      let maxScrollTop = this.scrollSize - this.scrollTopOffset - this.size;

      if(this.onScrolledBottom) {
        if((maxScrollTop - scrollTop) <= this.onScrollOffset) {
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
        if(scrollTop <= this.onScrollOffset) {
          this.onScrolledTopFired = true;
          this.onScrolledTop();
        } else {
          this.onScrolledTopFired = false;
        }
      }
      
      if(this.lastScrollTop != scrollTop) {
        this.lastScrollDirection = this.lastScrollTop < scrollTop ? 1 : -1;
        this.lastScrollTop = scrollTop;
      } else {
        this.lastScrollDirection = 0;
      }
      this.onScrollMeasure = 0;
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

  public scrollIntoView(element: Element) {
    if(element.parentElement) {
      element.scrollIntoView();
    }
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

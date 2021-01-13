import { isTouchSupported } from "../helpers/touchSupport";
import { logger, LogLevels } from "../lib/logger";
import fastSmoothScroll, { FocusDirection } from "../helpers/fastSmoothScroll";
import useHeavyAnimationCheck from "../hooks/useHeavyAnimationCheck";
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
Array.from($0.querySelectorAll('.bubble-content')).forEach(_el => {
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

export class ScrollableBase {
  protected log: ReturnType<typeof logger>;

  public onScrollMeasure: number = 0;
  protected onScroll: () => void;

  public isHeavyAnimationInProgress = false;
  public isHeavyScrolling = false;

  constructor(public el: HTMLElement, logPrefix = '', public container: HTMLElement = document.createElement('div')) {
    this.container.classList.add('scrollable');

    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''), LogLevels.error);

    if(el) {
      Array.from(el.children).forEach(c => this.container.append(c));

      el.append(this.container);
    }
    //this.onScroll();
  }

  protected setListeners() {
    window.addEventListener('resize', this.onScroll, {passive: true});
    this.container.addEventListener('scroll', this.onScroll, {passive: true, capture: true});

    useHeavyAnimationCheck(() => {
      this.isHeavyAnimationInProgress = true;

      if(this.onScrollMeasure) {
        window.cancelAnimationFrame(this.onScrollMeasure);
      }
    }, () => {
      this.isHeavyAnimationInProgress = false;
      this.onScroll();
    });
  }

  public append(element: HTMLElement) {
    this.container.append(element);
  }

  public scrollIntoViewNew(
    element: HTMLElement,
    position: ScrollLogicalPosition,
    margin?: number,
    maxDistance?: number,
    forceDirection?: FocusDirection,
    forceDuration?: number,
    axis?: 'x' | 'y'
  ) {
    this.isHeavyScrolling = true;
    return fastSmoothScroll(this.container, element, position, margin, maxDistance, forceDirection, forceDuration, axis)
    .finally(() => {
      this.isHeavyScrolling = false;
    });
  }
}

export type SliceSides = 'top' | 'bottom';
export type SliceSidesContainer = {[k in SliceSides]: boolean};

export default class Scrollable extends ScrollableBase {
  public splitUp: HTMLElement;
  public padding: HTMLElement;
  
  public onAdditionalScroll: () => void = null;
  public onScrolledTop: () => void = null;
  public onScrolledBottom: () => void = null;
  
  public lastScrollTop: number = 0;
  public lastScrollDirection: number = 0;

  public loadedAll: SliceSidesContainer = {top: true, bottom: false};

  constructor(el: HTMLElement, logPrefix = '', public onScrollOffset = 300, withPaddingContainer?: boolean) {
    super(el, logPrefix);

    /* if(withPaddingContainer) {
      this.padding = document.createElement('div');
      this.padding.classList.add('scrollable-padding');
      Array.from(this.container.children).forEach(c => this.padding.append(c));
      this.container.append(this.padding);
    } */

    this.container.classList.add('scrollable-y');
    this.setListeners();
  }

  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    this.log('setVirtualContainer:', el, this);
  }

  public onScroll = () => {
    //if(this.debug) {
      //this.log('onScroll call', this.onScrollMeasure);
    //}

    //return;

    if(this.isHeavyAnimationInProgress) {
      if(this.onScrollMeasure) {
        window.cancelAnimationFrame(this.onScrollMeasure);
      }

      return;
    }

    //if(this.onScrollMeasure || ((this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) && !this.splitUp && !this.onAdditionalScroll)) return;
    if((!this.onScrolledTop && !this.onScrolledBottom) && !this.splitUp && !this.onAdditionalScroll) return;
    if(this.onScrollMeasure) window.cancelAnimationFrame(this.onScrollMeasure);
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      this.onScrollMeasure = 0;

      const scrollTop = this.container.scrollTop;
      this.lastScrollDirection = this.lastScrollTop == scrollTop ? 0 : (this.lastScrollTop < scrollTop ? 1 : -1); // * 1 - bottom, -1 - top
      this.lastScrollTop = scrollTop;

      if(this.onAdditionalScroll && this.lastScrollDirection !== 0) {
        this.onAdditionalScroll();
      }
      
      if(this.checkForTriggers) {
        this.checkForTriggers();
      }
    });
  };

  public checkForTriggers = () => {
    if((!this.onScrolledTop && !this.onScrolledBottom) || this.isHeavyAnimationInProgress) return;

    const scrollHeight = this.container.scrollHeight;
    if(!scrollHeight) { // незачем вызывать триггеры если блок пустой или не виден
      return;
    }

    const clientHeight = this.container.clientHeight;
    const maxScrollTop = scrollHeight - clientHeight;
    const scrollTop = this.lastScrollTop;

    //this.log('checkForTriggers:', scrollTop, maxScrollTop);

    if(this.onScrolledTop && scrollTop <= this.onScrollOffset && this.lastScrollDirection <= 0/* && direction === -1 */) {
      this.onScrolledTop();
    }

    if(this.onScrolledBottom && (maxScrollTop - scrollTop) <= this.onScrollOffset && this.lastScrollDirection >= 0/* && direction === 1 */) {
      this.onScrolledBottom();
    }
  };

  public prepend(...elements: HTMLElement[]) {
    (this.splitUp || this.padding || this.container).prepend(...elements);
  }

  public append(...elements: HTMLElement[]) {
    (this.splitUp || this.padding || this.container).append(...elements);
  }

  get isScrolledDown() {
    return this.scrollHeight - Math.round(this.scrollTop + this.container.offsetHeight) <= 1;
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
}

export class ScrollableX extends ScrollableBase {
  constructor(el: HTMLElement, logPrefix = '', public onScrollOffset = 300, public splitCount = 15, public container: HTMLElement = document.createElement('div')) {
    super(el, logPrefix, container);

    this.container.classList.add('scrollable-x');

    if(!isTouchSupported) {
      const scrollHorizontally = (e: any) => {
        e = window.event || e;
        if(e.which == 1) {
          // maybe horizontal scroll is natively supports, works on macbook
          return;
        }

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
  }
}

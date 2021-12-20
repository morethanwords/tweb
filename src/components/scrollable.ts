/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import { logger, LogTypes } from "../lib/logger";
import fastSmoothScroll, { FocusDirection, ScrollGetNormalSizeCallback } from "../helpers/fastSmoothScroll";
import useHeavyAnimationCheck from "../hooks/useHeavyAnimationCheck";
import { cancelEvent } from "../helpers/dom/cancelEvent";
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
  protected needCheckAfterAnimation = false;

  constructor(public el: HTMLElement, logPrefix = '', public container: HTMLElement = document.createElement('div')) {
    this.container.classList.add('scrollable');

    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''), LogTypes.Error);

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
        this.needCheckAfterAnimation = true;
        window.cancelAnimationFrame(this.onScrollMeasure);
      }
    }, () => {
      this.isHeavyAnimationInProgress = false;

      if(this.needCheckAfterAnimation) {
        this.onScroll();
        this.needCheckAfterAnimation = false;
      }
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
    axis?: 'x' | 'y',
    getNormalSize?: ScrollGetNormalSizeCallback
  ) {
    //return Promise.resolve();
    return fastSmoothScroll(this.container, element, position, margin, maxDistance, forceDirection, forceDuration, axis, getNormalSize);
  }
}

export type SliceSides = 'top' | 'bottom';
export type SliceSidesContainer = {[k in SliceSides]: boolean};

export default class Scrollable extends ScrollableBase {
  public splitUp: HTMLElement;
  public padding: HTMLElement;
  
  public onAdditionalScroll: () => void;
  public onScrolledTop: () => void;
  public onScrolledBottom: () => void;
  
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

      this.needCheckAfterAnimation = true;
      return;
    }

    //if(this.onScrollMeasure || ((this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) && !this.splitUp && !this.onAdditionalScroll)) return;
    if((!this.onScrolledTop && !this.onScrolledBottom) && !this.splitUp && !this.onAdditionalScroll) return;
    if(this.onScrollMeasure) window.cancelAnimationFrame(this.onScrollMeasure);
    this.onScrollMeasure = window.requestAnimationFrame(() => {
      this.onScrollMeasure = 0;

      const scrollTop = this.container.scrollTop;
      this.lastScrollDirection = this.lastScrollTop === scrollTop ? 0 : (this.lastScrollTop < scrollTop ? 1 : -1); // * 1 - bottom, -1 - top
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
    if((!this.onScrolledTop && !this.onScrolledBottom)) return;

    if(this.isHeavyAnimationInProgress) {
      this.onScroll();
      return;
    }

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

  public prepend(...elements: (HTMLElement | DocumentFragment)[]) {
    (this.splitUp || this.padding || this.container).prepend(...elements);
  }

  public append(...elements: (HTMLElement | DocumentFragment)[]) {
    (this.splitUp || this.padding || this.container).append(...elements);
  }

  public getDistanceToEnd() {
    return this.scrollHeight - Math.round(this.scrollTop + this.container.offsetHeight);
  }

  get isScrolledDown() {
    return this.getDistanceToEnd() <= 1;
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

    if(!IS_TOUCH_SUPPORTED) {
      const scrollHorizontally = (e: any) => {
        if(!e.deltaX && this.container.scrollWidth > this.container.clientWidth) {
          this.container.scrollLeft += e.deltaY / 4;
          cancelEvent(e);
        }
      };
      
      this.container.addEventListener('wheel', scrollHorizontally, {passive: false});
    }
  }
}

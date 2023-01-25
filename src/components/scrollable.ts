/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import {logger, LogTypes} from '../lib/logger';
import fastSmoothScroll, {ScrollOptions} from '../helpers/fastSmoothScroll';
import useHeavyAnimationCheck from '../hooks/useHeavyAnimationCheck';
import cancelEvent from '../helpers/dom/cancelEvent';
import {IS_ANDROID} from '../environment/userAgent';
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
Array.from($0.querySelectorAll('.bubble-content')).forEach((_el) => {
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
const scrollsIntersector = new IntersectionObserver((entries) => {
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

const SCROLL_THROTTLE = /* IS_ANDROID ? 200 :  */24;

export class ScrollableBase {
  protected log: ReturnType<typeof logger>;

  public splitUp: HTMLElement;
  public onScrollMeasure: number = 0;

  public lastScrollPosition: number = 0;
  public lastScrollDirection: number = 0;

  public onAdditionalScroll: () => void;
  public onScrolledTop: () => void;
  public onScrolledBottom: () => void;

  public isHeavyAnimationInProgress = false;
  protected needCheckAfterAnimation = false;

  public checkForTriggers?: () => void;

  public scrollProperty: 'scrollTop' | 'scrollLeft';

  protected removeHeavyAnimationListener: () => void;
  protected addedScrollListener: boolean;

  constructor(public el?: HTMLElement, logPrefix = '', public container: HTMLElement = document.createElement('div')) {
    this.container.classList.add('scrollable');

    this.log = logger('SCROLL' + (logPrefix ? '-' + logPrefix : ''), LogTypes.Error);

    if(el) {
      Array.from(el.children).forEach((c) => this.container.append(c));

      el.append(this.container);
    }
    // this.onScroll();
  }

  public addScrollListener() {
    if(this.addedScrollListener) {
      return;
    }

    this.addedScrollListener = true;
    this.container.addEventListener('scroll', this.onScroll, {passive: true, capture: true});
  }

  public removeScrollListener() {
    if(!this.addedScrollListener) {
      return;
    }

    this.addedScrollListener = false;
    this.container.removeEventListener('scroll', this.onScroll, {capture: true});
  }

  public setListeners() {
    if(this.removeHeavyAnimationListener) {
      return;
    }

    window.addEventListener('resize', this.onScroll, {passive: true});
    this.addScrollListener();

    this.removeHeavyAnimationListener = useHeavyAnimationCheck(() => {
      this.isHeavyAnimationInProgress = true;

      if(this.onScrollMeasure) {
        this.cancelMeasure();
        this.needCheckAfterAnimation = true;
      }
    }, () => {
      this.isHeavyAnimationInProgress = false;

      if(this.needCheckAfterAnimation) {
        this.onScroll();
        this.needCheckAfterAnimation = false;
      }
    });
  }

  public removeListeners() {
    if(!this.removeHeavyAnimationListener) {
      return;
    }

    window.removeEventListener('resize', this.onScroll);
    this.removeScrollListener();

    this.removeHeavyAnimationListener();
    this.removeHeavyAnimationListener = undefined;
  }

  public destroy() {
    this.removeListeners();
    this.onAdditionalScroll = undefined;
    this.onScrolledTop = undefined;
    this.onScrolledBottom = undefined;
  }

  public append(...args: Parameters<HTMLElement['append']>) {
    this.container.append(...args);
  }

  public scrollIntoViewNew(options: Omit<ScrollOptions, 'container'>) {
    // return Promise.resolve();
    // this.removeListeners();
    return fastSmoothScroll({
      ...options,
      container: this.container
    });/* .finally(() => {
      this.setListeners();
    }); */
  }

  public onScroll = () => {
    // if(this.debug) {
    // this.log('onScroll call', this.onScrollMeasure);
    // }

    // return;

    if(this.isHeavyAnimationInProgress) {
      this.cancelMeasure();
      this.needCheckAfterAnimation = true;
      return;
    }

    // if(this.onScrollMeasure || ((this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) && !this.splitUp && !this.onAdditionalScroll)) return;
    if((!this.onScrolledTop && !this.onScrolledBottom) && !this.splitUp && !this.onAdditionalScroll) return;
    if(this.onScrollMeasure) return;
    // if(this.onScrollMeasure) window.cancelAnimationFrame(this.onScrollMeasure);
    // this.onScrollMeasure = window.requestAnimationFrame(() => {
    this.onScrollMeasure = window.setTimeout(() => {
      this.onScrollMeasure = 0;

      const scrollPosition = this.container[this.scrollProperty];
      this.lastScrollDirection = this.lastScrollPosition === scrollPosition ? 0 : (this.lastScrollPosition < scrollPosition ? 1 : -1); // * 1 - bottom, -1 - top
      this.lastScrollPosition = scrollPosition;

      // lastScrollDirection check is useless here, every callback should decide on its own
      if(this.onAdditionalScroll/*  && this.lastScrollDirection !== 0 */) {
        this.onAdditionalScroll();
      }

      if(this.checkForTriggers) {
        this.checkForTriggers();
      }
    // });
    }, SCROLL_THROTTLE);
  };

  public cancelMeasure() {
    if(this.onScrollMeasure) {
      // window.cancelAnimationFrame(this.onScrollMeasure);
      clearTimeout(this.onScrollMeasure);
      this.onScrollMeasure = 0;
    }
  }
}

export type SliceSides = 'top' | 'bottom';
export type SliceSidesContainer = {[k in SliceSides]: boolean};

export default class Scrollable extends ScrollableBase {
  public padding: HTMLElement;

  public loadedAll: SliceSidesContainer = {top: true, bottom: false};

  constructor(el?: HTMLElement, logPrefix = '', public onScrollOffset = 300, withPaddingContainer?: boolean) {
    super(el, logPrefix);

    /* if(withPaddingContainer) {
      this.padding = document.createElement('div');
      this.padding.classList.add('scrollable-padding');
      Array.from(this.container.children).forEach((c) => this.padding.append(c));
      this.container.append(this.padding);
    } */

    this.container.classList.add('scrollable-y');
    this.setListeners();
    this.scrollProperty = 'scrollTop';
  }

  public attachBorderListeners(setClassOn = this.container) {
    const cb = this.onAdditionalScroll;
    this.onAdditionalScroll = () => {
      cb?.();
      setClassOn.classList.toggle('scrolled-top', !this.scrollTop);
      setClassOn.classList.toggle('scrolled-bottom', this.isScrolledDown);
    };

    setClassOn.classList.add('scrolled-top', 'scrolled-bottom', 'scrollable-y-bordered');
  }

  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    this.log('setVirtualContainer:', el, this);
  }

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
    const scrollTop = this.lastScrollPosition;

    // this.log('checkForTriggers:', scrollTop, maxScrollTop);

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
    // this.log.trace('get scrollTop');
    return this.container.scrollTop;
  }

  public setScrollTopSilently(value: number) {
    this.lastScrollPosition = value;
    this.ignoreNextScrollEvent();

    this.scrollTop = value;
  }

  public ignoreNextScrollEvent() {
    if(this.removeHeavyAnimationListener) {
      this.removeScrollListener();
      this.container.addEventListener('scroll', (e) => {
        cancelEvent(e);
        this.addScrollListener();
      }, {capture: true, passive: false, once: true});
    }
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

    this.scrollProperty = 'scrollLeft';
  }
}

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
import {IS_OVERLAY_SCROLL_SUPPORTED} from '../environment/overlayScrollSupport';
import {IS_MOBILE_SAFARI, IS_SAFARI} from '../environment/userAgent';
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
const USE_OWN_SCROLL = !IS_OVERLAY_SCROLL_SUPPORTED;

let throttleMeasurement: (callback: () => void) => number,
  cancelMeasurement: (id: number) => void;
if(USE_OWN_SCROLL) {
  throttleMeasurement = (callback) => requestAnimationFrame(callback);
  cancelMeasurement = (id) => cancelAnimationFrame(id);
} else {
  throttleMeasurement = (callback) => window.setTimeout(callback, SCROLL_THROTTLE);
  cancelMeasurement = (id) => window.clearTimeout(id);
}

export class ScrollableBase {
  protected log: ReturnType<typeof logger>;

  public padding: HTMLElement;
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

  public scrollPositionProperty: 'scrollTop' | 'scrollLeft';
  public scrollSizeProperty: 'scrollHeight' | 'scrollWidth';
  public clientSizeProperty: 'clientHeight' | 'clientWidth';
  public offsetSizeProperty: 'offsetHeight' | 'offsetWidth';
  public clientAxis: 'clientY' | 'clientX';

  protected startMousePosition: number;
  protected startScrollPosition: number;

  protected thumb: HTMLElement;
  protected thumbContainer: HTMLElement;

  protected removeHeavyAnimationListener: () => void;
  protected addedScrollListener: boolean;

  constructor(
    public el?: HTMLElement,
    logPrefix = '',
    public container: HTMLElement = document.createElement('div')
  ) {
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
    if(this.thumb) {
      this.thumb.removeEventListener('mousedown', this.onMouseMove);
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
    }
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

  public prepend(...elements: (string | Node)[]) {
    const prependTo = this.splitUp || this.padding || this.container;
    this.thumb && /* prependTo === this.container &&  */elements.unshift(this.thumbContainer);
    prependTo.prepend(...elements);
    this.onSizeChange();
  }

  public append(...elements: (string | Node)[]) {
    (this.splitUp || this.padding || this.container).append(...elements);
    this.onSizeChange();
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
    this.onScrollMeasure = throttleMeasurement(() => {
      this.onScrollMeasure = 0;

      const scrollPosition = this.scrollPosition;
      this.lastScrollDirection = this.lastScrollPosition === scrollPosition ? 0 : (this.lastScrollPosition < scrollPosition ? 1 : -1); // * 1 - bottom, -1 - top
      this.lastScrollPosition = scrollPosition;

      this.updateThumb(scrollPosition);

      // lastScrollDirection check is useless here, every callback should decide on its own
      if(this.onAdditionalScroll/*  && this.lastScrollDirection !== 0 */) {
        this.onAdditionalScroll();
      }

      if(this.checkForTriggers) {
        this.checkForTriggers();
      }
    });
  };

  public updateThumb(scrollPosition = this.scrollPosition) {
    if(!USE_OWN_SCROLL || !this.thumb) {
      return;
    }

    const scrollSize = this.container[this.scrollSizeProperty];
    const clientSize = this.container[this.clientSizeProperty];
    const divider = scrollSize / clientSize / 0.75;
    const thumbSize = Math.max(20, clientSize / divider);
    const value = scrollPosition / (scrollSize - clientSize) * clientSize;
    // const b = (scrollPosition + clientSize) / scrollSize;
    const b = scrollPosition / (scrollSize - clientSize);
    const maxValue = clientSize - thumbSize;
    if(clientSize < scrollSize) {
      this.thumb.style.height = thumbSize + 'px';
      // this.thumb.style.top = `${Math.min(maxValue, value - thumbSize * b)}px`;
      this.thumb.style.transform = `translateY(${Math.min(maxValue, value - thumbSize * b)}px)`;
    } else {
      this.thumb.style.height = '0px';
    }
  }

  public cancelMeasure() {
    if(this.onScrollMeasure) {
      cancelMeasurement(this.onScrollMeasure);
      this.onScrollMeasure = 0;
    }
  }

  protected onMouseMove = (e: MouseEvent) => {
    cancelEvent(e);

    const contentHeight = this.scrollSize;
    const viewportHeight = this.clientSize;
    const scrollbarSize = this.thumb.offsetHeight;
    const maxScrollTop = contentHeight - viewportHeight;

    const maxScrollbarOffset = viewportHeight - scrollbarSize;
    const deltaY = e[this.clientAxis] - this.startMousePosition;
    const scrollAmount = (deltaY / maxScrollbarOffset) * maxScrollTop;
    const newScrollTop = this.startScrollPosition + scrollAmount;

    this.scrollPosition = newScrollTop;
  };

  protected onMouseDown = (e: MouseEvent) => {
    cancelEvent(e);
    this.startMousePosition = e[this.clientAxis];
    this.startScrollPosition = this.scrollPosition;
    this.thumb.classList.add('is-focused');

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp, {once: true});
  };

  protected onMouseUp = (e: MouseEvent) => {
    window.removeEventListener('mousemove', this.onMouseMove);
    this.thumb.classList.remove('is-focused');
  };

  public onSizeChange() {
    if(USE_OWN_SCROLL && this.thumb) {
      this.onScroll();
    }
  }

  public getDistanceToEnd() {
    return this.scrollSize - Math.round(this.scrollPosition + this.offsetSize);
  }

  get isScrolledToEnd() {
    return this.getDistanceToEnd() <= 1;
  }

  get scrollPosition() {
    return this.container[this.scrollPositionProperty];
  }

  set scrollPosition(value: number) {
    this.container[this.scrollPositionProperty] = value;
  }

  get scrollSize() {
    return this.container[this.scrollSizeProperty];
  }

  get clientSize() {
    return this.container[this.clientSizeProperty];
  }

  get offsetSize() {
    return this.container[this.offsetSizeProperty];
  }

  get firstElementChild() {
    return this.thumb ? this.thumbContainer.nextElementSibling : this.container.firstElementChild;
  }

  public setScrollPositionSilently(value: number) {
    this.lastScrollPosition = value;
    this.ignoreNextScrollEvent();

    this.scrollPosition = value;
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

  public replaceChildren(...args: (string | Node)[]) {
    this.thumb && args.unshift(this.thumbContainer);
    this.container.replaceChildren(...args);
  }
}

export type SliceSides = 'top' | 'bottom';
export type SliceSidesContainer = {[k in SliceSides]: boolean};

export default class Scrollable extends ScrollableBase {
  public loadedAll: SliceSidesContainer = {top: true, bottom: false};

  constructor(
    el?: HTMLElement,
    logPrefix = '',
    public onScrollOffset = 300,
    withPaddingContainer?: boolean,
    container?: HTMLElement
  ) {
    super(el, logPrefix, container);

    // withPaddingContainer = true;
    // if(withPaddingContainer) {
    //   this.padding = document.createElement('div');
    //   this.padding.classList.add('scrollable-padding');
    //   this.padding.append(...Array.from(this.container.children));
    //   this.container.append(this.padding);
    // }

    this.scrollPositionProperty = 'scrollTop';
    this.scrollSizeProperty = 'scrollHeight';
    this.clientSizeProperty = 'clientHeight';
    this.offsetSizeProperty = 'offsetHeight';
    this.clientAxis = 'clientY';

    if(USE_OWN_SCROLL) {
      this.thumbContainer = document.createElement('div');
      this.thumbContainer.classList.add('scrollable-thumb-container');
      this.thumb = document.createElement('div');
      this.thumb.classList.add('scrollable-thumb');
      this.thumbContainer.append(this.thumb);
      this.container.prepend(this.thumbContainer);

      this.thumb.addEventListener('mousedown', this.onMouseDown);
    }

    this.container.classList.add('scrollable-y');
    if(IS_SAFARI && !IS_MOBILE_SAFARI) {
      this.container.classList.add('no-scrollbar');
    }
    this.setListeners();
  }

  public attachBorderListeners(setClassOn = this.container) {
    const cb = this.onAdditionalScroll;
    this.onAdditionalScroll = () => {
      cb?.();
      setClassOn.classList.toggle('scrolled-start', !this.scrollPosition);
      setClassOn.classList.toggle('scrolled-end', this.isScrolledToEnd);
    };

    setClassOn.classList.add('scrolled-start', 'scrolled-end', 'scrollable-y-bordered');
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

    const {scrollSize, scrollPosition, clientSize} = this;
    if(!scrollSize) { // незачем вызывать триггеры если блок пустой или не виден
      return;
    }

    const maxScrollPosition = scrollSize - clientSize;

    // this.log('checkForTriggers:', scrollTop, maxScrollTop);

    if(this.onScrolledTop && scrollPosition <= this.onScrollOffset && this.lastScrollDirection <= 0/* && direction === -1 */) {
      this.onScrolledTop();
    }

    if(this.onScrolledBottom && (maxScrollPosition - scrollPosition) <= this.onScrollOffset && this.lastScrollDirection >= 0/* && direction === 1 */) {
      this.onScrolledBottom();
    }
  };
}

export class ScrollableX extends ScrollableBase {
  constructor(el: HTMLElement, logPrefix = '', public onScrollOffset = 300, public splitCount = 15, public container: HTMLElement = document.createElement('div')) {
    super(el, logPrefix, container);

    this.container.classList.add('scrollable-x');

    if(!IS_TOUCH_SUPPORTED) {
      const scrollHorizontally = (e: WheelEvent) => {
        e.stopPropagation();
        if(!e.deltaX && this.container.scrollWidth > this.container.clientWidth) {
          this.container.scrollLeft += e.deltaY / 4;
          cancelEvent(e);
        }
      };

      this.container.addEventListener('wheel', scrollHorizontally, {passive: false});
    }

    this.scrollPositionProperty = 'scrollLeft';
    this.scrollSizeProperty = 'scrollWidth';
    this.clientSizeProperty = 'clientWidth';
    this.offsetSizeProperty = 'offsetWidth';
  }
}

// credits to https://github.com/iamdustan/smoothscroll

/* eslint-disable */

type ScrollableElement = (Window & typeof globalThis) | Element;
export type SmoothScrollToOptions = Partial<{
  top: number,
  left: number,
  behavior: 'smooth' | 'auto' | 'instant',
  scrollTime: number
}>;

export const SCROLL_TIME = 468;

// polyfill
export default function polyfill() {
  // aliases
  var w = window;
  var d = document;

  // return if scroll behavior is supported and polyfill is not forced
  if(
    'scrollBehavior' in d.documentElement.style &&
    (w as any).__forceSmoothScrollPolyfill__ !== true
  ) {
    return;
  }

  // globals
  var Element = w.HTMLElement || w.Element;

  // object gathering original scroll methods
  var original = {
    scroll: w.scroll || w.scrollTo,
    scrollBy: w.scrollBy,
    elementScroll: Element.prototype.scroll || scrollElement,
    scrollIntoView: Element.prototype.scrollIntoView
  };

  // define timing method
  var now =
    w.performance && w.performance.now
      ? w.performance.now.bind(w.performance)
      : Date.now;

  /**
   * indicates if a the current browser is made by Microsoft
   * @method isMicrosoftBrowser
   * @param {String} userAgent
   * @returns {Boolean}
   */
  function isMicrosoftBrowser(userAgent: string) {
    var userAgentPatterns = ['MSIE ', 'Trident/', 'Edge/'];

    return new RegExp(userAgentPatterns.join('|')).test(userAgent);
  }

  /*
   * IE has rounding bug rounding down clientHeight and clientWidth and
   * rounding up scrollHeight and scrollWidth causing false positives
   * on hasScrollableSpace
   */
  var ROUNDING_TOLERANCE = isMicrosoftBrowser(w.navigator.userAgent) ? 1 : 0;

  /**
   * changes scroll position inside an element
   * @method scrollElement
   * @param {Number} x
   * @param {Number} y
   * @returns {undefined}
   */
  function scrollElement(this: Element, x: number, y: number) {
    this.scrollLeft = x;
    this.scrollTop = y;
  }

  /**
   * returns result of applying ease math function to a number
   * @method ease
   * @param {Number} k
   * @returns {Number}
   */
  function ease(k: number) {
    return 0.5 * (1 - Math.cos(Math.PI * k));
  }

  /**
   * indicates if a smooth behavior should be applied
   * @method shouldBailOut
   * @param {Number|Object} firstArg
   * @returns {Boolean}
   */
  function shouldBailOut(firstArg: SmoothScrollToOptions) {
    if(
      firstArg === null ||
      typeof firstArg !== 'object' ||
      firstArg.behavior === undefined ||
      firstArg.behavior === 'auto' ||
      firstArg.behavior === 'instant'
    ) {
      // first argument is not an object/null
      // or behavior is auto, instant or undefined
      return true;
    }

    if(typeof firstArg === 'object' && firstArg.behavior === 'smooth') {
      // first argument is an object and behavior is smooth
      return false;
    }

    // throw error when behavior is not supported
    throw new TypeError(
      'behavior member of ScrollOptions ' +
        firstArg.behavior +
        ' is not a valid value for enumeration ScrollBehavior.'
    );
  }

  /**
   * indicates if an element has scrollable space in the provided axis
   * @method hasScrollableSpace
   * @param {Node} el
   * @param {String} axis
   * @returns {Boolean}
   */
  function hasScrollableSpace(el: Element, axis: 'X' | 'Y') {
    if(axis === 'Y') {
      return el.clientHeight + ROUNDING_TOLERANCE < el.scrollHeight;
    }

    if(axis === 'X') {
      return el.clientWidth + ROUNDING_TOLERANCE < el.scrollWidth;
    }
  }

  /**
   * indicates if an element has a scrollable overflow property in the axis
   * @method canOverflow
   * @param {Node} el
   * @param {String} axis
   * @returns {Boolean}
   */
  function canOverflow(el: Element, axis: string) {
    // @ts-ignore
    var overflowValue: string = w.getComputedStyle(el, null)['overflow' + axis];

    return overflowValue === 'auto' || overflowValue === 'scroll';
  }

  /**
   * indicates if an element can be scrolled in either axis
   * @method isScrollable
   * @param {Node} el
   * @param {String} axis
   * @returns {Boolean}
   */
  function isScrollable(el: Element) {
    var isScrollableY = hasScrollableSpace(el, 'Y') && canOverflow(el, 'Y');
    var isScrollableX = hasScrollableSpace(el, 'X') && canOverflow(el, 'X');

    return isScrollableY || isScrollableX;
  }

  /**
   * finds scrollable parent of an element
   * @method findScrollableParent
   * @param {Node} el
   * @returns {Node} el
   */
  function findScrollableParent(el: Element) {
    while(el !== d.body && isScrollable(el) === false) {
      // @ts-ignore
      el = el.parentNode || el.host;
    }

    return el;
  }

  /**
   * self invoked function that, given a context, steps through scrolling
   * @method step
   * @param {Object} context
   * @returns {undefined}
   */
  function step(context: {
    startTime: number,
    scrollTime: number,
    startX: number,
    startY: number,
    x: number,
    y: number,
    scrollable: ScrollableElement,
    method: (this: ScrollableElement, currentX: number, currentY: number) => any
  }) {
    var time = now();
    var value: number;
    var currentX: number;
    var currentY: number;
    var elapsed = (time - context.startTime) / context.scrollTime;

    // avoid elapsed times higher than one
    elapsed = elapsed > 1 ? 1 : elapsed;

    // apply easing to elapsed time
    value = ease(elapsed);

    currentX = context.startX + (context.x - context.startX) * value;
    currentY = context.startY + (context.y - context.startY) * value;

    context.method.call(context.scrollable, currentX, currentY);

    // scroll more if we have not reached our destination
    if(currentX !== context.x || currentY !== context.y) {
      w.requestAnimationFrame(step.bind(w, context));
    }
  }

  /**
   * scrolls window or element with a smooth behavior
   * @method smoothScroll
   * @param {Object|Node} el
   * @param {Number} x
   * @param {Number} y
   * @returns {undefined}
   */
  function smoothScroll(el: Element, x: number, y: number, scrollTime = SCROLL_TIME) {
    var scrollable: ScrollableElement;
    var startX: number;
    var startY: number;
    var method: any;
    var startTime = now();

    // define scroll context
    if(el === d.body) {
      scrollable = w;
      startX = w.scrollX || w.pageXOffset;
      startY = w.scrollY || w.pageYOffset;
      method = original.scroll;
    } else {
      scrollable = el;
      startX = el.scrollLeft;
      startY = el.scrollTop;
      method = scrollElement;
    }

    // scroll looping over a frame
    step({
      scrollable: scrollable,
      method: method,
      scrollTime,
      startTime: startTime,
      startX: startX,
      startY: startY,
      x: x,
      y: y
    });
  }

  // ORIGINAL METHODS OVERRIDES
  // w.scroll and w.scrollTo
  w.scroll = w.scrollTo = function() {
    const options = arguments[0] as SmoothScrollToOptions;
    // avoid action when no arguments are passed
    if(options === undefined) {
      return;
    }

    // avoid smooth behavior if not required
    if(shouldBailOut(options) === true) {
      original.scroll.call(
        w,
        options.left !== undefined
          ? options.left
          : typeof options !== 'object'
            ? options
            : w.scrollX || w.pageXOffset,
        // use top prop, second argument if present or fallback to scrollY
        options.top !== undefined
          ? options.top
          : arguments[1] !== undefined
            ? arguments[1]
            : w.scrollY || w.pageYOffset
      );

      return;
    }

    // LET THE SMOOTHNESS BEGIN!
    smoothScroll.call(
      w,
      d.body,
      options.left !== undefined
        ? ~~options.left
        : w.scrollX || w.pageXOffset,
      options.top !== undefined
        ? ~~options.top
        : w.scrollY || w.pageYOffset,
      options.scrollTime
    );
  };

  // w.scrollBy
  w.scrollBy = function() {
    const options = arguments[0] as SmoothScrollToOptions;
    // avoid action when no arguments are passed
    if(options === undefined) {
      return;
    }

    // avoid smooth behavior if not required
    if(shouldBailOut(options)) {
      original.scrollBy.call(
        w,
        options.left !== undefined
          ? options.left
          : typeof options !== 'object' ? options : 0,
        options.top !== undefined
          ? options.top
          : arguments[1] !== undefined ? arguments[1] : 0
      );

      return;
    }

    // LET THE SMOOTHNESS BEGIN!
    smoothScroll.call(
      w,
      d.body,
      ~~options.left + (w.scrollX || w.pageXOffset),
      ~~options.top + (w.scrollY || w.pageYOffset),
      options.scrollTime
    );
  };

  // Element.prototype.scroll and Element.prototype.scrollTo
  Element.prototype.scroll = Element.prototype.scrollTo = function() {
    const options = arguments[0] as SmoothScrollToOptions;
    // avoid action when no arguments are passed
    if(options === undefined) {
      return;
    }

    // avoid smooth behavior if not required
    if(shouldBailOut(options) === true) {
      // if one number is passed, throw error to match Firefox implementation
      if(typeof options === 'number' && arguments[1] === undefined) {
        throw new SyntaxError('Value could not be converted');
      }

      original.elementScroll.call(
        this,
        // use left prop, first number argument or fallback to scrollLeft
        options.left !== undefined
          ? ~~options.left
          : typeof options !== 'object' ? ~~options : this.scrollLeft,
        // use top prop, second argument or fallback to scrollTop
        options.top !== undefined
          ? ~~options.top
          : arguments[1] !== undefined ? ~~arguments[1] : this.scrollTop
      );

      return;
    }

    var left = options.left;
    var top = options.top;

    // LET THE SMOOTHNESS BEGIN!
    smoothScroll.call(
      this,
      this,
      typeof left === 'undefined' ? this.scrollLeft : ~~left,
      typeof top === 'undefined' ? this.scrollTop : ~~top,
      options.scrollTime
    );
  };

  // Element.prototype.scrollBy
  Element.prototype.scrollBy = function() {
    const options = arguments[0] as SmoothScrollToOptions;
    // avoid action when no arguments are passed
    if(options === undefined) {
      return;
    }

    // avoid smooth behavior if not required
    if(shouldBailOut(options) === true) {
      original.elementScroll.call(
        this,
        options.left !== undefined
          ? ~~options.left + this.scrollLeft
          : ~~options + this.scrollLeft,
        options.top !== undefined
          ? ~~options.top + this.scrollTop
          : ~~arguments[1] + this.scrollTop
      );

      return;
    }

    this.scroll({
      left: ~~options.left + this.scrollLeft,
      top: ~~options.top + this.scrollTop,
      behavior: options.behavior as any,
      scrollTime: options.scrollTime
    } as any);
  };

  // Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function() {
    const options = arguments[0] as SmoothScrollToOptions;
    // avoid smooth behavior if not required
    if(shouldBailOut(options) === true) {
      original.scrollIntoView.call(
        this,
        (options === undefined ? true : options) as any
      );

      return;
    }

    // LET THE SMOOTHNESS BEGIN!
    var scrollableParent = findScrollableParent(this);
    var parentRects = scrollableParent.getBoundingClientRect();
    var clientRects = this.getBoundingClientRect();

    if(scrollableParent !== d.body) {
      // reveal element inside parent
      smoothScroll.call(
        this,
        scrollableParent,
        scrollableParent.scrollLeft + clientRects.left - parentRects.left,
        scrollableParent.scrollTop + clientRects.top - parentRects.top,
        options.scrollTime
      );

      // reveal parent in viewport unless is fixed
      if(w.getComputedStyle(scrollableParent).position !== 'fixed') {
        w.scrollBy({
          left: parentRects.left,
          top: parentRects.top,
          behavior: 'smooth',
          scrollTime: options.scrollTime
        } as any);
      }
    } else {
      // reveal element in viewport
      w.scrollBy({
        left: clientRects.left,
        top: clientRects.top,
        behavior: 'smooth',
        scrollTime: options.scrollTime
      } as any);
    }
  };
}

/* if (typeof exports === 'object' && typeof module !== 'undefined') {
  // commonjs
  module.exports = { polyfill: polyfill };
} else {
  // global
  polyfill();
} */
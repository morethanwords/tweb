// * Jolly Cobra's fastSmoothScroll slightly patched

import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';
import {fastRafPromise} from '@helpers/schedulers';
import {animateSingle, cancelAnimationByKey, createAnimationInstance, getAnimationInstance} from '@helpers/animation';
import isInDOM from '@helpers/dom/isInDOM';
import liteMode from '@helpers/liteMode';
import {isElementRTL} from '@helpers/dom/isDocumentRTL';
import {bindActiveWindowListener} from '@helpers/appWindow';
import clamp from '@helpers/number/clamp';

const MIN_JS_DURATION = 250;
const MAX_JS_DURATION = 600;
const LONG_TRANSITION_MAX_DISTANCE = 1500;
const SHORT_TRANSITION_MAX_DISTANCE = 500;
/** A scroll that follows its element (`follow`) stays with it after arriving until it holds still this long… */
const FOLLOW_SETTLE_DURATION = 1000;
/** …and no longer than this. */
const FOLLOW_MAX_DURATION = 3000;
/** What the person does that takes the scroll over from a scroll following its element. */
const FOLLOW_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown'] as const;

export enum FocusDirection {
  Up,
  Down,
  Static
};

export type ScrollGetNormalSizeCallback = (options: {rect: DOMRect}) => number;
export type ScrollGetElementPositionCallback = (options: {elementRect: DOMRect, containerRect: DOMRect, elementPosition: number}) => number;
/** The part of the element a centred scroll is about: its offset from the element's start and its height. */
export type ScrollFocus = {offset: number, height: number};
export type ScrollStartCallbackDimensions = {
  scrollSize: number,
  scrollPosition: number,
  distanceToEnd: number,
  path: number,
  duration: number,
  containerRect: DOMRect,
  elementRect: DOMRect,
  getProgress: () => number
};

export type ScrollOptions = {
  container: HTMLElement,
  element: HTMLElement,
  position: ScrollLogicalPosition,
  margin?: number,
  maxDistance?: number,
  forceDirection?: FocusDirection,
  forceDuration?: number,
  axis?: 'x' | 'y',
  getNormalSize?: ScrollGetNormalSizeCallback,
  getElementPosition?: ScrollGetElementPositionCallback,
  fallbackToElementStartWhenCentering?: HTMLElement,
  startCallback?: (dimensions: ScrollStartCallbackDimensions) => void,
  transitionFunction?: (value: number) => number,
  /**
   * Vertical only: lands where the element is as it arrives, not where it was as the scroll started — what changes
   * size on the way (a widget starting above it) moves it. Having arrived, it stays with the element until it holds
   * still for a moment or the person scrolls.
   */
  follow?: boolean,
  /**
   * Centering only: the part of the element that has to end up in the middle (a quote inside a bubble taller than the
   * screen), as the element is now; none: the element itself. Measured as the scroll starts, the same for where it goes
   * and what a `follow` keeps to, and again on the way: what is above the part inside the element may change, and the
   * element may come to be taller than the screen. A part has the element's start no fallback.
   */
  getFocus?: () => ScrollFocus | undefined
};

export function fastSmoothScrollToStart(
  container: HTMLElement,
  axis: 'x' | 'y',
  forceDuration?: number
) {
  return fastSmoothScroll({
    container: container,
    element: container,
    // * how far it is scrolled from the start: `scrollLeft` is negative in a right-to-left row
    getElementPosition: () => -(axis === 'x' ? Math.abs(container.scrollLeft) : container.scrollTop),
    position: 'start',
    axis,
    forceDuration
  });
}

export default function fastSmoothScroll(options: ScrollOptions) {
  options.margin ??= 0;
  options.maxDistance ??= LONG_TRANSITION_MAX_DISTANCE;
  options.axis ??= 'y';
  // return;

  if(!liteMode.isAvailable('motion') || options.forceDuration === 0) {
    options.forceDirection = FocusDirection.Static;
  }

  if(options.forceDirection === FocusDirection.Static) {
    options.forceDuration = 0;
    return scrollWithJs(options);
    /* return Promise.resolve();

    element.scrollIntoView({ block: position });

    cancelAnimationByKey(container);
    return Promise.resolve(); */
  }

  const promise = fastRafPromise().then(() => scrollWithJs(options));

  return options.axis === 'y' ? dispatchHeavyAnimationEvent(promise) : promise;
}

function scrollWithJs(options: ScrollOptions): Promise<void> {
  const {element, container, getNormalSize, getElementPosition, transitionFunction, axis, margin, position, forceDirection, maxDistance, forceDuration} = options;
  if(!isInDOM(element)) {
    cancelAnimationByKey(container);
    return Promise.resolve();
  }

  // * a right-to-left row starts at its right edge, and its `scrollLeft` runs from 0 down to minus
  // * the overflow: everything here is measured from the inline start, and written back with the sign
  const isRTL = axis === 'x' && !!container.getBoundingClientRect && isElementRTL(container as HTMLElement);
  const sign = isRTL ? -1 : 1;
  const rectStartKey = axis === 'y' ? 'top' : (isRTL ? 'right' : 'left');
  const rectEndKey = axis === 'y' ? 'bottom' : (isRTL ? 'left' : 'right');
  const sizeKey = axis === 'y' ? 'height' : 'width';
  const scrollSizeKey = axis === 'y' ? 'scrollHeight' : 'scrollWidth';
  const elementScrollSizeKey = axis === 'y' ? 'scrollHeight' : 'offsetWidth'; // can use offsetWidth for X, since it's almost same as scrollWidth
  const scrollPositionKey = axis === 'y' ? 'scrollTop' : 'scrollLeft';

  // const { offsetTop: elementTop, offsetHeight: elementHeight } = element;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : document.body.getBoundingClientRect();

  // const transformable = container.firstElementChild as HTMLElement;

  // * what a centred scroll is about inside the element, measured once now: where it goes and what a `follow` keeps to
  const measureFocus = () => position === 'center' || position === 'nearest' ? options.getFocus?.() : undefined;
  const focus = measureFocus();
  const getPosition = (rect: DOMRect) => {
    const possibleElementPosition = (rect[rectStartKey] - containerRect[rectStartKey]) * sign;
    return getElementPosition ? getElementPosition({elementRect: rect, containerRect, elementPosition: possibleElementPosition}) : possibleElementPosition;
  };
  const elementPosition = getPosition(elementRect) + (focus?.offset ?? 0);
  const elementSize = focus ? focus.height : element[elementScrollSizeKey]; // margin is exclusive in DOMRect

  /* const containerTrueSize = containerRect[sizeKey];
  const containerNormalSize = getNormalSize ? getNormalSize({rect: containerRect}) : containerTrueSize;
  const containerSize = containerNormalSize;
  const containerSizeDifference = containerTrueSize - containerNormalSize; */
  const containerSize = getNormalSize ? getNormalSize({rect: containerRect}) : containerRect[sizeKey];

  let scrollPosition = container[scrollPositionKey] * sign;
  const scrollSize = container[scrollSizeKey];
  /* const elementPosition = element.offsetTop;
  const elementSize = element.offsetHeight;

  const scrollPosition = container[scrollPositionKey];
  const scrollSize = container[scrollSizeKey];
  const containerSize = container.offsetHeight; */

  let path!: number;

  switch(position) {
    case 'start':
      path = elementPosition - margin;
      break;
    case 'end':
      path = (elementRect[rectEndKey] /* + (elementSize - elementRect[sizeKey]) */ - containerRect[rectEndKey]) * sign + margin;
      break;
    // 'nearest' is not supported yet
    case 'nearest':
    case 'center':
      if(elementSize < containerSize) {
        path = (elementPosition + elementSize / 2) - (containerSize / 2);
      } else {
        // * by the start it falls back to (a date group the element opens), but for a part to center: the element stays
        // * what a `follow` keeps to, its part measured again on the way
        const fallback = !focus && options.fallbackToElementStartWhenCentering;
        path = (fallback && fallback !== element && isInDOM(fallback) ? getPosition(fallback.getBoundingClientRect()) : elementPosition) - margin;
      }

      break;
  }

  // where the element is aligned as asked, were the scroll free to go anywhere: what a scroll following it keeps to
  const alignedPosition = scrollPosition + path;
  const getMaxScrollPosition = () => container[scrollSizeKey] - containerSize;
  if(position === 'center' || position === 'nearest') {
    // * check if the scroll is possible at all
    const maxScrollPosition = getMaxScrollPosition();
    if((path + scrollPosition) > maxScrollPosition) {
      path = Math.max(0, maxScrollPosition - scrollPosition);
    } else if((path + scrollPosition) < 0) {
      path = Math.min(0, -scrollPosition);
    }
  }

  // where the scroll lands now (`follow`): where the element is aligned as asked, moved by as much as what it is aligned
  // by has moved in the content since the scroll started — the edge it lands by, or (centred) the middle of the part the
  // jump is about (`getFocus`) or of the element at the size it has now, and the start it falls back to once it no
  // longer fits — within what can be scrolled now
  const following = options.follow && axis === 'y';
  const getAlignedOffset = (focus: ScrollFocus) => {
    const contentTop = container.getBoundingClientRect().top - container.scrollTop;
    const rect = element.getBoundingClientRect();
    if(position === 'start') return rect.top - contentTop;
    if(position === 'end') return rect.bottom - contentTop;
    if(focus) {
      const top = rect.top - contentTop + focus.offset;
      return focus.height < containerSize ? top + (focus.height - containerSize) / 2 : top - margin;
    }

    const size = element[elementScrollSizeKey];
    if(size < containerSize) return rect.top - contentTop + (size - containerSize) / 2;
    const fallback = options.fallbackToElementStartWhenCentering;
    const start = fallback && fallback !== element && isInDOM(fallback) ? fallback.getBoundingClientRect().top : rect.top;
    return start - contentTop - margin;
  };
  // * from the same measurement as where it goes
  const startOffset = following ? getAlignedOffset(focus) : 0;
  let drift = 0;
  const getFollowedPosition = () => {
    if(isInDOM(element)) drift = getAlignedOffset(measureFocus()) - startOffset;
    return clamp(alignedPosition + drift, 0, Math.max(0, getMaxScrollPosition()));
  };
  /* switch (position) {
    case 'start':
      path = (elementPosition - margin) - scrollPosition;
      break;
    case 'end':
      path = (elementPosition + elementSize + margin) - (scrollPosition + containerSize);
      break;
    // 'nearest' is not supported yet
    case 'nearest':
    case 'center':
      path = elementSize < containerSize
        ? (elementPosition + elementSize / 2) - (scrollPosition + containerSize / 2)
        : (elementPosition - margin) - scrollPosition;
      break;
  } */

  if(Math.abs(path/*  - (margin || 0) */) < 1) {
    cancelAnimationByKey(container);
    // there already: it stays with the element all the same
    if(following) followAfterArrival(container, getFollowedPosition);
    return Promise.resolve();
  }

  let jumpToScrollPosition: number;
  if(axis === 'y') {
    if(forceDirection === undefined) {
      if(path > maxDistance) {
        jumpToScrollPosition = scrollPosition += path - maxDistance;
        path = maxDistance;
      } else if(path < -maxDistance) {
        jumpToScrollPosition = scrollPosition += path + maxDistance;
        path = -maxDistance;
      }
    }/*  else if(forceDirection === FocusDirection.Up) { // * not tested yet
      container.scrollTop = offsetTop + container.scrollTop + maxDistance;
    } else if(forceDirection === FocusDirection.Down) { // * not tested yet
      container.scrollTop = Math.max(0, offsetTop + container.scrollTop - maxDistance);
    } */
  }

  // console.log('scrollWithJs: will scroll path:', path, element);

  /* let existsTransform = 0;
  const currentTransform = transformable.style.transform;
  if(currentTransform) {
    existsTransform = parseInt(currentTransform.match(/\((.+?), (.+?), .+\)/)[2]);
    //path += existsTransform;
  } */

  if(path < 0) {
    const remainingPath = -scrollPosition;
    path = Math.max(path, remainingPath);
  } else if(path > 0) {
    const remainingPath = scrollSize - (scrollPosition + containerSize);
    path = Math.min(path, remainingPath);
  }

  const target = scrollPosition + path;
  const absPath = Math.abs(path);
  const duration = forceDuration ?? (
    MIN_JS_DURATION + (absPath / LONG_TRANSITION_MAX_DISTANCE) * (MAX_JS_DURATION - MIN_JS_DURATION)
  );
  const startAt = Date.now();

  /* transformable.classList.add('no-transition');

  const tickTransform = () => {
    const t = duration ? Math.min((Date.now() - startAt) / duration, 1) : 1;
    const currentPath = path * transition(t);

    transformable.style.transform = `translate3d(0, ${-currentPath}px, 0)`;
    container.dataset.translate = '' + -currentPath;

    const willContinue = t < 1;
    if(!willContinue) {
      fastRaf(() => {
        delete container.dataset.transform;
        container.dataset.transform = '';
        transformable.style.transform = '';
        void transformable.offsetLeft; // reflow
        transformable.classList.remove('no-transition');
        void transformable.offsetLeft; // reflow
        container[scrollPositionKey] = Math.round(target);
      });
    }

    return willContinue;
  };

  return animateSingle(tickTransform, container); */

  /* return new Promise((resolve) => {
    fastRaf(() => {
      transformable.style.transform = '';
      transformable.style.transition = '';

      setTimeout(resolve, duration);
    });
  });

  const transformableHeight = transformable.scrollHeight;
  //transformable.style.minHeight = `${transformableHeight}px`;
  */

  const transition = transitionFunction ?? (absPath < SHORT_TRANSITION_MAX_DISTANCE ? shortTransition : longTransition);
  const getProgress = () => duration ? Math.min((Date.now() - startAt) / duration, 1) : 1;
  // * where the last tick took the scroll to: the follower goes on from there, not from where the element is by the time
  // * it starts (what moved it in between is its to catch up with)
  let destination: number;
  const tick = () => {
    if(jumpToScrollPosition !== undefined) {
      container[scrollPositionKey] = jumpToScrollPosition;
      jumpToScrollPosition = undefined;
    }

    const t = getProgress();
    const value = transition(t);
    const currentPath = path * (1 - value);
    destination = following ? getFollowedPosition() : target;
    container[scrollPositionKey] = Math.round(destination - currentPath) * sign;

    return t < 1;
  };

  if(!duration || !path) {
    cancelAnimationByKey(container);
    tick();
    if(following) followAfterArrival(container, getFollowedPosition, destination);
    return Promise.resolve();
  }

  /* return new Promise((resolve) => {
    setTimeout(resolve, duration);
  }).then(() => {
    transformable.classList.add('no-transition');
    void transformable.offsetLeft; // reflow
    transformable.style.transform = '';
    transformable.style.transition = '';
    void transformable.offsetLeft; // reflow
    transformable.classList.remove('no-transition');
    void transformable.offsetLeft; // reflow
    fastRaf(() => {

      container[scrollPositionKey] = Math.round(target);
      //transformable.style.minHeight = ``;
    });

  }); */

  if(options.startCallback) {
    const distanceToEnd = scrollSize - Math.round(target + container[axis === 'y' ? 'offsetHeight' : 'offsetWidth']);
    options.startCallback({
      scrollSize,
      scrollPosition,
      distanceToEnd,
      path,
      duration,
      containerRect,
      elementRect,
      getProgress
    });
  }

  const instance = createAnimationInstance(container);
  animateSingle(tick, container, instance);
  if(following) {
    instance.deferred.then(() => {
      if(!instance.isCancelled) followAfterArrival(container, getFollowedPosition, destination);
    });
  }

  return instance.deferred;
}

/**
 * Keeps a scroll that has arrived with its element (`follow`) while the element still moves — a widget near it starting
 * as it comes into view — until it holds still for FOLLOW_SETTLE_DURATION, the person scrolls, or another scroll of the
 * container begins. `from`: where the scroll was taken to as it arrived (none: where the element is now).
 */
function followAfterArrival(container: HTMLElement, getTarget: () => number, from = getTarget()) {
  const instance = createAnimationInstance(container);
  const arrivedAt = Date.now();
  let movedAt = arrivedAt, last = from;
  const onInput = () => {
    if(getAnimationInstance(container) === instance) cancelAnimationByKey(container);
  };
  FOLLOW_INPUT_EVENTS.forEach((type) => container.addEventListener(type, onInput, {passive: true, capture: true}));
  // the keys reach the window the app is in (Document Picture-in-Picture), and follow it there
  const unbindKeys = bindActiveWindowListener((win) => win, 'keydown', onInput, {capture: true});
  instance.deferred.then(() => {
    FOLLOW_INPUT_EVENTS.forEach((type) => container.removeEventListener(type, onInput, {capture: true}));
    unbindKeys();
  });

  animateSingle(() => {
    const now = Date.now();
    const target = getTarget();
    if(target !== last) {
      last = target;
      movedAt = now;
      container.scrollTop = Math.round(target);
    }

    return now - movedAt < FOLLOW_SETTLE_DURATION && now - arrivedAt < FOLLOW_MAX_DURATION;
  }, container, instance);
}

function longTransition(t: number) {
  return 1 - ((1 - t) ** 5);
}

function shortTransition(t: number) {
  return 1 - ((1 - t) ** 3.5);
}

export {shortTransition as shortScrollTransition};

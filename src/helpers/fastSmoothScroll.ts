/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * Jolly Cobra's fastSmoothScroll slightly patched

import {dispatchHeavyAnimationEvent} from '../hooks/useHeavyAnimationCheck';
import {fastRafPromise} from './schedulers';
import {animateSingle, cancelAnimationByKey} from './animation';
import isInDOM from './dom/isInDOM';
import liteMode from './liteMode';

const MIN_JS_DURATION = 250;
const MAX_JS_DURATION = 600;
const LONG_TRANSITION_MAX_DISTANCE = 1500;
const SHORT_TRANSITION_MAX_DISTANCE = 500;

export enum FocusDirection {
  Up,
  Down,
  Static,
};

export type ScrollGetNormalSizeCallback = (options: {rect: DOMRect}) => number;
export type ScrollGetElementPositionCallback = (options: {elementRect: DOMRect, containerRect: DOMRect, elementPosition: number}) => number;
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
  transitionFunction?: (value: number) => number
};

export function fastSmoothScrollToStart(container: HTMLElement, axis: 'x') {
  return fastSmoothScroll({
    container: container,
    element: container,
    getElementPosition: () => -container.scrollLeft,
    position: 'start',
    axis: 'x'
  });
}

export default function fastSmoothScroll(options: ScrollOptions) {
  options.margin ??= 0;
  options.maxDistance ??= LONG_TRANSITION_MAX_DISTANCE;
  options.axis ??= 'y';
  // return;

  if(!liteMode.isAvailable('animations') || options.forceDuration === 0) {
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

  const rectStartKey = axis === 'y' ? 'top' : 'left';
  const rectEndKey = axis === 'y' ? 'bottom' : 'right';
  const sizeKey = axis === 'y' ? 'height' : 'width';
  const scrollSizeKey = axis === 'y' ? 'scrollHeight' : 'scrollWidth';
  const elementScrollSizeKey = axis === 'y' ? 'scrollHeight' : 'offsetWidth'; // can use offsetWidth for X, since it's almost same as scrollWidth
  const scrollPositionKey = axis === 'y' ? 'scrollTop' : 'scrollLeft';

  // const { offsetTop: elementTop, offsetHeight: elementHeight } = element;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : document.body.getBoundingClientRect();

  // const transformable = container.firstElementChild as HTMLElement;

  const possibleElementPosition = elementRect[rectStartKey] - containerRect[rectStartKey];
  const elementPosition = getElementPosition ? getElementPosition({elementRect, containerRect, elementPosition: possibleElementPosition}) : possibleElementPosition;
  const elementSize = element[elementScrollSizeKey]; // margin is exclusive in DOMRect

  const containerSize = getNormalSize ? getNormalSize({rect: containerRect}) : containerRect[sizeKey];

  let scrollPosition = container[scrollPositionKey];
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
      path = elementRect[rectEndKey] /* + (elementSize - elementRect[sizeKey]) */ - containerRect[rectEndKey] + margin;
      break;
    // 'nearest' is not supported yet
    case 'nearest':
    case 'center':
      if(elementSize < containerSize) {
        path = (elementPosition + elementSize / 2) - (containerSize / 2);
      } else {
        if(options.fallbackToElementStartWhenCentering && options.fallbackToElementStartWhenCentering !== element) {
          options.element = options.fallbackToElementStartWhenCentering;
          options.position = 'start';
          return scrollWithJs(options);
        }

        path = elementPosition - margin;
      }

      break;
  }
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

  if(Math.abs(path - (margin || 0)) < 1) {
    cancelAnimationByKey(container);
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
  const tick = () => {
    if(jumpToScrollPosition !== undefined) {
      container[scrollPositionKey] = jumpToScrollPosition;
      jumpToScrollPosition = undefined;
    }

    const t = getProgress();
    const value = transition(t);
    const currentPath = path * (1 - value);
    container[scrollPositionKey] = Math.round(target - currentPath);

    return t < 1;
  };

  if(!duration || !path) {
    cancelAnimationByKey(container);
    tick();
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

  return animateSingle(tick, container);
}

function longTransition(t: number) {
  return 1 - ((1 - t) ** 5);
}

function shortTransition(t: number) {
  return 1 - ((1 - t) ** 3.5);
}

export {shortTransition as shortScrollTransition};

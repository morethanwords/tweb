// * Jolly Cobra's fastSmoothScroll slightly patched

import { dispatchHeavyAnimationEvent } from '../hooks/useHeavyAnimationCheck';
import { fastRaf } from './schedulers';
import { animateSingle, cancelAnimationByKey } from './animation';
import rootScope from '../lib/rootScope';

const MAX_DISTANCE = 1500;
const MIN_JS_DURATION = 250;
const MAX_JS_DURATION = 600;

export enum FocusDirection {
  Up,
  Down,
  Static,
};

export default function fastSmoothScroll(
  container: HTMLElement,
  element: HTMLElement,
  position: ScrollLogicalPosition,
  margin = 0,
  maxDistance = MAX_DISTANCE,
  forceDirection?: FocusDirection,
  forceDuration?: number,
  axis: 'x' | 'y' = 'y'
) {
  //return;

  if(!rootScope.settings.animationsEnabled) {
    forceDirection = FocusDirection.Static;
  }

  if(forceDirection === FocusDirection.Static) {
    forceDuration = 0;
    return scrollWithJs(container, element, position, margin, forceDuration, axis);
    /* return Promise.resolve();

    element.scrollIntoView({ block: position });

    cancelAnimationByKey(container);
    return Promise.resolve(); */
  }

  if(axis === 'y') {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
  
    const offsetTop = elementRect.top - containerRect.top;
    if(forceDirection === undefined) {
      if(offsetTop < -maxDistance) {
        container.scrollTop += (offsetTop + maxDistance);
      } else if(offsetTop > maxDistance) {
        container.scrollTop += (offsetTop - maxDistance);
      }
    } else if(forceDirection === FocusDirection.Up) { // * not tested yet
      container.scrollTop = offsetTop + container.scrollTop + maxDistance;
    } else if(forceDirection === FocusDirection.Down) { // * not tested yet
      container.scrollTop = Math.max(0, offsetTop + container.scrollTop - maxDistance);
    }
  }

  const promise = new Promise((resolve) => {
    fastRaf(() => {
      scrollWithJs(container, element, position, margin, forceDuration, axis)
      .then(resolve);
    });
  });

  return dispatchHeavyAnimationEvent(promise);
}

function scrollWithJs(
  container: HTMLElement, element: HTMLElement, position: ScrollLogicalPosition, margin = 0, forceDuration?: number, axis: 'x' | 'y' = 'y'
) {
  const rectStartKey = axis === 'y' ? 'top' : 'left';
  const rectEndKey = axis === 'y' ? 'bottom' : 'right';
  const sizeKey = axis === 'y' ? 'height' : 'width';
  const scrollSizeKey = axis === 'y' ? 'scrollHeight' : 'scrollWidth';
  const scrollPositionKey = axis === 'y' ? 'scrollTop' : 'scrollLeft';

  //const { offsetTop: elementTop, offsetHeight: elementHeight } = element;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const elementPosition = elementRect[rectStartKey] - containerRect[rectStartKey];
  const elementSize = element[scrollSizeKey]; // margin is exclusive in DOMRect

  const containerSize = containerRect[sizeKey];

  const scrollPosition = container[scrollPositionKey];
  const scrollSize = container[scrollSizeKey];

  let path!: number;

  switch(position) {
    case 'start':
      path = elementPosition - margin;
      break;
    case 'end':
      //path = (elementTop + elementHeight + margin) - containerHeight;
      path = elementRect[rectEndKey] + (elementSize - elementRect[sizeKey]) - containerRect[rectEndKey];
      break;
    // 'nearest' is not supported yet
    case 'nearest':
    case 'center':
      path = elementSize < containerSize
        ? (elementPosition + elementSize / 2) - (containerSize / 2)
        : elementPosition - margin;
      break;
  }

  // console.log('scrollWithJs: will scroll path:', path, element);

  if(path < 0) {
    const remainingPath = -scrollPosition;
    path = Math.max(path, remainingPath);
  } else if(path > 0) {
    const remainingPath = scrollSize - (scrollPosition + containerSize);
    path = Math.min(path, remainingPath);
  }

  const target = container[scrollPositionKey] + path;
  const duration = forceDuration ?? (
    MIN_JS_DURATION + (Math.abs(path) / MAX_DISTANCE) * (MAX_JS_DURATION - MIN_JS_DURATION)
  );
  const startAt = Date.now();

  const tick = () => {
    const t = duration ? Math.min((Date.now() - startAt) / duration, 1) : 1;

    const currentPath = path * (1 - transition(t));
    container[scrollPositionKey] = Math.round(target - currentPath);
    
    return t < 1;
  };

  if(!duration) {
    cancelAnimationByKey(container);
    tick();
    return Promise.resolve();
  }

  return animateSingle(tick, container);
}

function transition(t: number) {
  return 1 - ((1 - t) ** 3.5);
}

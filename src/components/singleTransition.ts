/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../lib/rootScope";

const SetTransition = (
  element: HTMLElement, 
  className: string, 
  forwards: boolean, 
  duration: number, 
  onTransitionEnd?: () => void, 
  useRafs?: number
) => {
  const {timeout, raf} = element.dataset;
  if(timeout !== undefined) {
    clearTimeout(+timeout);
  }

  // useRafs = undefined;
  // duration = 0;

  if(raf !== undefined) {
    window.cancelAnimationFrame(+raf);
    if(!useRafs) {
      delete element.dataset.raf;
    }
  }

  // if(forwards && className && element.classList.contains(className) && !element.classList.contains('animating')) {
  //   return;
  // }

  if(useRafs && rootScope.settings.animationsEnabled && duration) {
    element.dataset.raf = '' + window.requestAnimationFrame(() => {
      delete element.dataset.raf;
      SetTransition(element, className, forwards, duration, onTransitionEnd, useRafs - 1);
    });

    return;
  }

  if(forwards && className) {
    element.classList.add(className);
  }

  const afterTimeout = () => {
    delete element.dataset.timeout;
    if(!forwards && className) {
      element.classList.remove('backwards', className);
    }

    element.classList.remove('animating');
    
    onTransitionEnd && onTransitionEnd();
  };

  if(!rootScope.settings.animationsEnabled || !duration) {
    element.classList.remove('animating', 'backwards');
    afterTimeout();
    return;
  }

  element.classList.add('animating');

  element.classList.toggle('backwards', !forwards);
  element.dataset.timeout = '' + setTimeout(afterTimeout, duration);
};

export default SetTransition;

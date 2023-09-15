/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import liteMode from '../helpers/liteMode';

const $TRANSITION_RAF = Symbol('RAF'),
  $TRANSITION_TIMEOUT = Symbol('TIMEOUT');

type SetTransitionOptions = {
  element: HTMLElement,
  className: string,
  forwards: boolean,
  duration: number,
  onTransitionEnd?: () => void,
  useRafs?: number,
  onTransitionStart?: () => void
};
const SetTransition = (options: SetTransitionOptions) => {
  const {element, className, forwards, duration, onTransitionEnd, onTransitionStart, useRafs} = options;
  const classNames = className && className.split(' ');
  const timeout: number = (element as any)[$TRANSITION_TIMEOUT];
  const raf: number = (element as any)[$TRANSITION_RAF];
  if(timeout !== undefined) {
    clearTimeout(+timeout);
  }

  // useRafs = undefined;
  // duration = 0;

  if(raf !== undefined) {
    window.cancelAnimationFrame(+raf);
    if(!useRafs) {
      delete (element as any)[$TRANSITION_RAF];
    }
  }

  // if(forwards && className && element.classList.contains(className) && !element.classList.contains('animating')) {
  //   return;
  // }

  if(useRafs && liteMode.isAvailable('animations') && duration) {
    (element as any)[$TRANSITION_RAF] = '' + window.requestAnimationFrame(() => {
      delete (element as any)[$TRANSITION_RAF];
      SetTransition({
        ...options,
        useRafs: useRafs - 1
      });
    });

    return;
  }

  if(forwards && className) {
    element.classList.add(...classNames);
  }

  const afterTimeout = () => {
    delete (element as any)[$TRANSITION_TIMEOUT];
    if(!forwards && className) {
      element.classList.remove('backwards', ...classNames);
    }

    element.classList.remove('animating');

    onTransitionEnd?.();
  };

  onTransitionStart?.();
  if(!liteMode.isAvailable('animations') || !duration) {
    element.classList.remove('animating', 'backwards');
    afterTimeout();
    return;
  }

  element.classList.add('animating');

  element.classList.toggle('backwards', !forwards);
  (element as any)[$TRANSITION_TIMEOUT] = '' + setTimeout(afterTimeout, duration);
};

export default SetTransition;

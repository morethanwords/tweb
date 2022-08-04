/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from './cancelEvent';

export default function lockTouchScroll(container: HTMLElement) {
  const onTouchMove = (e: TouchEvent) => {
    cancelEvent(e);
  };

  let lockers = 2;
  const cb = () => {
    if(!--lockers) {
      container.removeEventListener('touchmove', onTouchMove, {capture: true});
    }
  };

  container.addEventListener('touchmove', onTouchMove, {capture: true, passive: false});
  container.addEventListener('touchend', cb, {once: true});

  return cb;
}

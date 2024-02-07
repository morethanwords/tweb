/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ListenerSetter from '../listenerSetter';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import simulateEvent from './dispatchEvent';

let lastMouseDownElement: HTMLElement;
document.addEventListener('mousedown', (e) => {
  lastMouseDownElement = e.target as HTMLElement;
  // if((lastMouseDownElement as any)?.cancelMouseDown) {
  if(lastMouseDownElement?.closest('[cancel-mouse-down]')) {
    e.preventDefault();
  }
});

export function hasMouseMovedSinceDown(e: Event) {
  if(e.isTrusted && e.type === 'click' && e.target !== lastMouseDownElement) {
    return true;
  }
}

export const CLICK_EVENT_NAME: 'mousedown' /* | 'touchend' */ | 'click' = (IS_TOUCH_SUPPORTED ? 'mousedown' : 'click') as any;
export type AttachClickOptions = AddEventListenerOptions & Partial<{listenerSetter: ListenerSetter, cancelMouseDown?: boolean, touchMouseDown: boolean, ignoreMove: boolean}>;
export function attachClickEvent(elem: HTMLElement | Window, callback: (e: /* TouchEvent |  */MouseEvent) => void, options: AttachClickOptions = {}) {
  const add = options.listenerSetter ? options.listenerSetter.add(elem) : elem.addEventListener.bind(elem);
  const remove = options.listenerSetter ? options.listenerSetter.removeManual.bind(options.listenerSetter, elem) : elem.removeEventListener.bind(elem);

  options.touchMouseDown = true;
  /* if(options.touchMouseDown && CLICK_EVENT_NAME === 'touchend') {
    add('mousedown', callback, options);
  } else if(CLICK_EVENT_NAME === 'touchend') {
    const o = {...options, once: true};

    const onTouchStart = (e: TouchEvent) => {
      const onTouchMove = (e: TouchEvent) => {
        remove('touchmove', onTouchMove, o);
        remove('touchend', onTouchEnd, o);
      };

      const onTouchEnd = (e: TouchEvent) => {
        remove('touchmove', onTouchMove, o);
        callback(e);
        if(options.once) {
          remove('touchstart', onTouchStart);
        }
      };

      add('touchend', onTouchEnd, o);
      add('touchmove', onTouchMove, o);
    };

    add('touchstart', onTouchStart);
  } else {
    add(CLICK_EVENT_NAME, callback, options);
  } */

  if(options.cancelMouseDown) {
    (elem as HTMLElement).setAttribute('cancel-mouse-down', '');
    // (elem as any).cancelMouseDown = true;
  }

  if(CLICK_EVENT_NAME === 'click' && !options.ignoreMove) {
    const cb = callback;
    callback = (e) => {
      if(hasMouseMovedSinceDown(e)) {
        return;
      }

      cb(e);
    };
  }

  add(CLICK_EVENT_NAME, callback, options);

  // @ts-ignore
  return () => remove(CLICK_EVENT_NAME, callback, options);
}

// export function detachClickEvent(elem: HTMLElement | Window, callback: (e: /* TouchEvent |  */MouseEvent) => void, options?: AddEventListenerOptions) {
//   // if(CLICK_EVENT_NAME === 'touchend') {
//   //   elem.removeEventListener('touchstart', callback, options);
//   // } else {
//   elem.removeEventListener(CLICK_EVENT_NAME, callback as any, options);
//   // }
// }

export function simulateClickEvent(elem: HTMLElement) {
  simulateEvent(elem, CLICK_EVENT_NAME);
}

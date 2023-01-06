/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ListenerSetter from '../listenerSetter';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';

export default function handleScrollSideEvent(elem: HTMLElement, side: 'top' | 'bottom', callback: () => void, listenerSetter: ListenerSetter) {
  if(IS_TOUCH_SUPPORTED) {
    let lastY: number;
    const options = {passive: true};
    listenerSetter.add(elem)('touchstart', (e) => {
      if(e.touches.length > 1) {
        onTouchEnd();
        return;
      }

      lastY = e.touches[0].clientY;

      listenerSetter.add(elem)('touchmove', onTouchMove, options);
      listenerSetter.add(elem)('touchend', onTouchEnd, options);
    }, options);

    const onTouchMove = (e: TouchEvent) => {
      const clientY = e.touches[0].clientY;

      const isDown = clientY < lastY;
      if(side === 'bottom' && isDown) callback();
      else if(side === 'top' && !isDown) callback();
      lastY = clientY;
      // alert('isDown: ' + !!isDown);
    };

    const onTouchEnd = () => {
      listenerSetter.removeManual(elem, 'touchmove', onTouchMove, options);
      listenerSetter.removeManual(elem, 'touchend', onTouchEnd, options);
    };
  } else {
    listenerSetter.add(elem)('wheel', (e) => {
      const isDown = e.deltaY > 0;
      // this.log('wheel', e, isDown);
      if(side === 'bottom' && isDown) callback();
      else if(side === 'top' && !isDown) callback();
    }, {passive: true});
  }
}

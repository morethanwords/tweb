/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findUpClassName from '../helpers/dom/findUpClassName';
import sequentialDom from '../helpers/sequentialDom';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import {fastRaf} from '../helpers/schedulers';
import liteMode from '../helpers/liteMode';


declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      /**
       * To be used in solid-js as `<button use:ripple />`
       */
      ripple: true;
    }
  }
}

let rippleClickId = 0;
export default function ripple(
  elem: HTMLElement,
  callback: (id: number) => Promise<boolean | void> = () => Promise.resolve(),
  onEnd: (id: number) => void = null,
  prepend = false,
  attachListenerTo = elem
) {
  // return;
  if(elem.querySelector('.c-ripple')) return;
  elem.classList.add('rp');

  const r = document.createElement('div');
  r.classList.add('c-ripple');

  const isSquare = elem.classList.contains('rp-square');
  if(isSquare) {
    r.classList.add('is-square');
  }

  elem[prepend ? 'prepend' : 'append'](r);

  let handler: () => void;
  // let animationEndPromise: Promise<number>;
  const drawRipple = (clientX: number, clientY: number) => {
    const startTime = Date.now();
    const circle = document.createElement('div');

    const clickId = rippleClickId++;

    // console.log('ripple drawRipple');

    // const auto = elem.classList.contains('row-sortable') && !elem.classList.contains('cant-sort');
    const auto = false;
    const duration = (auto ? .3 : +window.getComputedStyle(r).getPropertyValue('--ripple-duration').replace('s', '')) * 1000;
    // console.log('ripple duration', duration);

    const _handler = handler = () => {
    // handler = () => animationEndPromise.then((duration) => {
      // console.log('ripple animation was:', duration);

      // const duration = isSquare || mediaSizes.isMobile ? 200 : 700;
      // return;
      const elapsedTime = Date.now() - startTime;
      const cb = () => {
        // console.log('ripple elapsedTime total pre-remove:', Date.now() - startTime);
        sequentialDom.mutate(() => {
          circle.remove();
        });

        onEnd?.(clickId);
      };
      if(elapsedTime < duration) {
        const delay = Math.max(duration - elapsedTime, duration / 2);
        setTimeout(() => circle.classList.add('hiding'), Math.max(delay - duration / 2, 0));

        setTimeout(cb, delay);
      } else {
        circle.classList.add('hiding');
        setTimeout(cb, duration / 2);
      }

      if(!IS_TOUCH_SUPPORTED) {
        window.removeEventListener('contextmenu', handler);
        window.removeEventListener('mousemove', handler);
      }

      handler = null;
      touchStartFired = false;
    };
    // });

    callback?.(clickId);

    /* callback().then((bad) => {
      if(bad) {
        span.remove();
        return;
      } */

    // console.log('ripple after promise', Date.now() - startTime);
    // console.log('ripple tooSlow:', tooSlow);
    /* if(tooSlow) {
        span.remove();
        return;
      } */

    fastRaf(() => {
      if(_handler !== handler) {
        return;
      }

      const rect = r.getBoundingClientRect();
      circle.classList.add('c-ripple__circle');

      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      const radius = Math.sqrt((Math.abs(clickY - rect.height / 2) + rect.height / 2) ** 2 + (Math.abs(clickX - rect.width / 2) + rect.width / 2) ** 2);
      const size = radius;

      // center of circle
      const x = clickX - size / 2;
      const y = clickY - size / 2;

      // console.log('ripple click', offsetFromCenter, size, clickX, clickY);

      circle.style.width = circle.style.height = size + 'px';
      circle.style.left = x + 'px';
      circle.style.top = y + 'px';
      circle.style.opacity = '0';

      // нижний код выполняется с задержкой
      /* animationEndPromise = new Promise((resolve) => {
          span.addEventListener('animationend', () => {
            // 713 -> 700
            resolve(((Date.now() - startTime) / 100 | 0) * 100);
          }, {once: true});
        }); */

      // нижний код не всегда включает анимацию ПРИ КЛИКЕ НА ТАЧПАД БЕЗ ТАПТИК ЭНЖИНА
      /* span.style.display = 'none';
        r.append(span);
        duration = +window.getComputedStyle(span).getPropertyValue('animation-duration').replace('s', '') * 1000;
        span.style.display = ''; */

      r.append(circle);

      void circle.offsetWidth; // force reflow
      circle.style.opacity = '';

      if(auto) {
        // window.addEventListener('mousemove', handler, {once: true, passive: true});
        handler();
      }

      // r.classList.add('active');
      // handler();
    });
    // });
  };

  const isRippleUnneeded = (e: Event) => {
    return e.target !== elem && (
      ['BUTTON', 'A'].includes((e.target as HTMLElement).tagName) ||
        findUpClassName(e.target as HTMLElement, 'c-ripple') !== r
    ) && (
      attachListenerTo === elem ||
        !findUpAsChild(e.target as HTMLElement, attachListenerTo)
    ) && !findUpClassName(e.target, 'checkbox-field');
  };

  // TODO: rename this variable
  let touchStartFired = false;
  if(IS_TOUCH_SUPPORTED) {
    const touchEnd = () => {
      handler?.();
    };

    const onTouchStart = (e: TouchEvent) => {
      if(!liteMode.isAvailable('animations')) {
        return;
      }

      // console.log('ripple touchstart', e);
      if(e.touches.length > 1 || touchStartFired || isRippleUnneeded(e)) {
        return;
      }

      // console.log('touchstart', e);
      touchStartFired = true;

      const {clientX, clientY} = e.touches[0];
      drawRipple(clientX, clientY);
      attachListenerTo.addEventListener('touchend', touchEnd, {once: true});

      window.addEventListener('touchmove', (e) => {
        e.cancelBubble = true;
        e.stopPropagation();
        touchEnd();
        attachListenerTo.removeEventListener('touchend', touchEnd);
      }, {once: true});
    };

    attachListenerTo.addEventListener('touchstart', onTouchStart, {passive: true});
    return {
      dispose: () => attachListenerTo.removeEventListener('touchstart', onTouchStart),
      element: r
    };
  } else {
    const onMouseDown = (e: MouseEvent) => {
      if(![0, 2].includes(e.button)) { // only left and right buttons
        return;
      }

      if(!liteMode.isAvailable('animations')) {
        return;
      }
      // console.log('ripple mousedown', e, e.target, findUpClassName(e.target as HTMLElement, 'c-ripple') === r);

      if(attachListenerTo.dataset.ripple === '0' || isRippleUnneeded(e)) {
        return;
      } else if(touchStartFired) {
        touchStartFired = false;
        return;
      }

      const {clientX, clientY} = e;
      drawRipple(clientX, clientY);
      window.addEventListener('mouseup', handler, {once: true, passive: true});
      window.addEventListener('contextmenu', handler, {once: true, passive: true});
    };

    attachListenerTo.addEventListener('mousedown', onMouseDown, {passive: true});
    return {
      dispose: () => attachListenerTo.removeEventListener('mousedown', onMouseDown),
      element: r
    };
  }
}

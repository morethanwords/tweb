/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {IS_MOBILE, IS_SAFARI} from '../../environment/userAgent';
import findUpClassName from './findUpClassName';
import fixSafariStickyInput from './fixSafariStickyInput';

export const IS_STICKY_INPUT_BUGGED = IS_SAFARI && IS_MOBILE && IS_TOUCH_SUPPORTED && false;

if(IS_STICKY_INPUT_BUGGED) {
  const key: 'clientY' | 'pageY' = 'clientY';
  let startY = 0;
  const o = {capture: true, passive: false};
  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];

    // console.log('touchmove y', touch[key], startY);

    const scrollable = findUpClassName(touch.target, 'scrollable-y');
    if(scrollable) {
      const y = touch[key];
      const scrolled = startY - y;

      /* if(y < startY) {
        startY = y;
      } */

      const scrollTop = scrollable.scrollTop;
      const scrollHeight = scrollable.scrollHeight;
      const clientHeight = scrollable.clientHeight;
      const nextScrollTop = scrollTop ? Math.round(scrollTop + scrollable.clientHeight + scrolled) : scrollTop + scrolled;
      // const needCancel = scrollHeight !== clientHeight ? (scrollTop && diff <= 1) || (scrollTop - diff) < 0 : true;
      const needCancel = scrollHeight === clientHeight || nextScrollTop >= scrollHeight || nextScrollTop <= 0;
      if(needCancel) {
        e.preventDefault();
      }

      // console.log('touchmove with scrollable', scrollTop, startY, scrolled, nextScrollTop, needCancel, e.cancelable);
    } else {
      e.preventDefault();

      // console.log('touchmove no scrollable', e, touch);
    }

    // if(e.target === document.documentElement || e.target === document.body) e.preventDefault();
  };

  // let el = document.createElement('div');
  // document.body.prepend(el);
  // let a = 0;

  // let hasFocus = false;
  let lastFocusOutTimeStamp = 0;
  document.addEventListener('focusin', (e) => {
    if(!(e.target as HTMLElement).classList.contains('is-sticky-input-bugged') || (e.timeStamp - lastFocusOutTimeStamp) < 50/*  && document.activeElement === input */) {
      return;
    }

    // console.log('focusin', e, e.timeStamp);

    // hasFocus = true;
    // document.body.classList.add('is-keyboard-opened');

    // el.innerText = 'focusin ' + ++a;

    /* a < 2 &&  */fixSafariStickyInput(e.target as HTMLElement);

    document.addEventListener('touchmove', onTouchMove, o);
    document.addEventListener('touchstart', (e) => {
      if(e.touches.length > 1) return;
      const touchStart = e.touches[0];

      startY = touchStart[key];
    });
  }, {passive: true});

  document.addEventListener('focusout', (e) => {
    // console.log('focusout', e, e.timeStamp);
    document.removeEventListener('touchmove', onTouchMove, o);

    lastFocusOutTimeStamp = e.timeStamp;

    // el.innerText = 'focusout ' + ++a;

    // if(hasFocus) {
    //   hasFocus = false;
    //   document.body.classList.remove('is-keyboard-opened');
    // }
  }, {passive: true});

  document.addEventListener('visibilitychange', () => {
    // console.log('window visibilitychange');
    if(document.activeElement &&
      document.activeElement.classList.contains('is-sticky-input-bugged') &&
      (document.activeElement as HTMLElement).blur) {
      fixSafariStickyInput(document.activeElement as HTMLElement);
    }

    /* blurActiveElement();
    window.scrollTo(0, 0);
    setVH(); */
  }, {passive: true});
}

export default function fixSafariStickyInputFocusing(input: HTMLElement) {
  if(!IS_STICKY_INPUT_BUGGED) return;
  input.classList.add('is-sticky-input-bugged');
}

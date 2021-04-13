/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { cancelEvent } from "../helpers/dom";
import { safeAssign } from "../helpers/object";
import { isTouchSupported } from "../helpers/touchSupport";

const getEvent = (e: TouchEvent | MouseEvent) => {
  return (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent;
};

const attachGlobalListenerTo = window;

export default class SwipeHandler {
  private element: HTMLElement;
  private onSwipe: (xDiff: number, yDiff: number) => boolean;
  private verifyTouchTarget: (evt: TouchEvent | MouseEvent) => boolean;
  private onFirstSwipe: () => void;
  private onReset: () => void;

  private hadMove = false;
  private xDown: number = null;
  private yDown: number = null;

  constructor(options: {
    element: SwipeHandler['element'],
    onSwipe: SwipeHandler['onSwipe'],
    verifyTouchTarget?: SwipeHandler['verifyTouchTarget'],
    onFirstSwipe?: SwipeHandler['onFirstSwipe'],
    onReset?: SwipeHandler['onReset'],
  }) {
    safeAssign(this, options);

    if(!isTouchSupported) {
      this.element.addEventListener('mousedown', this.handleStart, false);
      attachGlobalListenerTo.addEventListener('mouseup', this.reset);
    } else {
      this.element.addEventListener('touchstart', this.handleStart, false);
      attachGlobalListenerTo.addEventListener('touchend', this.reset);
    }
  }

  reset = (e?: Event) => {
    /* if(e) {
      cancelEvent(e);
    } */

    if(isTouchSupported) {
      attachGlobalListenerTo.removeEventListener('touchmove', this.handleMove, {capture: true});
    } else {
      attachGlobalListenerTo.removeEventListener('mousemove', this.handleMove);
      this.element.style.cursor = '';
    }

    if(this.onReset && this.hadMove) {
      this.onReset();
    }

    this.xDown = this.yDown = null;
    this.hadMove = false;
  };

  handleStart = (_e: TouchEvent | MouseEvent) => {
    const e = getEvent(_e);
    if(this.verifyTouchTarget && !this.verifyTouchTarget(_e)) {
      return this.reset();
    }

    this.xDown = e.clientX;
    this.yDown = e.clientY;

    if(isTouchSupported) {
      attachGlobalListenerTo.addEventListener('touchmove', this.handleMove, {passive: false, capture: true});
    } else {
      attachGlobalListenerTo.addEventListener('mousemove', this.handleMove, false);
    }
  };

  handleMove = (_e: TouchEvent | MouseEvent) => {
    if(this.xDown === null || this.yDown === null) {
      return this.reset();
    }

    cancelEvent(_e);

    const e = getEvent(_e);
    const xUp = e.clientX;
    const yUp = e.clientY;

    const xDiff = this.xDown - xUp;
    const yDiff = this.yDown - yUp;

    if(!this.hadMove) {
      if(!xDiff && !yDiff) {
        return;
      }

      this.hadMove = true;

      if(!isTouchSupported) {
        this.element.style.cursor = 'grabbing';
      }

      if(this.onFirstSwipe) {
        this.onFirstSwipe();
      }
    }

    // if(Math.abs(xDiff) > Math.abs(yDiff)) { /*most significant*/
    //   if(xDiff > 0) { /* left swipe */ 

    //   } else { /* right swipe */

    //   }                       
    // } else {
    //   if(yDiff > 0) { /* up swipe */ 
        
    //   } else { /* down swipe */
        
    //   }
    // }

    /* reset values */
    if(this.onSwipe(xDiff, yDiff)) {
      this.reset();
    }
  };
}

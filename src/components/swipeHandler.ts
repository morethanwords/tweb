/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from "../helpers/dom/cancelEvent";
import IS_TOUCH_SUPPORTED from "../environment/touchSupport";
import safeAssign from "../helpers/object/safeAssign";
import contextMenuController from "../helpers/contextMenuController";

const getEvent = (e: TouchEvent | MouseEvent) => {
  return (e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent;
};

const attachGlobalListenerTo = window;

let RESET_GLOBAL = false;
contextMenuController.addEventListener('toggle', (visible) => {
  RESET_GLOBAL = visible;
});

export type SwipeHandlerOptions = {
  element: SwipeHandler['element'],
  onSwipe: SwipeHandler['onSwipe'],
  verifyTouchTarget?: SwipeHandler['verifyTouchTarget'],
  onFirstSwipe?: SwipeHandler['onFirstSwipe'],
  onReset?: SwipeHandler['onReset'],
  cursor?: SwipeHandler['cursor'],
  cancelEvent?: SwipeHandler['cancelEvent'],
  listenerOptions?: SwipeHandler['listenerOptions']
};

export default class SwipeHandler {
  private element: HTMLElement;
  private onSwipe: (xDiff: number, yDiff: number, e: TouchEvent | MouseEvent) => boolean | void;
  private verifyTouchTarget: (evt: TouchEvent | MouseEvent) => boolean | Promise<boolean>;
  private onFirstSwipe: () => void;
  private onReset: () => void;
  private cursor: 'grabbing' | 'move' | 'row-resize' | 'col-resize' | 'nesw-resize' | 'nwse-resize' | 'ne-resize' | 'se-resize' | 'sw-resize' | 'nw-resize' | 'n-resize' | 'e-resize' | 's-resize' | 'w-resize' | '' = 'grabbing';
  private cancelEvent = true;
  private listenerOptions: boolean | AddEventListenerOptions = false;
  private setCursorTo: HTMLElement;

  private hadMove = false;
  private xDown: number = null;
  private yDown: number = null;

  constructor(options: SwipeHandlerOptions) {
    safeAssign(this, options);
    
    this.setCursorTo = this.element;

    this.setListeners();
  }

  public setListeners() {
    if(!IS_TOUCH_SUPPORTED) {
      this.element.addEventListener('mousedown', this.handleStart, this.listenerOptions);
      attachGlobalListenerTo.addEventListener('mouseup', this.reset);
    } else {
      this.element.addEventListener('touchstart', this.handleStart, this.listenerOptions);
      attachGlobalListenerTo.addEventListener('touchend', this.reset);
    }
  }

  public removeListeners() {
    if(!IS_TOUCH_SUPPORTED) {
      this.element.removeEventListener('mousedown', this.handleStart, this.listenerOptions);
      attachGlobalListenerTo.removeEventListener('mouseup', this.reset);
    } else {
      this.element.removeEventListener('touchstart', this.handleStart, this.listenerOptions);
      attachGlobalListenerTo.removeEventListener('touchend', this.reset);
    }
  }

  public setCursor(cursor: SwipeHandler['cursor']) {
    this.cursor = cursor;
    
    if(!IS_TOUCH_SUPPORTED && this.hadMove) {
      this.setCursorTo.style.setProperty('cursor', this.cursor, 'important');
    }
  }

  reset = (e?: Event) => {
    /* if(e) {
      cancelEvent(e);
    } */

    if(IS_TOUCH_SUPPORTED) {
      attachGlobalListenerTo.removeEventListener('touchmove', this.handleMove, {capture: true});
    } else {
      attachGlobalListenerTo.removeEventListener('mousemove', this.handleMove);
      this.setCursorTo.style.cursor = '';
    }

    if(this.onReset && this.hadMove) {
      this.onReset();
    }

    this.xDown = this.yDown = null;
    this.hadMove = false;
  };

  handleStart = async(_e: TouchEvent | MouseEvent) => {
    const e = getEvent(_e);
    if(this.verifyTouchTarget && !(await this.verifyTouchTarget(_e))) {
      return this.reset();
    }

    this.xDown = e.clientX;
    this.yDown = e.clientY;

    if(IS_TOUCH_SUPPORTED) {
      attachGlobalListenerTo.addEventListener('touchmove', this.handleMove, {passive: false, capture: true});
    } else {
      attachGlobalListenerTo.addEventListener('mousemove', this.handleMove, false);
    }
  };

  handleMove = (_e: TouchEvent | MouseEvent) => {
    if(this.xDown === null || this.yDown === null || RESET_GLOBAL) {
      this.reset();
      return;
    }

    if(this.cancelEvent) {
      cancelEvent(_e);
    }

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

      if(!IS_TOUCH_SUPPORTED) {
        this.setCursorTo.style.setProperty('cursor', this.cursor, 'important');
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
    const onSwipeResult = this.onSwipe(xDiff, yDiff, _e);
    if(onSwipeResult !== undefined && onSwipeResult) {
      this.reset();
    }
  };
}

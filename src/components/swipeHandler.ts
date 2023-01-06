/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import safeAssign from '../helpers/object/safeAssign';
import contextMenuController from '../helpers/contextMenuController';
import {Middleware} from '../helpers/middleware';
import ListenerSetter, {ListenerOptions} from '../helpers/listenerSetter';
import {attachContextMenuListener} from '../helpers/dom/attachContextMenuListener';

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
  listenerOptions?: SwipeHandler['listenerOptions'],
  setCursorTo?: HTMLElement,
  middleware?: Middleware,
  withDelay?: boolean
};

const TOUCH_MOVE_OPTIONS: ListenerOptions = {passive: false, capture: true};
const MOUSE_MOVE_OPTIONS: ListenerOptions = false as any;

export default class SwipeHandler {
  private element: HTMLElement;
  private onSwipe: (xDiff: number, yDiff: number, e: TouchEvent | MouseEvent) => boolean | void;
  private verifyTouchTarget: (evt: TouchEvent | MouseEvent) => boolean | Promise<boolean>;
  private onFirstSwipe: (e: TouchEvent | MouseEvent) => void;
  private onReset: () => void;
  private cursor: 'grabbing' | 'move' | 'row-resize' | 'col-resize' | 'nesw-resize' | 'nwse-resize' | 'ne-resize' | 'se-resize' | 'sw-resize' | 'nw-resize' | 'n-resize' | 'e-resize' | 's-resize' | 'w-resize' | '' = 'grabbing';
  private cancelEvent = true;
  private listenerOptions: boolean | AddEventListenerOptions = false;
  private setCursorTo: HTMLElement;

  private hadMove = false;
  private xDown: number = null;
  private yDown: number = null;

  private withDelay: boolean;
  private listenerSetter: ListenerSetter;

  constructor(options: SwipeHandlerOptions) {
    safeAssign(this, options);

    this.setCursorTo ??= this.element;
    this.listenerSetter = new ListenerSetter();
    this.setListeners();

    options.middleware?.onDestroy(() => {
      this.reset();
      this.removeListeners();
    });
  }

  public setListeners() {
    if(!IS_TOUCH_SUPPORTED) {
      this.listenerSetter.add(this.element)('mousedown', this.handleStart, this.listenerOptions);
      this.listenerSetter.add(attachGlobalListenerTo)('mouseup', this.reset);
    } else {
      if(this.withDelay) {
        attachContextMenuListener(this.element, this.handleStart, this.listenerSetter);
      } else {
        this.listenerSetter.add(this.element)('touchstart', this.handleStart, this.listenerOptions);
      }

      this.listenerSetter.add(attachGlobalListenerTo)('touchend', this.reset);
    }
  }

  public removeListeners() {
    this.listenerSetter.removeAll();
  }

  public setCursor(cursor: SwipeHandler['cursor'] = '') {
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
      this.listenerSetter.removeManual(attachGlobalListenerTo, 'touchmove', this.handleMove, TOUCH_MOVE_OPTIONS);
    } else {
      this.listenerSetter.removeManual(attachGlobalListenerTo, 'mousemove', this.handleMove, MOUSE_MOVE_OPTIONS);
      this.setCursorTo.style.cursor = '';
    }

    if(this.hadMove) {
      this.onReset?.();
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
      this.listenerSetter.add(attachGlobalListenerTo)('touchmove', this.handleMove, TOUCH_MOVE_OPTIONS);
    } else {
      this.listenerSetter.add(attachGlobalListenerTo)('mousemove', this.handleMove, MOUSE_MOVE_OPTIONS);
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

      this.onFirstSwipe?.(_e);
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

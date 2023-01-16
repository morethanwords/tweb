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
import ListenerSetter, {Listener, ListenerOptions} from '../helpers/listenerSetter';
import {attachContextMenuListener} from '../helpers/dom/attachContextMenuListener';
import pause from '../helpers/schedulers/pause';
import deferredPromise from '../helpers/cancellablePromise';

type E = {
  clientX: number,
  clientY: number,
  target: EventTarget,
  button?: number
};

type EE = E | (Exclude<E, 'clientX' | 'clientY'> & {
  touches: E[]
});

const getEvent = (e: EE) => {
  return 'touches' in e ? e.touches[0] : e;
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
  onStart?: SwipeHandler['onStart'],
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
  private onSwipe: (xDiff: number, yDiff: number, e: EE) => boolean | void;
  private verifyTouchTarget: (evt: EE) => boolean | Promise<boolean>;
  private onFirstSwipe: (e: EE) => void;
  private onReset: () => void;
  private onStart: () => void;
  private cursor: 'grabbing' | 'move' | 'row-resize' | 'col-resize' | 'nesw-resize' | 'nwse-resize' | 'ne-resize' | 'se-resize' | 'sw-resize' | 'nw-resize' | 'n-resize' | 'e-resize' | 's-resize' | 'w-resize' | '' = 'grabbing';
  private cancelEvent = true;
  private listenerOptions: boolean | AddEventListenerOptions = false;
  private setCursorTo: HTMLElement;

  private isMouseDown: boolean;
  private tempId: number;

  private hadMove: boolean;
  private eventUp: E;
  private xDown: number;
  private yDown: number;
  private xAdded: number;
  private yAdded: number;

  private withDelay: boolean;
  private listenerSetter: ListenerSetter;

  constructor(options: SwipeHandlerOptions) {
    safeAssign(this, options);

    this.setCursorTo ??= this.element;
    this.listenerSetter = new ListenerSetter();
    this.setListeners();

    this.resetValues();
    this.tempId = 0;

    options.middleware?.onDestroy(() => {
      this.reset();
      this.removeListeners();
    });
  }

  public setListeners() {
    if(!IS_TOUCH_SUPPORTED) {
      // @ts-ignore
      this.listenerSetter.add(this.element)('mousedown', this.handleStart, this.listenerOptions);
      this.listenerSetter.add(attachGlobalListenerTo)('mouseup', this.reset);
    } else {
      if(this.withDelay) {
        attachContextMenuListener(this.element, (e) => {
          cancelEvent(e);
          // @ts-ignore
          this.handleStart(e);
        }, this.listenerSetter);
      } else {
        // @ts-ignore
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

  public add(x: number, y: number) {
    this.xAdded = x;
    this.yAdded = y;
    this.handleMove({
      clientX: this.eventUp.clientX,
      clientY: this.eventUp.clientY,
      target: this.eventUp.target
    });
  }

  protected resetValues() {
    ++this.tempId;
    this.hadMove = false;
    this.xAdded = this.yAdded = 0;
    this.xDown =
      this.yDown =
      this.eventUp =
      this.isMouseDown =
      undefined;
  }

  protected reset = (e?: Event) => {
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

    this.resetValues();
  };

  protected handleStart = async(_e: EE) => {
    if(this.isMouseDown) {
      return;
    }

    const e = getEvent(_e);
    if(Math.max(0, e.button ?? 0) !== 0) {
      return;
    }

    if(this.verifyTouchTarget && !(await this.verifyTouchTarget(_e))) {
      return this.reset();
    }

    const tempId = ++this.tempId;
    this.isMouseDown = true;

    if(this.withDelay && !IS_TOUCH_SUPPORTED) {
      const options = {...MOUSE_MOVE_OPTIONS, once: true};
      const deferred = deferredPromise<void>();
      const cb = () => deferred.resolve();
      const listener = this.listenerSetter.add(attachGlobalListenerTo)('mousemove', cb, options) as any as Listener;

      await Promise.race([
        pause(300),
        deferred
      ]);

      deferred.resolve();
      this.listenerSetter.remove(listener);

      if(this.tempId !== tempId) {
        return;
      }
    }

    this.xDown = e.clientX;
    this.yDown = e.clientY;
    this.eventUp = e;

    if(IS_TOUCH_SUPPORTED) {
      // @ts-ignore
      this.listenerSetter.add(attachGlobalListenerTo)('touchmove', this.handleMove, TOUCH_MOVE_OPTIONS);
    } else {
      // @ts-ignore
      this.listenerSetter.add(attachGlobalListenerTo)('mousemove', this.handleMove, MOUSE_MOVE_OPTIONS);
    }

    if(this.onStart) {
      this.onStart();

      // have to initiate move instantly
      this.hadMove = true;
      this.handleMove(e);
    }
  };

  protected handleMove = (_e: EE) => {
    if(this.xDown === undefined || this.yDown === undefined || RESET_GLOBAL) {
      this.reset();
      return;
    }

    if(this.cancelEvent) {
      cancelEvent(_e as any);
    }

    const e = this.eventUp = getEvent(_e);
    const xUp = e.clientX;
    const yUp = e.clientY;

    const xDiff = xUp - this.xDown + this.xAdded;
    const yDiff = yUp - this.yDown + this.yAdded;

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

    const onSwipeResult = this.onSwipe(xDiff, yDiff, _e);
    if(onSwipeResult !== undefined && onSwipeResult) {
      this.reset();
    }
  };
}

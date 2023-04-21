/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * zoom part from WebZ
// * https://github.com/Ajaxy/telegram-tt/blob/069f4f5b2f2c7c22529ccced876842e7f9cb81f4/src/util/captureEvents.ts

import cancelEvent from '../helpers/dom/cancelEvent';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import safeAssign from '../helpers/object/safeAssign';
import contextMenuController from '../helpers/contextMenuController';
import {Middleware} from '../helpers/middleware';
import ListenerSetter, {Listener, ListenerOptions} from '../helpers/listenerSetter';
import {attachContextMenuListener} from '../helpers/dom/attachContextMenuListener';
import pause from '../helpers/schedulers/pause';
import deferredPromise from '../helpers/cancellablePromise';
import clamp from '../helpers/number/clamp';
import debounce from '../helpers/schedulers/debounce';
import {logger} from '../lib/logger';
import isSwipingBackSafari from '../helpers/dom/isSwipingBackSafari';
import windowSize from '../helpers/windowSize';

type E = {
  clientX: number,
  clientY: number,
  target: EventTarget,
  button?: number,
  type?: string
};

type EE = E | (Exclude<E, 'clientX' | 'clientY'> & {
  touches: E[]
});

const getEvent = (e: EE) => {
  return 'touches' in e ? e.touches[0] : e;
};

function getDistance(a: Touch, b?: Touch) {
  if(!b) return 0;
  return Math.hypot((b.pageX - a.pageX), (b.pageY - a.pageY));
}

function getTouchCenter(a: Touch, b: Touch) {
  return {
    x: (a.pageX + b.pageX) / 2,
    y: (a.pageY + b.pageY) / 2
  };
}

const attachGlobalListenerTo = document;

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
  onZoom?: SwipeHandler['onZoom'],
  onDrag?: SwipeHandler['onDrag'],
  onDoubleClick?: SwipeHandler['onDoubleClick'],
  cursor?: SwipeHandler['cursor'],
  cancelEvent?: SwipeHandler['cancelEvent'],
  listenerOptions?: SwipeHandler['listenerOptions'],
  setCursorTo?: HTMLElement,
  middleware?: Middleware,
  withDelay?: boolean,
  minZoom?: number,
  maxZoom?: number
};

const TOUCH_MOVE_OPTIONS: ListenerOptions = {passive: false};
const MOUSE_MOVE_OPTIONS: ListenerOptions = false as any;
const WHEEL_OPTIONS: ListenerOptions = {capture: true, passive: false};

export type ZoomDetails = {
  zoom?: number;
  zoomFactor?: number;
  zoomAdd?: number;
  initialCenterX: number;
  initialCenterY: number;
  dragOffsetX: number;
  dragOffsetY: number;
  currentCenterX: number;
  currentCenterY: number;
};

export default class SwipeHandler {
  private element: HTMLElement;
  private onSwipe: (xDiff: number, yDiff: number, e: EE, cancelDrag?: (x: boolean, y: boolean) => void) => boolean | void;
  private verifyTouchTarget: (evt: EE) => boolean | Promise<boolean>;
  private onFirstSwipe: (e: EE) => void;
  private onReset: (e?: Event) => void;
  private onStart: () => void;
  private onZoom: (details: ZoomDetails) => void;
  private onDrag: (e: EE, captureEvent: E, details: {dragOffsetX: number, dragOffsetY: number}, cancelDrag: (x: boolean, y: boolean) => void) => void;
  private onDoubleClick: (details: {centerX: number, centerY: number}) => void;
  private cursor: 'grabbing' | 'move' | 'row-resize' | 'col-resize' | 'nesw-resize' | 'nwse-resize' | 'ne-resize' | 'se-resize' | 'sw-resize' | 'nw-resize' | 'n-resize' | 'e-resize' | 's-resize' | 'w-resize' | '';
  private cancelEvent: boolean;
  private listenerOptions: ListenerOptions;
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

  private initialDistance: number;
  private initialTouchCenter: ReturnType<typeof getTouchCenter>;
  private initialDragOffset: {x: number, y: number};
  private isDragCanceled: {x: boolean, y: boolean};
  private wheelZoom: number;
  private releaseWheelDrag: ReturnType<typeof debounce<(e: Event) => void>>;
  private releaseWheelZoom: ReturnType<typeof debounce<(e: Event) => void>>;

  private log: ReturnType<typeof logger>;

  constructor(options: SwipeHandlerOptions) {
    safeAssign(this, options);

    this.log = logger('SWIPE-HANDLER');
    this.cursor ??= 'grabbing';
    this.cancelEvent ??= true;
    // this.listenerOptions ??= false as any;
    this.listenerOptions ??= TOUCH_MOVE_OPTIONS;

    this.setCursorTo ??= this.element;
    this.listenerSetter = new ListenerSetter();
    this.setListeners();

    this.resetValues();
    this.tempId = 0;

    options.middleware?.onDestroy(() => {
      this.reset();
      this.removeListeners();
    });

    this.releaseWheelDrag = debounce(this.reset, 150, false);
    this.releaseWheelZoom = debounce(this.reset, 150, false);
  }

  public setListeners() {
    if(!IS_TOUCH_SUPPORTED) {
      // @ts-ignore
      this.listenerSetter.add(this.element)('mousedown', this.handleStart, this.listenerOptions);
      this.listenerSetter.add(attachGlobalListenerTo)('mouseup', this.reset);

      if(this.onZoom || this.onDoubleClick) {
        this.listenerSetter.add(this.element)('wheel', this.handleWheel, WHEEL_OPTIONS);
      }
    } else {
      if(this.withDelay) {
        attachContextMenuListener({
          element: this.element,
          callback: (e) => {
            cancelEvent(e);
            // @ts-ignore
            this.handleStart(e);
          },
          listenerSetter: this.listenerSetter,
          listenerOptions: this.listenerOptions
        });
      } else {
        // @ts-ignore
        this.listenerSetter.add(this.element)('touchstart', this.handleStart, this.listenerOptions);
      }

      if(this.onDoubleClick) {
        this.listenerSetter.add(this.element)('dblclick', (e) => {
          this.onDoubleClick({centerX: e.pageX, centerY: e.pageY});
        });
      }

      this.listenerSetter.add(attachGlobalListenerTo)('touchend', this.reset);
    }
  }

  public removeListeners() {
    this.log('remove listeners');
    this.reset();
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

    if(this.onZoom) {
      this.initialDistance = 0;
      this.initialTouchCenter = {
        x: windowSize.width / 2,
        y: windowSize.height / 2
      };
      this.initialDragOffset = {x: 0, y: 0};
      this.isDragCanceled = {x: false, y: false};
      this.wheelZoom = 1;
    }
  }

  public reset = (e?: Event) => {
    this.log('reset');
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
      this.onReset?.(e);
    }

    this.releaseWheelDrag?.clearTimeout();
    this.releaseWheelZoom?.clearTimeout();

    this.resetValues();
  };

  protected setHadMove(_e: EE) {
    if(!this.hadMove) {
      this.log('had move');
      this.hadMove = true;
      this.setCursorTo.style.setProperty('cursor', this.cursor, 'important');
      this.onFirstSwipe?.(_e);
    }
  }

  protected dispatchOnSwipe(...args: Parameters<SwipeHandlerOptions['onSwipe']>) {
    const onSwipeResult = this.onSwipe(...args);
    if(onSwipeResult !== undefined && onSwipeResult) {
      this.reset();
    }
  }

  protected handleStart = async(_e: EE) => {
    this.log('start');

    if(this.isMouseDown) {
      const touches = (_e as any as TouchEvent).touches;
      if(touches?.length === 2) {
        this.initialDistance = getDistance(touches[0], touches[1]);
        this.initialTouchCenter = getTouchCenter(touches[0], touches[1]);
      }

      return;
    }

    const e = getEvent(_e);
    if(![0, 1].includes(Math.max(0, e.button ?? 0))) {
      return;
    }

    if(e.button === 1) {
      cancelEvent(_e as any);
    }

    if(isSwipingBackSafari(_e as any)) {
      return;
    }

    const tempId = ++this.tempId;

    const verifyResult = this.verifyTouchTarget?.(_e);
    if(verifyResult !== undefined) {
      let result: any;
      if(verifyResult instanceof Promise) {
        // const tempId = this.tempId;
        result = await verifyResult;

        if(this.tempId !== tempId) {
          return;
        }
      } else {
        result = verifyResult;
      }

      if(!result) {
        return this.reset();
      }
    }

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

    if(this.releaseWheelDrag?.isDebounced() || this.releaseWheelZoom?.isDebounced()) {
      return;
    }

    this.log('move');

    const e = this.eventUp = getEvent(_e);
    const xUp = e.clientX;
    const yUp = e.clientY;

    const xDiff = xUp - this.xDown + this.xAdded;
    const yDiff = yUp - this.yDown + this.yAdded;

    if(!this.hadMove) {
      if(!xDiff && !yDiff) {
        return;
      }

      this.setHadMove(_e);
    }

    const touches = (_e as any as TouchEvent).touches;
    if(this.onZoom && this.initialDistance > 0 && touches.length === 2) {
      const endDistance = getDistance(touches[0], touches[1]);
      const touchCenter = getTouchCenter(touches[0], touches[1]);
      const dragOffsetX = touchCenter.x - this.initialTouchCenter.x;
      const dragOffsetY = touchCenter.y - this.initialTouchCenter.y;
      const zoomFactor = endDistance / this.initialDistance;
      const details: ZoomDetails = {
        zoomFactor,
        initialCenterX: this.initialTouchCenter.x,
        initialCenterY: this.initialTouchCenter.y,
        dragOffsetX,
        dragOffsetY,
        currentCenterX: touchCenter.x,
        currentCenterY: touchCenter.y
      };

      this.onZoom(details);
    }

    this.dispatchOnSwipe(xDiff, yDiff, _e);
  };

  protected handleWheel = (e: WheelEvent) => {
    if(!this.hadMove && this.verifyTouchTarget) {
      const result = this.verifyTouchTarget(e);
      if(result !== undefined && !result) {
        this.reset(e);
        return;
      }
    }

    cancelEvent(e);

    this.log('wheel');

    if(this.onDoubleClick && Object.is(e.deltaX, -0) && Object.is(e.deltaY, -0) && e.ctrlKey) {
      this.onWheelCapture(e);
      this.onDoubleClick({centerX: e.pageX, centerY: e.pageY});
      this.reset();
      return;
    }

    const metaKeyPressed = e.metaKey || e.ctrlKey || e.shiftKey;
    if(metaKeyPressed) {
      // * fix zooming while dragging is in inertia
      if(this.releaseWheelDrag?.isDebounced()) {
        this.reset();
      }

      this.onWheelZoom(e);
    } else {
      this.handleWheelDrag(e);
    }
  };

  protected handleWheelDrag = (e: WheelEvent) => {
    this.log('wheel drag');

    this.onWheelCapture(e);
    // Ignore wheel inertia if drag is canceled in this direction
    if(!this.isDragCanceled.x || Math.sign(this.initialDragOffset.x) === Math.sign(e.deltaX)) {
      this.initialDragOffset.x -= e.deltaX;
    }
    if(!this.isDragCanceled.y || Math.sign(this.initialDragOffset.y) === Math.sign(e.deltaY)) {
      this.initialDragOffset.y -= e.deltaY;
    }
    const {x, y} = this.initialDragOffset;
    this.releaseWheelDrag(e);
    this.dispatchOnSwipe(x, y, e, (dx, dy) => {
      this.isDragCanceled = {x: dx, y: dy};
    });
  };

  protected onWheelCapture = (e: WheelEvent) => {
    if(this.hadMove) return;
    this.log('wheel capture');
    this.handleStart(e);
    this.setHadMove(e);
    this.initialTouchCenter = {x: e.x, y: e.y};
  };

  protected onWheelZoom = (e: WheelEvent) => {
    if(!this.onZoom) return;
    this.log('wheel zoom');
    this.onWheelCapture(e);
    const dragOffsetX = e.x - this.initialTouchCenter.x;
    const dragOffsetY = e.y - this.initialTouchCenter.y;
    const delta = clamp(e.deltaY, -25, 25);
    this.wheelZoom -= delta * 0.01;
    const details: ZoomDetails = {
      zoomAdd: this.wheelZoom - 1,
      initialCenterX: this.initialTouchCenter.x,
      initialCenterY: this.initialTouchCenter.y,
      dragOffsetX,
      dragOffsetY,
      currentCenterX: e.x,
      currentCenterY: e.y
    };
    this.onZoom(details);
    this.releaseWheelZoom(e);
  }
}

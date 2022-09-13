/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import EventListenerBase from './eventListenerBase';

const FOCUS_EVENT_NAME = IS_TOUCH_SUPPORTED ? 'touchstart' : 'mousemove';
const DO_NOT_IDLE = false;

export class IdleController extends EventListenerBase<{
  change: (idle: boolean) => void
}> {
  private _isIdle: boolean;

  private focusPromise: Promise<void>;
  private focusResolve: () => void;

  constructor() {
    super();

    this._isIdle = true;
    this.focusPromise = Promise.resolve();
    this.focusResolve = () => {};

    window.addEventListener('blur', () => {
      this.isIdle = true;

      window.addEventListener('focus', () => {
        this.isIdle = false;
      }, {once: true});
    });

    // * Prevent setting online after reloading page
    window.addEventListener(FOCUS_EVENT_NAME, () => {
      this.isIdle = false;
    }, {once: true, passive: true});

    this.addEventListener('change', (idle) => {
      if(idle) {
        this.focusPromise = new Promise((resolve) => {
          this.focusResolve = resolve;
        });
      } else {
        this.focusResolve();
      }
    });
  }

  public getFocusPromise() {
    return this.focusPromise;
  }

  public get isIdle() {
    return this._isIdle;
  }

  public set isIdle(value: boolean) {
    if(this._isIdle === value) {
      return;
    }

    if(DO_NOT_IDLE && value) {
      return;
    }

    this._isIdle = value;
    this.dispatchEvent('change', value);
  }
}

const idleController = new IdleController();
export default idleController;

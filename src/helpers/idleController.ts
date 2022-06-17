/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_TOUCH_SUPPORTED from "../environment/touchSupport";
import EventListenerBase from "./eventListenerBase";

const FOCUS_EVENT_NAME = IS_TOUCH_SUPPORTED ? 'touchstart' : 'mousemove';

export class IdleController extends EventListenerBase<{
  change: (idle: boolean) => void
}> {
  public idle = {
    isIDLE: true,
    deactivated: false,
    focusPromise: Promise.resolve(),
    focusResolve: () => {}
  };

  constructor() {
    super();

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
        this.idle.focusPromise = new Promise((resolve) => {
          this.idle.focusResolve = resolve;
        });
      } else {
        this.idle.focusResolve();
      }
    });
  }

  public set isIdle(value: boolean) {
    if(this.idle.isIDLE === value) {
      return;
    }

    this.idle.isIDLE = value;
    this.dispatchEvent('change', value);
  }
}

const idleController = new IdleController();
export default idleController;

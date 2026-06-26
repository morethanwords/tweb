import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import EventListenerBase from '@helpers/eventListenerBase';
import {IS_PREVIEW} from '@config/debug';
import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

const FOCUS_EVENT_NAME = IS_TOUCH_SUPPORTED ? 'touchstart' : 'mousemove';
const DO_NOT_IDLE = IS_PREVIEW; // the preview window is never focused — don't let it look idle

export class IdleController extends EventListenerBase<{
  change: (idle: boolean) => void
}> {
  private _isIdle: boolean;

  private focusPromise: Promise<void>;
  private focusResolve: () => void;

  private boundWindow: Window;
  private onBlur = () => {
    this.isIdle = true;
  };
  private onActive = () => {
    this.isIdle = false;
  };

  constructor() {
    super();

    this._isIdle = !DO_NOT_IDLE;
    this.focusPromise = Promise.resolve();
    this.focusResolve = () => {};

    // Track blur/focus/activity on whichever window the app currently lives in — the tab, or the
    // Document PiP window while popped out. Bound to the MAIN window only, the app would look idle the
    // instant the user focuses the PiP (the tab blurs) and pause every animation (media spoilers go
    // blank); and PiP mouse activity would never reach it to wake it back up.
    this.bindWindow(getAppWindow(), false);
    onAppWindowChange((win) => this.bindWindow(win, true));

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

  private bindWindow(win: Window, isSwitch: boolean) {
    const prev = this.boundWindow;
    if(prev) {
      prev.removeEventListener('blur', this.onBlur);
      prev.removeEventListener('focus', this.onActive);
      prev.removeEventListener(FOCUS_EVENT_NAME, this.onActive);
    }

    this.boundWindow = win;
    win.addEventListener('blur', this.onBlur);
    win.addEventListener('focus', this.onActive);
    // * Prevent setting online after reloading page — wake on the first activity in this window
    win.addEventListener(FOCUS_EVENT_NAME, this.onActive, {once: true, passive: true});

    // Moving the app INTO a window (PiP pop-in/out) is itself active use of that window — wake up so
    // animations keep playing even though the window we left has just blurred.
    if(isSwitch) {
      this.isIdle = false;
    }
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

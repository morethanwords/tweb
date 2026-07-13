import {MOUNT_CLASS_TO} from '@config/debug';
import {IS_WORKER} from '@helpers/context';
import createUnifiedSignal from '@helpers/solid/createUnifiedSignal';
import {getAppWindow, onAppWindowChange} from '@helpers/appWindow';

export class WindowSize {
  private _width: ReturnType<typeof createUnifiedSignal<number>>;
  private _height: ReturnType<typeof createUnifiedSignal<number>>;
  // private rAF: number;
  private viewport: VisualViewport | Window;
  private set: () => void;

  constructor() {
    if(IS_WORKER) {
      return;
    }

    this._width = createUnifiedSignal();
    this._height = createUnifiedSignal();

    this.set = () => this.setDimensions();

    // Bind to the active app window (the tab, or the Document PiP window while the client is popped
    // out). Re-bind when it flips so resize events and dimensions come from whichever window the app
    // currently lives in.
    this.bindViewport(getAppWindow());
    onAppWindowChange((win) => this.bindViewport(win));
  }

  private bindViewport(win: Window) {
    this.viewport?.removeEventListener('resize', this.set);
    this.viewport = /* 'visualViewport' in win ? win.visualViewport :  */win;
    this.viewport.addEventListener('resize', this.set);
    this.set();
  }

  private setDimensions() {
    const w = this.viewport;
    this._width((w as VisualViewport).width || (w as Window).innerWidth);
    this._height((w as VisualViewport).height || (w as Window).innerHeight);
  }

  public get width() {
    return this._width();
  }

  public get height() {
    return this._height();
  }
}

const windowSize = new WindowSize();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.windowSize = windowSize);
export default windowSize;

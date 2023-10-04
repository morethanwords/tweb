/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import {IS_WORKER} from './context';
import createUnifiedSignal from './solid/createUnifiedSignal';

export class WindowSize {
  private _width: ReturnType<typeof createUnifiedSignal<number>>;
  private _height: ReturnType<typeof createUnifiedSignal<number>>;
  // private rAF: number;
  private viewport: VisualViewport | Window;

  constructor() {
    if(IS_WORKER) {
      return;
    }

    this._width = createUnifiedSignal();
    this._height = createUnifiedSignal();

    this.viewport = /* 'visualViewport' in window ? window.visualViewport :  */window;
    const set = () => {
      this.setDimensions();

      // if(this.width === undefined) {
      //   this.setDimensions();
      //   return;
      // }

      // if(this.rAF) window.cancelAnimationFrame(this.rAF);
      // this.rAF = window.requestAnimationFrame(() => {
      //   this.rAF = 0;

      //   batch(() => {
      //     this.setDimensions();
      //   });
      // });
    };
    this.viewport.addEventListener('resize', set);
    set();
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

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import {IS_WORKER} from './context';

export class WindowSize {
  public width: number;
  public height: number;

  constructor() {
    if(IS_WORKER) {
      return;
    }

    const w = 'visualViewport' in window ? window.visualViewport : window;
    const set = () => {
      this.width = w.width || (w as any as Window).innerWidth;
      this.height = w.height || (w as any as Window).innerHeight;
    };
    w.addEventListener('resize', set);
    set();
  }
}

const windowSize = new WindowSize();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.windowSize = windowSize);
export default windowSize;

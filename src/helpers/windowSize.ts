/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IS_WORKER } from "./context";

export class WindowSize {
  public width: number;
  public height: number;

  constructor() {
    if(IS_WORKER) {
      return;
    }
    
    // @ts-ignore
    const w: any = 'visualViewport' in window ? window.visualViewport : window;
    const set = () => {
      this.width = w.width || w.innerWidth;
      this.height = w.height || w.innerHeight;
    };
    w.addEventListener('resize', set);
    set();
  }
}

const windowSize = new WindowSize();
export default windowSize;

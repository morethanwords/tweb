/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import noop from '../helpers/noop';
import safeAssign from '../helpers/object/safeAssign';
import {LottieAssetName} from '../lib/rlottie/lottieLoader';
import RLottieIcon, {RLottieIconItemPartOptions, RLottieIconItemPart} from '../lib/rlottie/rlottieIcon';
import {RLottieColor} from '../lib/rlottie/rlottiePlayer';

export type SuperRLottieIconAddItemOptions = {name: LottieAssetName, parts: RLottieIconItemPartOptions};
export type SuperRLottieIconGetInfoResult = RLottieIconItemPart;
export class SuperRLottieIcon<Options extends {
  PartState: any,
  ColorState?: any,
  Items?: {
    name: string
  }[]
}> extends RLottieIcon {
  protected getPart: (state: Options['PartState'], prevState?: Options['PartState']) => SuperRLottieIconGetInfoResult;
  protected getColor?: (state: Options['ColorState'], prevState?: Options['ColorState']) => RLottieColor;

  protected partState: Options['PartState'];
  protected colorState: Options['ColorState'];
  protected loaded: boolean;

  constructor(options: {
    width: number,
    height: number,
    skipAnimation?: boolean,
    getPart: (state: Options['PartState'], prevState?: Options['PartState']) => SuperRLottieIconGetInfoResult,
    getColor?: (state: Options['ColorState'], prevState?: Options['ColorState']) => RLottieColor,
  }) {
    super({
      width: options.width,
      height: options.height
    });

    safeAssign(this, options);

    // hook the first call
    /* const originalFunction = this.setState.bind(this);
    this.setState = (partState, colorState) => {
      this.setState = originalFunction;
      this.load(partState, colorState);
      return originalFunction(partState, colorState);
    }; */
  }

  public load(partState: Options['PartState'], colorState?: Options['ColorState']) {
    if(this.loaded) {
      return this.loadPromise;
    }

    this.loaded = true;
    this.partState = partState;
    this.colorState = colorState;

    const part = this.getPart(partState);
    const color = colorState !== undefined && this.getColor && this.getColor(colorState);

    const item = part.item;
    item.initFrame = part.endFrame;
    item.color = color;

    const promises = [...this.items.values()].map((item) => item.load());
    return Promise.all(promises).then(noop);
  }

  /**
   * Will redirect setting color state to part callback to synchronize the rendering
   */
  public setState(partState: Options['PartState'], colorState?: Options['ColorState'], partCallback?: () => void) {
    if(!this.loaded) this.load(partState, colorState);

    let changedPartState = false, changedColorState = false;
    if(partState !== undefined) changedPartState = this.setPartState(partState, colorState, partCallback);
    else if(colorState !== undefined) changedColorState = this.setColorState(colorState);

    return changedPartState || changedColorState;
  }

  public setPartState(state: Options['PartState'], colorState?: Options['ColorState'], callback?: () => void) {
    const {partState: prevState} = this;
    if(prevState === state) {
      return colorState !== undefined ? this.setColorState(colorState) : false;
    }

    if(colorState !== undefined) {
      this.setColorState(colorState, false);
    }

    this.partState = state;

    const part = this.getPart(state, prevState);
    part.play(callback);

    return true;
  }

  public setColorState(state: Options['ColorState'], renderIfPaused = true) {
    const {colorState: prevState} = this;
    if(prevState === state || !this.getColor) {
      return false;
    }

    this.colorState = state;

    const item = this.getItem();
    const color = this.getColor(state, prevState);
    const invoke = () => {
      item.player.setColor(color, renderIfPaused);
    };

    if(item.player) {
      invoke();
    } else {
      item.onLoadForColor = invoke;
    }

    return true;
  }

  public destroy() {
    this.items.forEach((item) => {
      item.loadPromise.then(() => {
        item.player.remove();
      });
    });
  }
}

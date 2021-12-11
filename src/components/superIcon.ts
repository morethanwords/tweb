import noop from "../helpers/noop";
import { safeAssign } from "../helpers/object";
import { LottieAssetName } from "../lib/rlottie/lottieLoader";
import RLottieIcon, { RLottieIconItemPartOptions, RLottieIconItemPart } from "../lib/rlottie/rlottieIcon";
import { RLottieColor } from "../lib/rlottie/rlottiePlayer";

export type SuperRLottieIconAddItemOptions = {name: LottieAssetName, parts: RLottieIconItemPartOptions};
export type SuperRLottieIconGetInfoResult = RLottieIconItemPart;
export class SuperRLottieIcon<Options extends {
  PartState: any,
  ColorState?: any,
}> extends RLottieIcon {
  protected getPart: (state: Options['PartState'], prevState?: Options['PartState']) => SuperRLottieIconGetInfoResult;
  protected getColor?: (state: Options['ColorState'], prevState?: Options['ColorState']) => RLottieColor;

  protected partState: Options['PartState'];
  protected colorState: Options['ColorState'];
  protected loaded: boolean;

  constructor(options: {
    width: number,
    height: number,
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

    const promises = [...this.items.values()].map(item => item.load());
    return Promise.all(promises).then(noop);
  }

  public setState(partState: Options['PartState'], colorState?: Options['ColorState']) {
    if(!this.loaded) this.load(partState, colorState);
    if(partState !== undefined) this.setPartState(partState);
    if(colorState !== undefined && this.getColor) this.setColorState(colorState);
  }

  public setPartState(state: Options['PartState']) {
    const {partState: prevState} = this;
    if(prevState === state) {
      return;
    }

    this.partState = state;

    const part = this.getPart(state, prevState);
    part.play();
  }

  public setColorState(state: Options['ColorState']) {
    const {colorState: prevState} = this;
    if(prevState === state) {
      return;
    }

    this.colorState = state;
    
    const item = this.getItem();
    if(item.player) {
      const color = this.getColor(state, prevState);
      item.player.setColor(color);
    }
  }

  public destroy() {
    this.items.forEach(item => {
      item.loadPromise.then(() => {
        item.player.remove();
      });
    });
  }
}

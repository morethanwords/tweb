import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import safeAssign from '@helpers/object/safeAssign';
import lottieLoader, {LottieAssetName} from '@lib/lottie/lottieLoader';
import type LottiePlayer from '@lib/lottie/lottiePlayer';
import {LottieColor} from '@lib/lottie/lottiePlayer';

export type LottieIconOptions = {
  width: number,
  height: number,
  container?: HTMLElement,
  skipAnimation?: boolean
};

export type LottieIconItemPartOptions = {
  startFrame: number,
  endFrame: number,
  name?: string
};

export type LottieIconItemOptions = {
  name: LottieAssetName,
  parts: LottieIconItemPartOptions[],
  initFrame?: number,
  player?: LottiePlayer,
  autoplay?: boolean,
  color?: LottieColor
};

export class LottieIconItemPart implements LottieIconItemPartOptions {
  public startFrame: number;
  public endFrame: number;
  public name?: string;

  constructor(public item: LottieIconItem, options: LottieIconItemPartOptions) {
    safeAssign(this, options);
  }

  public play(callback?: () => void) {
    return this.item.playPart(this, callback);
  }
}

// export type LottieIconItemPart = LottieIconItemPartOptions;

export class LottieIconItem implements LottieIconItemOptions {
  public name: LottieAssetName;
  public parts: LottieIconItemPart[];
  public player: LottiePlayer;
  public initFrame: number;
  public autoplay: boolean;
  public color: LottieColor;
  public loadPromise: Promise<void>;
  public onLoadForPart: () => void;
  public onLoadForColor: () => void;

  constructor(public icon: LottieIcon, options: LottieIconItemOptions) {
    this.autoplay = false;

    safeAssign(this, options);

    this.parts = this.parts.map((options) => this.createPart(options));
  }

  public load() {
    let loadPromise = this.loadPromise;
    if(loadPromise) {
      return loadPromise;
    }

    const {container, canvas, width, height} = this.icon;
    loadPromise = lottieLoader.loadAnimationAsAsset({
      container,
      canvas,
      width,
      height,
      group: 'none',
      loop: false,
      autoplay: this.autoplay ?? false,
      initFrame: this.initFrame,
      skipFirstFrameRendering: this.initFrame === undefined,
      color: this.color
    }, this.name).then((player) => {
      return lottieLoader.waitForFirstFrame(player);
    }).then((player) => {
      this.player = player;

      if(this.onLoadForColor) {
        this.onLoadForColor();
        this.onLoadForColor = undefined;
      }

      if(this.onLoadForPart) {
        this.onLoadForPart();
        this.onLoadForPart = undefined;
      }
    });

    this.loadPromise = loadPromise;
    this.icon.loadPromises.set(this.name, loadPromise);
    return loadPromise;
  }

  public createPart(options: LottieIconItemPartOptions) {
    return new LottieIconItemPart(this, options);
  }

  public getPart(index: string | number | LottieIconItemPart) {
    if(index instanceof LottieIconItemPart) return index;
    else if(typeof(index) === 'string') return this.parts.find((part) => part.name === index);
    else return this.parts[index];
  }

  public playPart(part: LottieIconItemPart, callback?: () => void) {
    return this.icon.playPart(this, part, callback);
  }
}

export default class LottieIcon {
  public container: HTMLElement;
  public canvas: HTMLCanvasElement;
  public width: number;
  public height: number;

  protected items: Map<LottieAssetName, LottieIconItem>;
  public loadPromises: Map<LottieAssetName, Promise<void>>;

  protected skipAnimation: boolean;

  constructor(options: LottieIconOptions) {
    safeAssign(this, options);

    if(!this.container) this.container = document.createElement('div');
    this.container.classList.add('lottie-icon');

    const {width, height} = this;
    this.container.style.width = width + 'px';
    this.container.style.height = height + 'px';

    const canvas = this.canvas = document.createElement('canvas');
    canvas.classList.add('lottie');
    canvas.width = width;
    canvas.height = height;

    this.items = new Map();
    this.loadPromises = new Map();
  }

  public get loadPromise() {
    return Promise.all([...this.loadPromises.values()]).then(noop);
  }

  public getItem(name?: LottieAssetName): LottieIconItem {
    return !name && this.items.size === 1 ? this.items.values().next().value : this.items.get(name);
  }

  public add(options: Omit<LottieIconItemOptions, 'player'>) {
    const item = new LottieIconItem(this, options);
    this.items.set(options.name, item);

    return item;
  }

  public playPart(item: LottieIconItem, index: Parameters<LottieIconItem['getPart']>[0], callback?: () => void) {
    if(!item.player) {
      item.onLoadForPart = () => {
        this.playPart(item, index, callback);
      };

      return;
    }

    const part = item.getPart(index);
    item.player.playPart({
      from: liteMode.isAvailable('animations') && !this.skipAnimation ? part.startFrame : part.endFrame,
      to: part.endFrame,
      callback
    });
  }

  /* public playToPart(item: LottieIconItem, index: Parameters<LottieIconItem['getPart']>[0], toEnd: boolean) {
    if(!item.player) return;
    const part = item.getPart(index);
    const toFrame = toEnd ? part.endFrame : part.startFrame;
    item.player.playToFrame({
      frame: toFrame
    });
  } */

  public static generateEqualParts(length: number, frameCount: number): LottieIconItemPartOptions[] {
    return new Array(length).fill(0).map((_, idx) => {
      const startFrame = idx * frameCount;
      return {startFrame, endFrame: startFrame + frameCount - 1};
    });
  }
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import noop from "../../helpers/noop";
import { safeAssign } from "../../helpers/object";
import lottieLoader, { LottieAssetName } from "./lottieLoader";
import type RLottiePlayer from "./rlottiePlayer";
import { RLottieColor } from "./rlottiePlayer";

export type RLottieIconOptions = {
  width: number,
  height: number,
  container?: HTMLElement
};

export type RLottieIconItemPartOptions = {
  startFrame: number,
  endFrame: number,
  name?: string
};

export type RLottieIconItemOptions = {
  name: LottieAssetName,
  parts: RLottieIconItemPartOptions[],
  initFrame?: number,
  player?: RLottiePlayer,
  autoplay?: boolean,
  color?: RLottieColor,
  inverseColor?: RLottieColor,
};

export class RLottieIconItemPart implements RLottieIconItemPartOptions {
  public startFrame: number;
  public endFrame: number;
  public name?: string;
  
  constructor(public item: RLottieIconItem, options: RLottieIconItemPartOptions) {
    safeAssign(this, options);
  }

  public play() {
    return this.item.playPart(this);
  }
}

// export type RLottieIconItemPart = RLottieIconItemPartOptions;

export class RLottieIconItem implements RLottieIconItemOptions {
  public name: LottieAssetName;
  public parts: RLottieIconItemPart[];
  public player: RLottiePlayer;
  public initFrame: number;
  public autoplay: boolean;
  public color: RLottieColor;
  public inverseColor: RLottieColor;
  public loadPromise: Promise<void>;

  constructor(public icon: RLottieIcon, options: RLottieIconItemOptions) {
    this.autoplay = false;

    safeAssign(this, options);

    this.parts = this.parts.map(options => this.createPart(options));
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
      color: this.color,
      inverseColor: this.inverseColor
    }, this.name).then(player => {
      return lottieLoader.waitForFirstFrame(player);
    }).then(player => {
      this.player = player;
    });

    this.loadPromise = loadPromise;
    this.icon.loadPromises.set(this.name, loadPromise);
    return loadPromise;
  }

  public createPart(options: RLottieIconItemPartOptions) {
    return new RLottieIconItemPart(this, options);
  }

  public getPart(index: string | number | RLottieIconItemPart) {
    if(index instanceof RLottieIconItemPart) return index;
    else if(typeof(index) === 'string') return this.parts.find(part => part.name === index);
    else return this.parts[index];
  }

  public playPart(part: RLottieIconItemPart) {
    return this.icon.playPart(this, part);
  }
}

export default class RLottieIcon {
  public container: HTMLElement;
  public canvas: HTMLCanvasElement;
  public width: number;
  public height: number;

  protected items: Map<LottieAssetName, RLottieIconItem>;
  public loadPromises: Map<LottieAssetName, Promise<void>>;

  constructor(options: RLottieIconOptions) {
    safeAssign(this, options);

    if(!this.container) this.container = document.createElement('div');
    this.container.classList.add('rlottie-icon');

    const {width, height} = this;
    this.container.style.width = width + 'px';
    this.container.style.height = height + 'px';

    const canvas = this.canvas = document.createElement('canvas');
    canvas.classList.add('rlottie');
    canvas.width = width;
    canvas.height = height;

    this.items = new Map();
    this.loadPromises = new Map();
  }

  public get loadPromise() {
    return Promise.all([...this.loadPromises.values()]).then(noop);
  }

  public getItem(name?: LottieAssetName): RLottieIconItem {
    return !name && this.items.size === 1 ? this.items.values().next().value : this.items.get(name);
  }

  public add(options: Omit<RLottieIconItemOptions, 'player'>) {
    const item = new RLottieIconItem(this, options);
    this.items.set(options.name, item);

    return item;
  }

  public playPart(item: RLottieIconItem, index: Parameters<RLottieIconItem['getPart']>[0]) {
    if(!item.player) return;
    const part = item.getPart(index);
    item.player.playPart({
      from: part.startFrame, 
      to: part.endFrame
    });
  }

  public playToPart(item: RLottieIconItem, index: Parameters<RLottieIconItem['getPart']>[0], toEnd: boolean) {
    if(!item.player) return;
    const part = item.getPart(index);
    const toFrame = toEnd ? part.endFrame : part.startFrame;
    item.player.playToFrame({
      frame: toFrame
    });
  }
  
  public static generateEqualParts(length: number, frameCount: number): RLottieIconItemPartOptions[] {
    return new Array(length).fill(0).map((_, idx) => {
      const startFrame = idx * frameCount;
      return {startFrame, endFrame: startFrame + frameCount - 1};
    });
  }
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import Scrollable from '../components/scrollable';
import rootScope from '../lib/rootScope';
import {animate} from './animation';
import {drawCircleFromStart} from './canvas/drawCircle';
import roundRect from './canvas/roundRect';
import Shimmer from './canvas/shimmer';
import customProperties from './dom/customProperties';
import easeInOutSine from './easing/easeInOutSine';
import liteMode from './liteMode';
import mediaSizes from './mediaSizes';

export default class DialogsPlaceholder {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shimmer: Shimmer;
  private tempId: number;
  private detachTime: number;

  private length: number;
  private dialogHeight: number;
  private availableLength: number;

  private avatarSize: number;
  private avatarMarginRight: number;
  private marginVertical: number;
  private marginLeft: number;
  private gapVertical: number;
  private totalHeight: number;
  private lineHeight: number;
  private lineBorderRadius: number;
  private lineMarginVertical: number;
  private statusWidth: number;
  private generatedValues: {
    firstLineWidth: number,
    secondLineWidth: number,
    statusWidth: number
  }[];

  private getRectFrom: () => Pick<DOMRectEditable, 'width' | 'height'>;
  private onRemove: () => void;
  private blockScrollable: Scrollable;

  constructor(sizes: Partial<{
    avatarSize: number,
    avatarMarginRight: number,
    marginVertical: number,
    marginLeft: number,
    gapVertical: number,
    totalHeight: number,
    statusWidth: number
  }> = {}) {
    this.shimmer = new Shimmer();
    this.tempId = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('dialogs-placeholder-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.generatedValues = [];
    this.avatarSize = sizes.avatarSize ?? 54;
    this.avatarMarginRight = sizes.avatarMarginRight ?? 10;
    this.marginVertical = sizes.marginVertical ?? 9;
    this.marginLeft = sizes.marginLeft ?? 17;
    this.gapVertical = sizes.gapVertical ?? 0;
    this.totalHeight = sizes.totalHeight ?? (this.avatarSize + this.marginVertical * 2);
    this.lineHeight = 10;
    this.lineBorderRadius = 6;
    this.lineMarginVertical = 8;
    this.statusWidth = sizes.statusWidth ?? 24;
  }

  public attach({container, rect, getRectFrom, onRemove, blockScrollable}: {
    container: HTMLElement,
    rect?: ReturnType<DialogsPlaceholder['getRectFrom']>,
    getRectFrom?: HTMLElement | DialogsPlaceholder['getRectFrom'],
    onRemove?: DialogsPlaceholder['onRemove'],
    blockScrollable?: DialogsPlaceholder['blockScrollable']
  }) {
    const {canvas} = this;

    this.detachTime = undefined;
    this.onRemove = onRemove;
    this.getRectFrom = typeof(getRectFrom) === 'function' ? getRectFrom : (getRectFrom || container).getBoundingClientRect.bind(getRectFrom || container);
    if(this.blockScrollable = blockScrollable) {
      blockScrollable.container.style.overflowY = 'hidden';
    }

    this.updateCanvasSize(rect);
    this.startAnimation();
    container.append(canvas);
  }

  public detach(availableLength: number) {
    if(this.detachTime) {
      return;
    }

    this.availableLength = availableLength;
    this.detachTime = Date.now();

    if(!liteMode.isAvailable('animations')) {
      this.remove();
    }
  }

  public removeWithoutUnmounting() {
    this.stopAnimation();
    this.onRemove?.();
    this.onRemove = undefined;
  }

  public remove() {
    this.stopAnimation();

    if(this.canvas.parentElement) {
      this.canvas.remove();

      if(this.blockScrollable) {
        this.blockScrollable.container.style.overflowY = '';
        this.blockScrollable = undefined;
      }
    }

    this.onRemove?.();
    this.onRemove = undefined;
  }

  private updateCanvasSize(rect = this.getRectFrom()) {
    const {canvas} = this;
    const dpr = canvas.dpr = window.devicePixelRatio;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  private renderDetachAnimationFrame() {
    const {
      canvas,
      ctx,
      detachTime,
      length,
      availableLength
    } = this;

    if(!detachTime) {
      return;
    } else if(!liteMode.isAvailable('animations')) {
      this.remove();
      return;
    }

    const {width} = canvas;

    ctx.globalCompositeOperation = 'destination-out';

    // ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    // ctx.fillRect(0, 0, width, height);

    // const DURATION = 500;
    // const DELAY = DURATION;
    const DURATION = 150;
    const DELAY = 15;
    const elapsedTime = Date.now() - detachTime;
    let completed = true;
    for(let i = 0; i < length; ++i) {
      const delay = availableLength < length && i >= availableLength ? DELAY * (availableLength - 1) : DELAY * i;
      const elapsedRowTime = elapsedTime - delay;
      if(elapsedRowTime <= 0) {
        completed = false;
        continue;
      }

      const progress = easeInOutSine(elapsedRowTime, 0, 1, DURATION);

      ctx.beginPath();
      ctx.rect(0, this.dialogHeight * i, width, this.dialogHeight);
      ctx.fillStyle = `rgba(0, 0, 0, ${progress})`;
      ctx.fill();

      if(progress < 1) {
        completed = false;
      }
    }

    // const totalRadius = Math.sqrt(width ** 2 + height ** 2);
    // const gradient = ctx.createRadialGradient(
    //   0, 0, 0,
    //   0, 0, totalRadius);
    // gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    // gradient.addColorStop(progress, 'rgba(0, 0, 0, 0)');
    // gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // const gradient = ctx.createLinearGradient(0, 0, 0, height);
    // gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    // gradient.addColorStop(progress, 'rgba(0, 0, 0, 0)');
    // gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // ctx.fillStyle = gradient;
    // ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'source-over';

    if(completed) {
      this.remove();
    }
  }

  private renderFrame() {
    this.shimmer.on();
    this.renderDetachAnimationFrame();
  }

  private startAnimation() {
    const {canvas, shimmer} = this;
    const tempId = ++this.tempId;
    const pattern = this.createPattern();

    shimmer.settings({
      canvas,
      fillStyle: pattern
    });

    const middleware = () => {
      return this.tempId === tempId;
    };

    this.renderFrame();
    animate(() => {
      if(!middleware()) {
        return false;
      }

      // ! should've removed the loop if animations are disabled
      if(liteMode.isAvailable('animations')) {
        this.renderFrame();
      }

      // ! tempId can be changed during renderFrame
      return middleware();
    });

    rootScope.addEventListener('theme_change', this.onThemeChange);
    mediaSizes.addEventListener('resize', this.onResize);
  }

  private stopAnimation() {
    ++this.tempId;
    rootScope.removeEventListener('theme_change', this.onThemeChange);
    mediaSizes.removeEventListener('resize', this.onResize);
  }

  private onThemeChange = () => {
    this.stopAnimation();
    this.startAnimation();
  };

  private onResize = () => {
    const {canvas} = this;
    const {width, height, dpr} = canvas;
    this.updateCanvasSize();
    if(canvas.width === width && canvas.height === height && canvas.dpr === dpr) {
      return;
    }

    this.stopAnimation();
    this.startAnimation();
  };

  private createPattern() {
    const {canvas, ctx} = this;

    const patternCanvas = document.createElement('canvas');
    const patternContext = patternCanvas.getContext('2d');
    const dpr = canvas.dpr;
    patternCanvas.dpr = dpr;
    patternCanvas.width = canvas.width;
    patternCanvas.height = canvas.height;

    patternContext.fillStyle = customProperties.getProperty('surface-color');
    patternContext.fillRect(0, 0, patternCanvas.width, patternCanvas.height);

    patternContext.fillStyle = '#000';
    patternContext.globalCompositeOperation = 'destination-out';

    const dialogHeight = this.dialogHeight = this.totalHeight * dpr;
    const gapVertical = this.gapVertical * dpr;
    let gapVerticalSum = 0;
    const length = this.length = Math.ceil(canvas.height / dialogHeight);
    for(let i = 0; i < length; ++i) {
      this.drawChat(patternContext, i, i * dialogHeight + gapVerticalSum);
      gapVerticalSum += gapVertical;
    }

    return ctx.createPattern(patternCanvas, 'no-repeat');
  }

  private drawChat(ctx: CanvasRenderingContext2D, i: number, y: number) {
    let generatedValues = this.generatedValues[i];
    if(!generatedValues) {
      generatedValues = this.generatedValues[i] = {
        firstLineWidth: 40 + Math.random() * 100, // 120
        secondLineWidth: 120 + Math.random() * 130, // 240
        statusWidth: this.statusWidth ? this.statusWidth + Math.random() * 16 : undefined
      };
    }

    const {
      firstLineWidth,
      secondLineWidth,
      statusWidth
    } = generatedValues;

    const {canvas} = ctx;
    const {dpr} = canvas;
    y /= dpr;

    const {
      avatarSize,
      marginVertical,
      lineHeight,
      lineBorderRadius,
      lineMarginVertical
    } = this;

    let marginLeft = this.marginLeft;

    if(avatarSize) {
      drawCircleFromStart(ctx, marginLeft, y + marginVertical, avatarSize / 2, true);
      marginLeft += avatarSize + this.avatarMarginRight;
    }

    // 9 + 54 - 10 - 8 = 45 ........ 72 - 9 - 10 - 8
    roundRect(ctx, marginLeft, y + marginVertical + lineMarginVertical, firstLineWidth, lineHeight, lineBorderRadius, true);
    // roundRect(ctx, marginLeft, y + marginVertical + avatarSize - lineHeight - lineMarginVertical, secondLineWidth, lineHeight, lineBorderRadius, true);
    roundRect(ctx, marginLeft, y + this.totalHeight - marginVertical - lineHeight - lineMarginVertical, secondLineWidth, lineHeight, lineBorderRadius, true);

    statusWidth && roundRect(ctx, canvas.width / dpr - 24 - statusWidth, y + marginVertical + lineMarginVertical, statusWidth, lineHeight, lineBorderRadius, true);
  }
}

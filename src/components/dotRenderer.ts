/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_MOBILE} from '../environment/userAgent';
import {animate} from '../helpers/animation';
import liteMode from '../helpers/liteMode';
import {Middleware} from '../helpers/middleware';
import clamp from '../helpers/number/clamp';
import animationIntersector, {AnimationItemGroup, AnimationItemWrapper} from './animationIntersector';

type DotRendererDot = {
  x: number,
  y: number,
  opacity: number,
  radius: number
  mOpacity: number,
  adding: boolean,
  counter: number,
  path: Path2D
};
export default class DotRenderer implements AnimationItemWrapper {
  public canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private dots: DotRendererDot[];

  public paused: boolean;
  public autoplay: boolean;
  public tempId: number;

  private dpr: number;

  public loop: boolean = true;

  constructor(
    private width: number,
    private height: number,
    private multiply?: number
  ) {
    const canvas = this.canvas = document.createElement('canvas');
    const dpr = this.dpr = window.devicePixelRatio;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.classList.add('canvas-thumbnail', 'canvas-dots');

    this.paused = true;
    this.autoplay = true;
    this.tempId = 0;
    this.context = canvas.getContext('2d');
  }

  private prepare() {
    let count = Math.round(this.width * this.height / (35 * (IS_MOBILE ? 2 : 1)));
    count *= this.multiply || 1;
    count = Math.min(!liteMode.isAvailable('chat_spoilers') ? 400 : IS_MOBILE ? 1000 : 2200, count);
    count = Math.round(count);
    const dots: DotRendererDot[] = this.dots = new Array(count);

    for(let i = 0; i < count; ++i) {
      dots[i] = this.generateDot();
    }
  }

  private generateDot(adding?: boolean): DotRendererDot {
    const x = Math.floor(Math.random() * this.canvas.width);
    const y = Math.floor(Math.random() * this.canvas.height);
    const opacity = adding ? 0 : Math.random();
    const radius = (Math.random() >= .8 ? 1 : 0.5) * this.dpr;
    const path = new Path2D();
    path.arc(x, y, radius, 0, 2 * Math.PI, false);
    return {
      x,
      y,
      opacity,
      radius,
      mOpacity: opacity,
      adding: adding ?? Math.random() >= .5,
      counter: 0,
      path
    };
  }

  private draw() {
    const {context, canvas, dots} = this;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff';

    const add = 0.02;
    for(let i = 0, length = dots.length; i < length; ++i) {
      const dot = dots[i];
      const addOpacity = dot.adding ? add : -add;

      dot.mOpacity += addOpacity;
      // if(dot.mOpacity <= 0) dot.mOpacity = dot.opacity;

      // const easedOpacity = easing(dot.mOpacity);
      const easedOpacity = clamp(dot.mOpacity, 0, 1);
      context.globalAlpha = easedOpacity;
      context.fill(dot.path);

      if(dot.mOpacity <= 0) {
        dot.adding = true;

        if(++dot.counter >= 1) {
          dots[i] = this.generateDot(dot.adding);
        }
      } else if(dot.mOpacity >= 1) {
        dot.adding = false;
      }
    }
  }

  public remove() {
    this.pause();
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;
    ++this.tempId;
  }

  public renderFirstFrame() {
    if(!this.dots) {
      this.prepare();
    }

    this.draw();
  }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;
    const tempId = ++this.tempId;

    if(!this.dots) {
      this.prepare();
    }

    animate(() => {
      if(this.tempId !== tempId || this.paused) {
        return false;
      }

      this.draw();
      return true;
    });
  }

  public static create({
    width,
    height,
    middleware,
    animationGroup,
    multiply
  }: {
    width: number,
    height: number,
    middleware: Middleware,
    animationGroup: AnimationItemGroup,
    multiply?: number
  }) {
    const dotRenderer = new DotRenderer(width, height, multiply);
    dotRenderer.renderFirstFrame();

    animationIntersector.addAnimation({
      animation: dotRenderer,
      group: animationGroup,
      observeElement: dotRenderer.canvas,
      controlled: middleware
    });

    return dotRenderer;
  }
}

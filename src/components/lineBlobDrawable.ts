/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

export const MAX_SPEED = 8.2;
export const MIN_SPEED = 0.8;

// import { MIN_SPEED, MAX_SPEED } from './BlobDrawable';

type Radius = number[];

export default class LineBlobDrawable {
  public maxRadius: number;
  public minRadius: number;
  private N: number;
  private radius: Radius;
  private radiusNext: Radius;
  private progress: number[];
  private speed: number[];

  constructor(n: number) {
    this.maxRadius = 10;
    this.minRadius = 0;

    this.N = n;
    this.radius = new Array(n + 1);

    this.radiusNext = new Array(n + 1);
    this.progress = new Array(n + 1);
    this.speed = new Array(n + 1);

    for(let i = 0; i <= n; i++) {
      this.generateBlob(this.radius, i);
      this.generateBlob(this.radiusNext, i);
      this.progress[i] = 0;
    }
  }

  private generateBlob(radius: Radius, i: number) {
    const {maxRadius, minRadius, speed} = this;

    const radDif = maxRadius - minRadius;
    radius[i] = minRadius + Math.random() * radDif;
    speed[i] = 0.017 + 0.003 * Math.random();
  }

  private generateNextBlob() {
    const {radius, radiusNext, progress, N} = this;
    for(let i = 0; i < N; i++) {
      this.generateBlob(radius, i);
      this.generateBlob(radiusNext, i);
      progress[i] = 0.0;
    }
  }

  public update(amplitude: number, speedScale: number) {
    const {N, progress, speed, radius, radiusNext} = this;
    for(let i = 0; i <= N; i++) {
      progress[i] += (speed[i] * MIN_SPEED) + amplitude * speed[i] * MAX_SPEED * speedScale;
      if(progress[i] >= 1.0) {
        progress[i] = 0.0;
        radius[i] = radiusNext[i];
        this.generateBlob(radiusNext, i);
      }
    }
  }

  public draw(left: number, top: number, right: number, bottom: number, canvas: HTMLCanvasElement, paint: (ctx: CanvasRenderingContext2D) => void, pinnedTop: number, progressToPinned: number) {
    if(canvas.getContext) {
      const ctx = canvas.getContext('2d');
      // ctx.globalAlpha = 0.5;
      // ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(right, bottom);
      ctx.lineTo(left, bottom);

      const {radius, radiusNext, N} = this;
      for(let i = 0; i <= N; i++) {
        if(i === 0) {
          const progress = this.progress[i];
          const r1 = radius[i] * (1.0 - progress) + radiusNext[i] * progress;
          const y = (top - r1) * progressToPinned + pinnedTop * (1.0 - progressToPinned);
          ctx.lineTo(left, y);
        } else {
          const progress = this.progress[i - 1];
          const r1 = radius[i - 1] * (1.0 - progress) + radiusNext[i - 1] * progress;
          const progressNext = this.progress[i];
          const r2 = radius[i] * (1.0 - progressNext) + radiusNext[i] * progressNext;
          const x1 = (right - left) / N * (i - 1);
          const x2 = (right - left) / N * i;
          const cx = x1 + (x2 - x1) / 2;

          const y1 = (top - r1) * progressToPinned + pinnedTop * (1.0 - progressToPinned);
          const y2 = (top - r2) * progressToPinned + pinnedTop * (1.0 - progressToPinned);
          ctx.bezierCurveTo(cx, y1, cx, y2, x2, y2);
          if(i === N) {
            ctx.lineTo(right, bottom);
          }
        }
      }

      // ctx.scale(1.0, 1.0);
      paint(ctx);
      ctx.fill();
      ctx.closePath();
    }
  }
}

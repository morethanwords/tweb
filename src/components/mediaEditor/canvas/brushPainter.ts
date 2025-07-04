import deferredPromise from '../../../helpers/cancellablePromise';
import {hexaToRgba} from '../../../helpers/color';

import {NumberPair} from '../types';
import {animateValue, delay, distance} from '../utils';

export type BrushDrawnLine = {
  color: string;
  brush: string;
  size: number;
  points: NumberPair[];
};

type BrushPainterOptions = {
  targetCanvas: HTMLCanvasElement;
  imageCanvas: HTMLCanvasElement;
  blurAmount?: number;
};

export default class BrushPainter {
  private imageCanvas: HTMLCanvasElement;
  private cacheCanvas: HTMLCanvasElement;
  private blurredImageCanvas: HTMLCanvasElement;
  private blurredLineCanvas: HTMLCanvasElement;

  private targetCtx: CanvasRenderingContext2D;
  private cacheCtx: CanvasRenderingContext2D;
  private blurredImageCtx: CanvasRenderingContext2D;
  private blurredLineCtx: CanvasRenderingContext2D;

  private width: number;
  private height: number;

  private blurAmount: number;

  static defaultBlurAmount = 10;

  constructor({targetCanvas, imageCanvas, blurAmount = BrushPainter.defaultBlurAmount}: BrushPainterOptions) {
    this.targetCtx = targetCanvas.getContext('2d');
    this.imageCanvas = imageCanvas;
    this.blurAmount = blurAmount;

    this.cacheCanvas = document.createElement('canvas');
    this.blurredImageCanvas = document.createElement('canvas');
    this.blurredLineCanvas = document.createElement('canvas');

    this.width =
      this.cacheCanvas.width =
      this.blurredImageCanvas.width =
      this.blurredLineCanvas.width =
        targetCanvas.width;
    this.height =
      this.cacheCanvas.height =
      this.blurredImageCanvas.height =
      this.blurredLineCanvas.height =
        targetCanvas.height;

    this.cacheCtx = this.cacheCanvas.getContext('2d');
    this.blurredImageCtx = this.blurredImageCanvas.getContext('2d');
    this.blurredLineCtx = this.blurredLineCanvas.getContext('2d');
  }

  previewLine(line: BrushDrawnLine, shouldFinish = false) {
    this.targetCtx.clearRect(0, 0, this.width, this.height);

    this.targetCtx.drawImage(this.cacheCanvas, 0, 0);
    const brushFn = this.brushes[line.brush];
    this.targetCtx.save();
    brushFn(line, this.targetCtx, shouldFinish);
    this.targetCtx.restore();
  }

  saveLastLine() {
    this.cacheCtx.clearRect(0, 0, this.width, this.height);
    this.cacheCtx.drawImage(this.targetCtx.canvas, 0, 0);
    this.updateBlurredImage();
  }

  updateBlurredImage() {
    this.blurredImageCtx.clearRect(0, 0, this.width, this.height);
    this.blurredImageCtx.filter = `blur(${this.blurAmount}px)`;
    this.blurredImageCtx.drawImage(this.imageCanvas, 0, 0, this.width, this.height);

    this.blurredImageCtx.drawImage(this.cacheCanvas, 0, 0);
  }

  drawLine(line: BrushDrawnLine) {
    this.previewLine(line, true);
    this.saveLastLine();
  }

  clear() {
    this.targetCtx.clearRect(0, 0, this.width, this.height);
    this.cacheCtx.clearRect(0, 0, this.width, this.height);
  }

  private drawLinePath(line: BrushDrawnLine, ctx: CanvasRenderingContext2D) {
    const {points} = line;
    if(!points.length) return;

    if(points.length === 1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], line.size / 2, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);

    for(let i = 1; i < points.length - 2; i++) {
      const cx = (points[i][0] + points[i + 1][0]) / 2;
      const cy = (points[i][1] + points[i + 1][1]) / 2;
      ctx.quadraticCurveTo(points[i][0], points[i][1], cx, cy);
    }

    const i = points.length - 1;
    ctx.quadraticCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);

    ctx.stroke();
  }

  private getArrowHeadLength(line: BrushDrawnLine) {
    return Math.sqrt(line.size) + line.size * 2.5;
  }

  private drawArrowHead(ctx: CanvasRenderingContext2D, line: BrushDrawnLine, arrowLength: number) {
    const {points} = line;
    if(points.length < 2) return;

    const i = points.length - 1;

    let i2 = i;
    for(; i2 > 0; i2--) {
      if(distance(points[i], points[i2]) > line.size * 0.5) break;
    }

    const angle = Math.atan2(points[i][0] - points[i2][0], points[i][1] - points[i2][1]) + Math.PI;

    const angle1 = angle + Math.PI / 4;
    const angle2 = angle - Math.PI / 4;

    const vec1 = [arrowLength * Math.sin(angle1), arrowLength * Math.cos(angle1)];
    const vec2 = [arrowLength * Math.sin(angle2), arrowLength * Math.cos(angle2)];

    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[i][0], points[i][1]);
    ctx.lineTo(points[i][0] + vec1[0], points[i][1] + vec1[1]);
    ctx.moveTo(points[i][0], points[i][1]);
    ctx.lineTo(points[i][0] + vec2[0], points[i][1] + vec2[1]);
    ctx.stroke();
  }

  async animateArrowBrush(line: BrushDrawnLine) {
    const {points} = line;
    if(points.length < 2) return;

    const ctx = this.targetCtx;

    const arrowLength = this.getArrowHeadLength(line);

    const deferred = deferredPromise<void>();
    animateValue(0.1, arrowLength, 120, (length) => this.drawArrowHead(ctx, line, length), {
      onEnd: () => deferred.resolve()
    });
    await deferred;
  }

  private brushes: Record<
    string,
    (line: BrushDrawnLine, ctx: CanvasRenderingContext2D, shouldFinish: boolean) => void
  > = {
      pen: (line, ctx) => {
        ctx.strokeStyle = line.color;
        this.drawLinePath(line, ctx);
      },
      arrow: (line, ctx, shouldFinish) => {
        const {points} = line;

        ctx.strokeStyle = line.color;
        this.drawLinePath(line, ctx);

        if(!shouldFinish) return;
        if(points.length < 2) return;

        this.drawArrowHead(ctx, line, this.getArrowHeadLength(line));
      },
      brush: (line, ctx) => {
        ctx.strokeStyle = `rgba(${hexaToRgba(line.color).join(',')},0.4)`;
        this.drawLinePath(line, ctx);
      },
      neon: (line, ctx) => {
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = line.size;
        ctx.shadowColor = line.color;
        this.drawLinePath(line, ctx);
      },
      blur: (line, ctx) => {
        const w = ctx.canvas.width,
          h = ctx.canvas.height;

        this.blurredLineCtx.clearRect(0, 0, w, h);

        const {points} = line;
        const pointsX = points.map((p) => p[0]);
        const pointsY = points.map((p) => p[1]);
        const minX = Math.max(Math.min(...pointsX) - line.size, 0),
          maxX = Math.max(...pointsX) + line.size,
          minY = Math.max(Math.min(...pointsY) - line.size, 0),
          maxY = Math.max(...pointsY) + line.size;

        this.blurredLineCtx.strokeStyle = 'white';
        this.drawLinePath(line, this.blurredLineCtx);

        this.blurredLineCtx.globalCompositeOperation = 'source-in';
        this.blurredLineCtx.drawImage(this.blurredImageCanvas, 0, 0);

        ctx.drawImage(this.blurredLineCanvas, minX, minY, maxX, maxY, minX, minY, maxX, maxY);
        this.blurredLineCtx.globalCompositeOperation = 'source-over';
      },
      eraser: (line, ctx) => {
        ctx.strokeStyle = 'white';
        ctx.globalCompositeOperation = 'destination-out';
        this.drawLinePath(line, ctx);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    };
}

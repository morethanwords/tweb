import {animateValue} from '@helpers/animateValue';
import deferredPromise from '@helpers/cancellablePromise';
import {hexaToRgba} from '@helpers/color';
import {NumberPair} from '@components/mediaEditor/types';
import {distance} from '@components/mediaEditor/utils';


export type BrushDrawnLine = {
  color: string;
  brush: string;
  size: number;
  points: NumberPair[];
  // Absent on saved strokes made before native shells: keep their original rendering.
  nativeStyle?: 'desktop' | 'android';
  // Only new Desktop freehand arrows finish synchronously. Missing means legacy.
  rendererVersion?: 1;
  // Radius / unmultiplied stroke width, so preview, zoom and export scale together.
  blurRadiusRatio?: number;
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
  private renderedBlurAmount: number;
  private cancelArrowAnimation?: () => void;

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

  private restoreCachedFrame() {
    this.targetCtx.clearRect(0, 0, this.width, this.height);
    this.targetCtx.drawImage(this.cacheCanvas, 0, 0);
  }

  previewLine(line: BrushDrawnLine, shouldFinish = false) {
    this.restoreCachedFrame();
    const brushFn = this.brushes[line.brush];
    this.targetCtx.save();
    brushFn(line, this.targetCtx, shouldFinish);
    this.targetCtx.restore();
  }

  cancelPreview() {
    this.cancelArrowAnimation?.();
    this.restoreCachedFrame();
  }

  finishLine(line: BrushDrawnLine) {
    this.cancelArrowAnimation?.();
    if(line.brush !== 'arrow') return;
    if(!(line.nativeStyle === 'desktop' && line.rendererVersion === 1)) {
      return this.animateArrowBrush(line);
    }
    this.previewLine(line, true);
  }

  saveLastLine() {
    this.cacheCtx.clearRect(0, 0, this.width, this.height);
    this.cacheCtx.drawImage(this.targetCtx.canvas, 0, 0);
    this.updateBlurredImage();
  }

  updateBlurredImage(blurAmount = this.renderedBlurAmount ?? this.blurAmount) {
    this.renderedBlurAmount = blurAmount;
    this.blurredImageCtx.clearRect(0, 0, this.width, this.height);
    this.blurredImageCtx.filter = `blur(${blurAmount}px)`;
    this.blurredImageCtx.drawImage(this.imageCanvas, 0, 0, this.width, this.height);

    this.blurredImageCtx.drawImage(this.cacheCanvas, 0, 0);
  }

  drawLine(line: BrushDrawnLine) {
    this.previewLine(line, true);
    this.saveLastLine();
  }

  clear() {
    this.cancelArrowAnimation?.();
    this.targetCtx.clearRect(0, 0, this.width, this.height);
    this.cacheCtx.clearRect(0, 0, this.width, this.height);
  }

  private drawLinePath(line: BrushDrawnLine, ctx: CanvasRenderingContext2D, width = line.size) {
    const {points} = line;
    if(!points.length) return;

    if(points.length === 1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(points[0][0], points[0][1], width / 2, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    ctx.lineWidth = width;
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
    return (line.nativeStyle === 'desktop' ? 0 : Math.sqrt(line.size)) + line.size * 2.5;
  }

  private drawArrowHead(ctx: CanvasRenderingContext2D, line: BrushDrawnLine, arrowLength: number) {
    const {points} = line;
    if(points.length < 2) return;

    const i = points.length - 1;

    let i2 = i;
    const desktop = line.nativeStyle === 'desktop';
    const minDistance = line.size * (desktop ? 1.5 : 0.5);
    for(; i2 > 0; i2--) {
      const pointDistance = distance(points[i], points[i2]);
      if(desktop ? pointDistance >= minDistance : pointDistance > minDistance) break;
    }

    if(desktop && !distance(points[i], points[i2])) return;

    const angle = Math.atan2(points[i][0] - points[i2][0], points[i][1] - points[i2][1]) + Math.PI;

    const headAngle = desktop ? 26 * Math.PI / 180 : Math.PI / 4;
    const angle1 = angle + headAngle;
    const angle2 = angle - headAngle;

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

  async animateArrowBrush(line: BrushDrawnLine): Promise<boolean> {
    this.cancelArrowAnimation?.();
    const {points} = line;
    if(points.length < 2) return true;

    const ctx = this.targetCtx;

    const arrowLength = this.getArrowHeadLength(line);

    const deferred = deferredPromise<boolean>();
    const cancel = animateValue(0.1, arrowLength, 120, (length) => this.drawArrowHead(ctx, line, length), {
      onEnd: () => {
        this.cancelArrowAnimation = undefined;
        deferred.resolve(true);
      }
    });
    this.cancelArrowAnimation = () => {
      cancel();
      this.cancelArrowAnimation = undefined;
      deferred.resolve(false);
    };
    return deferred;
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
        // Desktop editor.style / ItemCanvas::strokeWidth and strokeColor.
        // Path sampling stays tweb's; this does not port native pressure handling.
        const desktop = line.nativeStyle === 'desktop';
        const [r, g, b, alpha = 255] = hexaToRgba(line.color);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha / 255 * (desktop ? 0.35 : 0.4)})`;
        this.drawLinePath(line, ctx, line.size * (desktop ? 2.5 : 1));
      },
      neon: (line, ctx) => {
        const [r, g, b, alpha = 255] = hexaToRgba(line.color);
        ctx.strokeStyle = `rgba(255,255,255,${alpha / 255})`;
        ctx.shadowBlur = line.size;
        // The shadow inherits the stroke's alpha. Applying it to the shadow
        // color as well would square the selected opacity of the glow.
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        this.drawLinePath(line, ctx);
      },
      blur: (line, ctx) => {
        if(!line.points.length) return;
        const width = line.size * (line.nativeStyle === 'desktop' ? 3 : 1);
        const radius = line.nativeStyle === 'desktop' ? line.size * line.blurRadiusRatio : this.blurAmount;
        if(radius !== this.renderedBlurAmount) this.updateBlurredImage(radius);
        const w = ctx.canvas.width,
          h = ctx.canvas.height;

        this.blurredLineCtx.clearRect(0, 0, w, h);

        const {points} = line;
        const pointsX = points.map((p) => p[0]);
        const pointsY = points.map((p) => p[1]);
        const minX = Math.max(Math.min(...pointsX) - width, 0),
          maxX = Math.min(Math.max(...pointsX) + width, w),
          minY = Math.max(Math.min(...pointsY) - width, 0),
          maxY = Math.min(Math.max(...pointsY) + width, h);

        this.blurredLineCtx.strokeStyle = 'white';
        this.drawLinePath(line, this.blurredLineCtx, width);

        this.blurredLineCtx.globalCompositeOperation = 'source-in';
        this.blurredLineCtx.drawImage(this.blurredImageCanvas, 0, 0);

        ctx.drawImage(this.blurredLineCanvas, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
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

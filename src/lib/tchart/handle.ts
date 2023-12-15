import TDrag from './drag';
import {isTouchDevice, getElemPagePos, drawRoundedRect} from './utils';
import {TChartUnitOptions} from './types';

export default class THandle {
  private opts: TChartUnitOptions;
  private ctx: CanvasRenderingContext2D;
  private isTouch: boolean | undefined;
  private $canvas: HTMLCanvasElement | undefined;
  private drag: TDrag;
  private canvasPos: ReturnType<typeof getElemPagePos>;
  private tp: string | undefined;
  private firstMove: boolean | undefined;
  private prevX1: number | undefined;
  private prevX2: number | undefined;
  private isDarkMode: boolean | undefined;
  private minRange: number | undefined;
  private _x1: number;
  private _x2: number;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.ctx = opts.ctx;

    this.isTouch = isTouchDevice();
    this.$canvas = opts.$canvas;

    this.drag = new TDrag({
      $el: this.$canvas,
      onDragStart: (params) => {
        this.canvasPos = getElemPagePos(this.$canvas);
        const dx = params.pageX - this.canvasPos.x;
        const dy = params.pageY - this.canvasPos.y;
        this._x1 = opts.state.x1;
        this._x2 = opts.state.x2;
        this.constrainHandleSize(false);
        this.tp = this.getTp(
          dx - opts.settings.PADD[3],
          dy - (this.opts.state.dims.composer.h - opts.settings.MINI_GRAPH_HEIGHT - opts.settings.MINI_GRAPH_BOTTOM),
          params.isTouch
        );
        this.firstMove = true;
        return !this.tp;
      },
      onDragMove: (params) => {
        this.onDragMove(params.d);
        this.firstMove = false;
      },
      onDragEnd: (params) => {
      }
    });

    this.trackMouse(true);
  }

  getTp(x: number, y: number, isTouch: boolean) {
    const dims = this.opts.state.dims.handle;
    const state = this.opts.state;
    const zoomMode = this.opts.state.zoomMode;

    if(y < 0 || y > dims.h) return '';

    let xw = isTouch ? dims.w * 0.3 : 10;
    if(isTouch && xw < 14) xw = 14;
    if(isTouch && xw > 30) xw = 30;

    const xl1 = this.prevX1 + (isTouch ? (state.x1 === state.xg1 ? -5 : -15) : 0);
    let xl2 = xl1 + xw;

    const xr2 = this.prevX2 + (isTouch ? (state.x2 === state.xg2 ? 5 : 15) : 0);
    let xr1 = xr2 - xw;

    if(Math.abs(state.x2 - state.x1 - (zoomMode ? this.opts.data.mainPeriodLen : this.minRange)) < 0.01) {
      if(state.x2 === state.xg2) {
        xr1 = xr2 + 1;
      }
      if(state.x1 === state.xg1) {
        xl2 = xl1 - 1;
      }
    }

    if(x > xl2 && x < xr1) {
      return 'both';
    }

    if(x >= xl1 && x <= xl2) {
      return 'start';
    }

    if(x >= xr1 && x <= xr2) {
      return 'end';
    }

    return '';
  }

  trackMouse(enabled: boolean) {
    if(this.isTouch) return;

    this.$canvas.addEventListener('mousemove', this.onMouseMove);
    this.$canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  onMouseLeave = () => {
    this.$canvas.classList.remove('tchart--graph-canvas__handle-pointer');
    this.$canvas.classList.remove('tchart--graph-canvas__handle-grab');
    this.$canvas.classList.remove('tchart--graph-canvas__handle-col-resize');
    delete this.canvasPos;
  };

  onMouseMove = (e: MouseEvent) => {
    this.canvasPos = this.canvasPos || getElemPagePos(this.$canvas);
    const dx = e.pageX - this.canvasPos.x;
    const dy = e.pageY - this.canvasPos.y;
    const tp = this.getTp(
      dx - this.opts.settings.PADD[3],
      dy - (this.opts.state.dims.composer.h - this.opts.settings.MINI_GRAPH_HEIGHT - this.opts.settings.MINI_GRAPH_BOTTOM),
      false
    );

    const cursors: Record<string, string> = {
      '': '',
      'both': this.opts.settings.isIE ? 'pointer' : 'grab',
      'start': 'col-resize',
      'end': 'col-resize'
    };

    this.onMouseLeave();
    cursors[tp] && this.$canvas.classList.add('tchart--graph-canvas__handle-' + cursors[tp]);
  };

  onResize(rect?: any) {
    this.constrainHandleSize(true);
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  constrainHandleSize(updateHandle: boolean) {
    const dims = this.opts.state.dims.handle;
    const xScale = dims.w / (this.opts.state.xg2 - this.opts.state.xg1);
    const minRange = 32 / xScale; // 45 min handle width
    let x1 = this.opts.state.x1;
    let x2 = this.opts.state.x2;
    const xg1 = this.opts.state.xg1;
    const xg2 = this.opts.state.xg2;

    this.minRange = minRange;

    if(x2 - x1 < minRange) {
      x2 = x1 + minRange;

      if(x2 > xg2) {
        x2 = xg2;
        x1 = x2 - minRange;
      }

      updateHandle && this.opts.additional.cb(x1, x2, 'constraint');
    }
  }

  onDragMove(d: number) {
    const dims = this.opts.state.dims.handle;
    const tp = this.tp;
    const state = this.opts.state;
    const per = (d / dims.w) * (state.xg2 - state.xg1);
    let x1, x2;
    const _x1 = this._x1;
    const _x2 = this._x2;

    if(tp === 'both') {
      x1 = _x1 + per;
      x2 = _x2 + per;
      if(x1 < state.xg1) {
        x1 = state.xg1;
        x2 = state.xg1 + _x2 - _x1;
      }
      if(x2 > state.xg2) {
        x1 = state.xg2 - (_x2 - _x1);
        x2 = state.xg2;
      }
    }

    if(tp === 'start') {
      x2 = state.x2;
      x1 = Math.min(Math.max(_x1 + per, state.xg1), x2 - this.minRange);
    }

    if(tp === 'end') {
      x1 = state.x1;
      x2 = Math.max(Math.min(_x2 + per, state.xg2), x1 + this.minRange);
    }

    if(state.x1 === x1 && state.x2 === x2) return;

    this.opts.additional.cb(x1, x2, tp, this.firstMove);
  }

  render() {
    const dims = this.opts.state.dims.handle;
    const dpi = this.opts.settings.dpi;
    const state = this.opts.state;
    const xScale = 1 / (state.xg2 - state.xg1);
    const x1 = Math.round((state.x1 - state.xg1) * xScale * dims.w);
    const x2 = Math.round((state.x2 - state.xg1) * xScale * dims.w);
    const ctx = this.ctx;

    ctx.fillStyle = this.opts.settings.COLORS.miniMask;
    drawRoundedRect(ctx, dpi, x1 + 4, dims.h - 2, dims.l, dims.t + 1, [7, 0, 0, 7]);
    ctx.fill();
    drawRoundedRect(ctx, dpi, dims.w - x2 + 4, dims.h - 2, dims.l + x2 - 4, dims.t + 1, [0, 7, 7, 0]);
    ctx.fill();

    // * Extra border around handle frame
    // if(!this.isDarkMode && this.opts.graphStyle !== 'line' && this.opts.graphStyle !== 'step') {
    //   ctx.fillStyle = '#fff';
    //   drawRoundedRect(ctx, dpi, 12, dims.h + 2, dims.l + x1 - 1, dims.t - 1, [8, 0, 0, 8]);
    //   ctx.fill();
    //   drawRoundedRect(ctx, dpi, 12, dims.h + 2, dims.l + x2 - 11, dims.t - 1, [0, 8, 8, 0]);
    //   ctx.fill();
    // }

    ctx.fillStyle = this.opts.settings.COLORS.miniFrame;
    drawRoundedRect(ctx, dpi, 10, dims.h, dims.l + x1, dims.t, [7, 0, 0, 7]);
    ctx.fill();
    drawRoundedRect(ctx, dpi, 10, dims.h, dims.l + x2 - 10, dims.t, [0, 7, 7, 0]);
    ctx.fill();

    ctx.fillRect((dims.l + x1 + 10) * dpi, (dims.t) * dpi, (x2 - x1 - 20) * dpi, dpi);
    ctx.fillRect((dims.l + x1 + 10) * dpi, (dims.t + dims.h - 1) * dpi, (x2 - x1 - 20) * dpi, dpi);

    ctx.strokeStyle = '#fff';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 2 * dpi;
    ctx.beginPath();
    ctx.moveTo((dims.l + x1 + 5) * dpi, (dims.t + 17) * dpi);
    ctx.lineTo((dims.l + x1 + 5) * dpi, (dims.t + 25) * dpi);
    ctx.moveTo((dims.l + x2 - 5) * dpi, (dims.t + 17) * dpi);
    ctx.lineTo((dims.l + x2 - 5) * dpi, (dims.t + 25) * dpi);
    ctx.stroke();

    this.prevX1 = x1;
    this.prevX2 = x2;
  }
}

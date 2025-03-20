import {isTouchDevice} from './utils';
import {TChartUnitOptions} from './types';

export default class TDrag {
  private opts: TChartUnitOptions & {
    $el: HTMLElement,
    useElForMove?: boolean,
    onDragStart?: (params: {
      pageX: number,
      pageY: number,
      isTouch: boolean
    }) => any,
    onDragMove?: (params: {
      canceled: boolean,
      d: number,
      pageX: number,
      pageY: number,
      isTouch: boolean
    }) => any,
    onDragEnd?: (params: {
      isTouch: boolean,
      e: Event
    }) => any,
    noPrevent?: boolean
  };
  private isTouch: boolean;
  private skipMoveEnd: boolean;
  private scroll: string | undefined;
  private x: number;
  private y: number;
  private dX: number;
  private dY: number;
  private pageX: number;
  private pageY: number;
  private prevDx: number | undefined;
  private prevDy: number | undefined;
  private pointerTimeout: number;

  constructor(opts: TDrag['opts']) {
    this.opts = opts;
    this.isTouch = isTouchDevice();
    this.skipMoveEnd = true;

    const $global: HTMLElement | Window = opts.useElForMove ? opts.$el : window;

    opts.$el.addEventListener(this.isTouch ? 'touchstart' : 'mousedown', this.onDragStart, {
      passive: false
    });

    $global.addEventListener(this.isTouch ? 'touchmove' : 'mousemove', this.onDragMove, {
      passive: false
    });

    $global.addEventListener(this.isTouch ? 'touchend' : 'mouseup', this.onDragEnd, {
      passive: false
    });
  }

  onDragStart = (e: any) => {
    this.skipMoveEnd = true;
    clearTimeout(this.pointerTimeout);

    if(this.isTouch) {
      if(e.touches.length > 1) return;
    }

    this.scroll = undefined;
    this.x = this.isTouch ? e.touches[0].pageX : e.pageX;
    this.y = this.isTouch ? e.touches[0].pageY : e.pageY;
    this.dX = 0;
    this.dY = 0;
    this.pageX = this.x;
    this.pageY = this.y;
    delete this.prevDx;
    delete this.prevDy;

    const cancelDrag = this.opts.onDragStart({
      pageX: this.x,
      pageY: this.y,
      isTouch: this.isTouch
    });

    if(cancelDrag) return;

    this.skipMoveEnd = false;
  };

  onDragMove = (e: any) => {
    if(this.skipMoveEnd) return;

    if(this.scroll === 'v') {
      return;
    }

    const x = this.isTouch ? e.touches[0].pageX : e.pageX;
    const y = this.isTouch ? e.touches[0].pageY : e.pageY;

    this.dX = x - this.x;
    this.dY = y - this.y;

    this.pageX = x;
    this.pageY = y;

    if(this.isTouch) {
      if(this.scroll === 'h') {
        !this.opts.noPrevent && e.preventDefault();
      } else if(Math.abs(this.dX) > 5 || Math.abs(this.dY) > 5) {
        this.scroll = Math.abs(this.dX) > Math.abs(this.dY) ? 'h' : 'v';
      }
    }

    if(this.prevDx !== this.dX || this.prevDy !== this.dY) {
      this.opts.onDragMove && this.opts.onDragMove({
        canceled: this.scroll === 'v',
        d: this.dX,
        pageX: this.pageX,
        pageY: this.pageY,
        isTouch: this.isTouch
      });

      this.prevDx = this.dX;
      this.prevDy = this.dY;
    }
  };

  onDragEnd = (e: any) => {
    if(this.skipMoveEnd) return;

    this.skipMoveEnd = true;

    this.opts.onDragEnd && this.opts.onDragEnd({
      isTouch: this.isTouch,
      e: e
    });
  };
}

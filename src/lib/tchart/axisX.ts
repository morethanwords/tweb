import {getXIndex} from './utils';
import {TChartUnitOptions} from './types';

type C = {[key in `ox_${string}`]: number};
export type TChartAxisXItem = {
  tp: number,
  xi: number,
  i: number,
  state: {
    ind: string
  } & C,
};

export default class TAxisX {
  private opts: TChartUnitOptions;
  private ctx: CanvasRenderingContext2D;
  private items: Record<string, TChartAxisXItem>;
  private isDarkMode: boolean;
  private noAnimation: boolean;
  private prevXStep: number;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.ctx = opts.ctx;
    this.items = {};

    this.setAnimation(false);
  }

  onResize() {
    this.setAnimation(false);
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  setAnimation(enabled: boolean) {
    this.noAnimation = !enabled;
  }

  hideItem(ind: string, k: number) {
    this.items[ind].tp = 2;

    this.opts.animator.add([{
      prop: `ox_${ind}`,
      state: this.items[ind].state,
      end: 0,
      duration: this.noAnimation ? 0 : 200 * k,
      tween: 'linear',
      group: {top: true},
      cbEnd: this.deleteItem
    }]);
  }

  deleteItem = (state: TChartAxisXItem['state']) => {
    delete this.items[state.ind];
  };

  render(opacity: number) {
    const opts = this.opts;
    const dpi = opts.settings.dpi;
    const x = opts.data.x;
    const state = opts.state;
    const pRight = opts.settings.PADD[1];
    const pLeft = opts.settings.PADD[3];
    const animator = opts.animator;
    const xLen = x.length;
    const dims = this.opts.state.dims.axisX;
    const dimsDates = this.opts.state.dims.dates;
    const zoomMode = state.zoomMode;
    const zoomMorph = state.zoomMorph === undefined ? 0 : state.zoomMorph;

    const x1 = Math.floor(getXIndex(x, state.x1));
    const x2 = Math.ceil(getXIndex(x, state.x2));
    let x1End = x1;
    let x2End = x2;

    const isPointHasWidth = opts.graphStyle === 'bar' || opts.graphStyle === 'step';

    // fast calculation of average space occupied by label
    const space = (state.zoomMode && opts.data.details ?
      opts.data.details.maxXTickLength :
      opts.data.maxXTickLength) * 9;

    const offsetForBarGraphMain = isPointHasWidth ? this.opts.data.mainPeriodLen : 0;
    const offsetForBarGraphDetail = isPointHasWidth ? this.opts.data.detailPeriodLen : 0;
    const offsetForBarGraph = offsetForBarGraphMain + (offsetForBarGraphDetail - offsetForBarGraphMain) * zoomMorph;
    const offsetForBarGraphScale = offsetForBarGraphMain * (1 - zoomMorph);

    const xStepMain = (dims.w - pRight - pLeft) / Math.round((state.x2 - state.x1 + offsetForBarGraphMain) / this.opts.data.mainPeriodLen);
    const xStepDetail = (dims.w - pRight - pLeft) / Math.round((state.x2 - state.x1 + offsetForBarGraphDetail) / this.opts.data.detailPeriodLen);
    const xStep = xStepMain + (xStepDetail - xStepMain) * zoomMorph;

    let skipEachMain = Math.pow(2, Math.ceil(Math.log2(space / xStepMain)));
    let skipEachDetail = Math.pow(2, Math.ceil(Math.log2(space / xStepDetail)));
    const lxScale = (dims.w - pLeft - pRight) / (state.x2 - state.x1 + offsetForBarGraphScale);

    if(skipEachMain < 1) {
      skipEachMain = 1;
    }
    if(skipEachDetail < 1) {
      skipEachDetail = 1;
    }

    this.ctx.font = `${this.opts.settings.FONT.normal} ${11 * dpi}px ${this.opts.settings.FONT.family}`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = this.opts.settings.COLORS.axis.x;

    const changeSpeed = this.prevXStep ? (this.prevXStep > xStepMain ? this.prevXStep / xStepMain : xStepMain / this.prevXStep) : 1;
    let k = 1 / Math.pow(changeSpeed, 5);

    if(zoomMode && zoomMorph === 1) {
      k /= 2;
    }

    this.prevXStep = xStepMain;
    const x1Start = Math.max(x1 - Math.ceil((pLeft + space * 0.5) / xStep), 0);
    const x2Start = Math.min(x2 + Math.ceil((pRight + space * 0.5) / xStep), x.length - 1);

    if(zoomMode) {
      const x1AnimItem = this.opts.animator.get('x1');
      const x2AnimItem = this.opts.animator.get('x2');
      x1End = x1AnimItem ? x1AnimItem.end : this.opts.state['x1'];
      x2End = x2AnimItem ? x2AnimItem.end : this.opts.state['x2'];
      x1End = Math.floor(getXIndex(x, x1End));
      x2End = Math.floor(getXIndex(x, x2End));
    }

    let dtOffset: number;
    if(zoomMode) {
      const tmp1 = Math.max(x[this.opts.state.detailInd1], this.opts.state.xMainMin);
      const tmp2 = Math.min(x[this.opts.state.detailInd2], this.opts.state.xMainMax);
      dtOffset = Math.round((tmp2 - tmp1) / this.opts.data.mainPeriodLen) + (isPointHasWidth ? 0 : 1);
    }

    for(let i = x1Start; i <= x2Start; i++) {
      let shown = (i % skipEachMain) === 0;
      let prefix = 'm';

      if(zoomMode) {
        if(i < this.opts.state.detailInd1) {
          shown = (i % skipEachMain) === 0 && zoomMorph < 1;
        } else if(i <= this.opts.state.detailInd2) {
          shown = (Math.max(i - this.opts.state.detailInd1, 0) % skipEachDetail) === 0;
          prefix = 'd';
        } else {
          shown = (Math.max(i - (this.opts.state.detailInd2 - this.opts.state.detailInd1 + 1 - dtOffset), 0) % skipEachMain) === 0 && zoomMorph < 1;
        }
      }

      const id = x[i] + prefix;
      let item = this.items[id];

      if(shown) {
        if(!item) { // not exist or removed
          item = {
            tp: 1,
            xi: x[i],
            i: i,
            state: {
              ind: id
            }
          };
          item.state[`ox_${id}`] = 0;
          this.items[id] = item;

          animator.add([{
            prop: `ox_${id}`,
            state: item.state,
            end: 1,
            duration: this.noAnimation ? 0 : 200 * k,
            tween: 'linear',
            group: {top: true}
          }]);
        } else if(item.tp === 2) { // is hiding
          item.tp = 1;

          animator.add([{
            prop: `ox_${id}`,
            state: item.state,
            end: 1,
            duration: this.noAnimation ? 0 : 200 * k,
            tween: 'linear',
            group: {top: true}
          }]);
        }
      } else {
        if(item && item.tp === 1) { // is showing or shown
          this.hideItem(id, k);
        }
      }

      if(item && item.state[`ox_${id}`] > 0) {
        const xc = (item.xi - state.x1 + offsetForBarGraph / 2) * lxScale + pLeft;

        this.ctx.globalAlpha = item.state[`ox_${id}`] * opacity;

        if(xc + space / 2 >= dims.l && xc - space / 2 <= dims.l + dims.w) {
          // first and last labels manual align
          const xAligned = (xc + dims.l) * dpi;

          this.ctx.fillText(opts.data.datesShort[i], xAligned, (dims.t + 9) * dpi);
        }
      }
    }

    // remove the old ones, which is outside the current range
    for(const i in this.items) {
      const item = this.items[i];
      if(item.tp === 1 && ((item.xi < state.x1 - pLeft / lxScale) || (item.xi > state.x2 + pRight / lxScale))) {
        this.hideItem(i, k);
      }
    }

    this.ctx.globalAlpha = 1;

    if(!opts.data.subchart.show) {
      return;
    }

    let datesStr: string;
    if(zoomMode && zoomMorph === 1) {
      x2End--;
    }

    if(x2End < x1End) x2End = x1End;

    if(opts.data.datesRange[x1End] === opts.data.datesRange[x2End]) {
      datesStr = opts.data.datesRange[x1End];
    } else {
      datesStr = opts.data.datesRange[x1End] + ' — ' + opts.data.datesRange[x2End];
    }

    let fontSize = opts.settings.DATES_FONT_SIZE;
    if(!fontSize) {
      fontSize = 13;
      if(dims.w < 375) {
        fontSize = 11;
      }
    }

    this.ctx.font = `${opts.settings.FONT[opts.settings.DATES_WEIGHT]} ${fontSize * dpi}px ${opts.settings.FONT.family}`;
    this.ctx.textAlign = opts.settings.DATES_SIDE;
    this.ctx.fillStyle = opts.settings.COLORS.dates;
    this.ctx.fillText(
      datesStr,
      (dimsDates.l + (opts.settings.DATES_SIDE === 'right' ? dimsDates.w : 0)) * dpi,
      (dimsDates.t + dimsDates.h - 7) * dpi
    );
  }
}

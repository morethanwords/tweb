import {getXIndex} from './utils';
import {TChartUnitOptions} from './types';

export default class TLines {
  private opts: TChartUnitOptions;
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cached: string;
  private isDarkMode: boolean;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;

    this.$canvas = document.createElement('canvas');
    this.ctx = this.$canvas.getContext('2d', {alpha: true});
  }

  onResize() {
    const dpi = this.opts.settings.dpi;
    const dims = this.opts.additional.mini ? this.opts.state.dims.mini : this.opts.state.dims.graph;
    this.$canvas.width = dims.w * dpi;
    this.$canvas.height = dims.h * dpi;
    this.cached = '';
    this.ctx.fillStyle = this.opts.settings.COLORS.background;
    this.ctx.fillRect(0, 0, dims.w * dpi, dims.h * dpi);
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  render() {
    let i: number, j: number, y: number[], o: number, y1: number, y2: number, xScale: number, yScale: number, yShift: number, e: boolean, yFrom: number[];
    const opts = this.opts;
    const ys = opts.data.ys;
    const state = opts.state;
    const mini = opts.additional.mini;
    const toCache = mini || ((opts.data.master && state.masterVisibility < 1 && state.masterVisibility > 0) || (opts.data.slave && state.slaveVisibility < 1 && state.slaveVisibility > 0));
    const x1 = mini ? state.xg1 : state.x1;
    const x2 = mini ? state.xg2 : state.x2;
    const settings = opts.settings;
    const pTop = settings[`PADD${mini ? '_MINI' : ''}`][0];
    const pRight = settings[`PADD${mini ? '_MINI' : ''}`][1];
    const pBottom = settings[`PADD${mini ? '_MINI' : ''}`][2];
    const pLeft = settings[`PADD${mini ? '_MINI' : ''}`][3];
    const x = opts.data.x;
    const dpi = opts.settings.dpi;
    let xInd1, xInd2;
    const ctx = toCache ? this.ctx : this.opts.ctx;
    const dims = mini ? state.dims.mini : state.dims.graph;
    const zoom = state.zoomMode;
    const d1 = state.detailInd1;
    const d2 = state.detailInd2;
    const morph = state.zoomMorph === undefined ? 0 : state.zoomMorph;
    const ysLen = ys.length;
    const isStepMode = opts.graphStyle === 'step';

    xScale = (dims.w - pRight - pLeft) / (x2 - x1 + (isStepMode ? this.opts.data.mainPeriodLen * (1 - morph) : 0));
    xInd1 = Math.floor(getXIndex(x, x1 - pLeft / xScale));
    xInd2 = Math.ceil(getXIndex(x, x2 + pRight / xScale));
    xScale *= dpi;
    const xShift = (pLeft + (toCache ? 0 : dims.l)) * dpi - x1 * xScale;

    if(isStepMode && zoom && morph === 1) {
      if(xInd1 < this.opts.state.xg1Ind) xInd1 = this.opts.state.xg1Ind;
      if(xInd2 > this.opts.state.xg2Ind) xInd2 = this.opts.state.xg2Ind - 1;
    }

    let xw: number;
    const xwMain = this.opts.data.mainPeriodLen * xScale;
    const xwDetail = this.opts.data.detailPeriodLen * xScale;

    // Cache rendered version
    if(toCache) {
      const hash = [dims.w, dims.h, mini ? state.xg1 : state.x1, mini ? state.xg2 : state.x2, this.isDarkMode, zoom];
      if(!mini) {
        hash.push(state.y1 as number);
        hash.push(state.y2 as number);
      }
      for(i = 0; i < ysLen; i++) {
        hash.push(mini ? state[`om_${i}`] : state[`o_${i}`]);
        hash.push(state[`f_${i}`]);
      }
      const joinedHash = hash.join(',');

      if(joinedHash === this.cached) {
        this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
        return;
      }

      this.cached = joinedHash;

      ctx.clearRect(0, 0, dims.w * dpi, dims.w * dpi);
    }

    // console.log(mini, this.opts.data.master ? 'master' : '', this.opts.data.slave ? 'slave' : '', 'render');

    const lineWidth = (opts.additional.mini ? 1 : (opts.data.strokeWidth === 'auto' ? (ysLen > 5 ? 1 : 2) : opts.data.strokeWidth)) * dpi;
    const lineWidthShift = lineWidth % 2 === 0 ? 0 : 0.5;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = opts.additional.mini ? 'square' : 'round';
    // @ts-ignore
    ctx.lineJoin = opts.additional.mini ? 'square' : 'round';

    for(i = 0; i < ysLen; i++) {
      o = mini ? state[`om_${i}`] : state[`o_${i}`];
      e = state[`e_${i}`];

      if(o <= 0) {
        continue;
      }

      y = ys[i].y;
      yFrom = ys[i].yFrom;

      if(opts.pairY) {
        y1 = mini ? state[`y1m_${i}`] : state[`y1_${i}`];
        y2 = mini ? state[`y2m_${i}`] : state[`y2_${i}`];
      } else {
        if(mini) {
          if(e && o < 1) {
            y1 = state['y1m_show'];
            y2 = state['y2m_show'];
          } else if(!e && o < 1) {
            y1 = state['y1m_hidd'];
            y2 = state['y2m_hidd'];
          } else {
            y1 = state['y1m'];
            y2 = state['y2m'];
          }
        } else {
          y1 = state['y1'];
          y2 = state['y2'];
        }
      }

      yScale = dpi * (dims.h - pTop - pBottom) / (y2 - y1);
      yShift = (dims.h - pBottom + (toCache ? 0 : dims.t)) * dpi + y1 * yScale;

      ctx.beginPath();
      ctx.strokeStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];
      ctx.globalAlpha = o * (state[`f_${i}`] * 0.9 + 0.1);

      let yVal: number;
      let xc: number;
      let minY = Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      let prevXc = -Number.MAX_VALUE;
      let prevYc: number;
      let hasPrev = false;
      let needMove = true;

      for(j = xInd1; j <= xInd2; j++) {
        if(zoom) {
          if(j >= d1 && j <= d2) {
            yVal = yFrom[j] + morph * (y[j] - yFrom[j]);
            xw = xwDetail;
          } else {
            yVal = y[j] + morph * (y[d1] - y[j]); // approx
            xw = xwMain;
          }
        } else {
          yVal = y[j];
          xw = xwMain;
        }

        // Skip absent values
        if(isNaN(yVal)) {
          needMove = true;
          continue;
        }

        xc = x[j] * xScale + xShift << 0;
        const yc = yShift - yVal * yScale << 0;

        if(xc > prevXc || (isStepMode && j === d2 + 1)) {
          // Merge vertical lines into one
          if(hasPrev) {
            if(prevYc === minY) {
              ctx.moveTo(prevXc + lineWidthShift, maxY - lineWidthShift);
              ctx.lineTo(prevXc + lineWidthShift, minY - lineWidthShift);
            } else {
              ctx.moveTo(prevXc + lineWidthShift, minY - lineWidthShift);
              ctx.lineTo(prevXc + lineWidthShift, maxY - lineWidthShift);
              if(prevYc !== maxY) {
                ctx.moveTo(prevXc + lineWidthShift, prevYc - lineWidthShift);
              }
            }

            hasPrev = false;
          }

          if(needMove) {
            ctx.moveTo(xc + lineWidthShift, yc - lineWidthShift);
            needMove = false;
          }

          minY = yc;
          maxY = yc;
          ctx.lineTo(xc + lineWidthShift, yc - lineWidthShift);
          isStepMode && ctx.lineTo((x[j] * xScale + xw + xShift << 0) + lineWidthShift, yc - lineWidthShift);
        } else {
          minY = Math.min(minY, yc);
          maxY = Math.max(maxY, yc);
          hasPrev = true;
        }
        prevXc = xc;
        prevYc = yc;
      }

      if(hasPrev) {
        ctx.moveTo(prevXc + lineWidthShift, minY - lineWidthShift);
        ctx.lineTo(prevXc + lineWidthShift, maxY - lineWidthShift);
      }

      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    toCache && this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
  }
}

import {getXIndex} from './utils';
import {TChartUnitOptions} from './types';

export default class TBars {
  private opts: TChartUnitOptions;
  private filteredX1: number[];
  private filteredX2: number[];
  private filteredJ: number[];
  private prevY: number[];
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDarkMode: boolean;
  private w: number;
  private h: number;
  private cached: string;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.filteredX1 = [];
    this.filteredX2 = [];
    this.filteredJ = [];
    this.prevY = [];

    // fillrect dramatically drops fps on iPhones after 5th (4s and 5 are ok, but 5s, SE, 7+ etc are freezing)
    // on direct onscreen canvas draw, so for this case we should use offscreen canvas
    this.$canvas = document.createElement('canvas');
    this.ctx = this.$canvas.getContext('2d', {alpha: false})!;
  }

  onResize() {
    const dpi = this.opts.settings.dpi;
    const dims = this.opts.additional.mini ? this.opts.state.dims.mini : this.opts.state.dims.graph;
    this.$canvas.width = dims.w * dpi;
    this.$canvas.height = dims.h * dpi;
    this.cached = '';
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  render() {
    let i: number, j: number, y: number[], o: number, y1: number, y2: number, xScale: number, yScale: number, yShift: number, yFrom: number[];
    const opts = this.opts;
    const ys = opts.data.ys;
    const state = opts.state;
    const mini = opts.additional.mini;
    const x1 = mini ? state.xg1 : state.x1;
    const x2 = mini ? state.xg2 : state.x2;
    const settings = opts.settings;
    const w = this.w;
    const h = this.h;
    const pTop = settings[`PADD${mini ? '_MINI_BAR' : ''}`][0];
    const pRight = settings[`PADD${mini ? '_MINI_BAR' : ''}`][1];
    const pBottom = settings[`PADD${mini ? '_MINI_BAR' : ''}`][2];
    const pLeft = settings[`PADD${mini ? '_MINI_BAR' : ''}`][3];
    const x = opts.data.x;
    const dpi = opts.settings.dpi;
    let xInd1: number, xInd2: number;
    const ctx = this.ctx;
    const dims = mini ? state.dims.mini : state.dims.graph;
    const zoom = state.zoomMode;
    const d1 = state.detailInd1;
    const d2 = state.detailInd2;
    const zoomMorph = state.zoomMorph === undefined ? 0 : state.zoomMorph;

    const filteredX1 = this.filteredX1;
    const filteredX2 = this.filteredX2;
    const filteredJ = this.filteredJ;
    const prevY = this.prevY;

    const ysLength = ys.length;

    // cache both versions (big one is useful for selection)
    const hash = [dims.w, dims.h, mini ? state.xg1 : state.x1, mini ? state.xg2 : state.x2, this.isDarkMode, zoom];
    if(!mini) {
      hash.push(state.y1);
      hash.push(state.y2);
    }
    for(i = 0; i < ysLength; i++) {
      hash.push(mini ? state[`om_${i}`] : state[`o_${i}`]);
      hash.push(state[`f_${i}`]);
    }
    const joinedHash = hash.join(',');

    if(joinedHash === this.cached) {
      this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
      if(mini) return;
    }

    xScale = (dims.w - pRight - pLeft) / (x2 - x1 + this.opts.data.mainPeriodLen * (1 - zoomMorph));
    xInd1 = Math.floor(getXIndex(x, x1 - pLeft / xScale));
    xInd2 = Math.ceil(getXIndex(x, x2 + pRight / xScale));

    if(zoom && zoomMorph === 1) {
      if(xInd1 < this.opts.state.xg1Ind) xInd1 = this.opts.state.xg1Ind;
      if(xInd2 > this.opts.state.xg2Ind) xInd2 = this.opts.state.xg2Ind - 1;
    }
    xScale *= dpi;
    const xShift = (pLeft) * dpi - x1 * xScale;
    const hBottom = (dims.h - pBottom) * dpi;

    const xwMain = this.opts.data.mainPeriodLen * xScale;
    const xwDetail = this.opts.data.detailPeriodLen * xScale;

    if(joinedHash !== this.cached) {
      ctx.fillStyle = this.opts.settings.COLORS.background;
      ctx.fillRect(0, 0, dims.w * dpi, dims.h * dpi);

      let filteredInd = 0;

      for(j = xInd1; j <= xInd2; j++) {
        let xw: number;
        if(zoom) {
          if(j >= d1 && j <= d2) {
            xw = xwDetail;
          } else {
            xw = xwMain;
          }
        } else {
          xw = xwMain;
        }

        const tmpX1 = Math.round(x[j] * xScale + xShift);
        const tmpX2 = Math.round(x[j] * xScale + xShift + xw);

        if(tmpX2 - tmpX1 > 0) {
          filteredX1[filteredInd] = tmpX1;
          filteredX2[filteredInd] = tmpX2;
          filteredJ[filteredInd] = j;
          prevY[filteredInd] = 0;
          filteredInd++;
        }
      }

      for(i = 0; i < ysLength; i++) {
        o = mini ? state[`om_${i}`] : state[`o_${i}`];

        if(o > 0) {
          y = ys[i].y;
          yFrom = ys[i].yFrom;

          y1 = mini ? state['y1m'] : state['y1'];
          y2 = mini ? state['y2m'] : state['y2'];

          yScale = dpi * (dims.h - pTop - pBottom) / (y2 - y1);
          yShift = (dims.h - pBottom) * dpi + y1 * yScale;

          const k = o * yScale;

          ctx.fillStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];
          ctx.globalAlpha = state[`f_${i}`] * 0.9 + 0.1;

          let yVal;

          ctx.beginPath();
          ctx.moveTo(Math.round(x[xInd2] * xScale + xShift + (zoomMorph === 1 ? xwDetail : xwMain)), Math.round(hBottom));

          if(i > 0) {
            for(j = filteredInd - 1; j >= 0; j--) {
              const curY = hBottom - prevY[j];
              ctx.lineTo(filteredX2[j], Math.round(curY));
              ctx.lineTo(filteredX1[j], Math.round(curY));
            }
          } else {
            ctx.lineTo(Math.round(x[xInd1] * xScale + xShift), Math.round(hBottom));
          }

          for(j = 0; j < filteredInd; j++) {
            const jInd = filteredJ[j];
            if(zoom) {
              if(jInd >= d1 && jInd <= d2) {
                yVal = yFrom[jInd] + zoomMorph * (y[jInd] - yFrom[jInd]);
              } else {
                yVal = y[jInd] + zoomMorph * (y[d1] - y[jInd]); // approximation
              }
            } else {
              yVal = y[jInd];
            }

            yVal = yVal || 0; // absent values

            const curY = ((yShift - yVal * k));
            const curH = hBottom - curY;

            prevY[j] += curH;

            ctx.lineTo(filteredX1[j], Math.round(hBottom - prevY[j]));
            ctx.lineTo(filteredX2[j], Math.round(hBottom - prevY[j]));
          }

          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;

      this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
    }

    // tooltip selection
    if(state.barInd > -1 && !mini) {
      this.opts.ctx.fillStyle = this.opts.settings.COLORS.barsSelectionBackground;
      this.opts.ctx.globalAlpha = state.barO;
      this.opts.ctx.fillRect(0, 0, dims.w * dpi, dims.h * dpi);
      let yStart = 0;

      for(i = 0; i < ysLength; i++) {
        o = state[`o_${i}`];
        if(o > 0) {
          y = ys[i].y;
          yFrom = ys[i].yFrom;
          y1 = state['y1'] as number;
          y2 = state['y2'] as number;
          yScale = dpi * (dims.h - pTop - pBottom) / (y2 - y1);
          yShift = (dims.h - pBottom) * dpi + y1 * yScale;
          const k = o * yScale;

          this.opts.ctx.fillStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];
          this.opts.ctx.globalAlpha = state[`f_${i}`] * 0.9 + 0.1;

          let yVal: number, xw: number;
          if(zoom) {
            if(state.barInd >= d1 && state.barInd <= d2) {
              yVal = yFrom[state.barInd] + zoomMorph * (y[state.barInd] - yFrom[state.barInd]);
              xw = xwDetail;
            } else {
              xw = xwMain;
              yVal = y[state.barInd] + zoomMorph * (y[d1] - y[state.barInd]); // approx
            }
          } else {
            yVal = y[state.barInd];
            xw = xwMain;
          }

          yVal = yVal || 0; // absent values

          const yEnd = hBottom - ((yShift - yVal * k)) + yStart;

          this.opts.ctx.fillRect(
            Math.round(x[state.barInd] * xScale + xShift),
            Math.round(hBottom - yStart + dims.t * dpi),
            Math.max(Math.round(xw), 1),
            Math.round(yStart) - Math.round(yEnd)
          );

          yStart = yEnd;
        }
      }

      ctx.globalAlpha = 1;
    }

    this.cached = joinedHash;
  }
}

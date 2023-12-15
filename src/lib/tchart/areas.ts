import {getXIndex, simplifyData} from './utils';
import {TChartAngle, TChartUnitOptions} from './types';

export default class TAreas {
  private opts: TChartUnitOptions;
  private $canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cached: string;
  private isDarkMode: boolean;
  private savedX1: number;
  private savedX2: number;
  private prevElastic: number;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;

    if(opts.additional.mini) {
      this.$canvas = document.createElement('canvas');
      this.ctx = this.$canvas.getContext('2d', {alpha: true});
    }
  }

  onResize() {
    if(this.opts.additional.mini) {
      var dpi = this.opts.settings.dpi;
      var dims = this.opts.additional.mini ? this.opts.state.dims.mini : this.opts.state.dims.graph;
      this.$canvas.width = dims.w * dpi;
      this.$canvas.height = dims.h * dpi;
      this.cached = '';
    }
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  render() {
    let i, j, y, o, xScale;
    const opts = this.opts;
    const ys = opts.data.ys;
    const state = opts.state;
    const mini = opts.additional.mini;
    const x1 = mini ? state.xg1 : state.x1;
    const x2 = mini ? state.xg2 : state.x2;
    const settings = opts.settings;
    const pTop = settings[`PADD${mini ? '_MINI_AREA' : ''}`][0];
    const pRight = settings[`PADD${mini ? '_MINI_AREA' : ''}`][1];
    const pBottom = settings[`PADD${mini ? '_MINI_AREA' : ''}`][2];
    const pLeft = settings[`PADD${mini ? '_MINI_AREA' : ''}`][3];
    const x = opts.data.x;
    const dpi = opts.settings.dpi;
    const ctx = mini ? this.ctx : this.opts.ctx;
    const prevY = [];
    const totalPerX = [];
    const totalPerY = [];
    const overlap = mini ? 0 : 0;
    const dims = mini ? state.dims.mini : state.dims.graph;
    const zoomMorph = state.zoomMorph === undefined ? 0 : state.zoomMorph;
    let morph = zoomMorph;
    const zoom = state.zoomMode;
    const ysLen = ys.length;

    // cache rendered version
    if(mini) {
      const hash = [dims.w, dims.h, state.xg1, state.xg2, this.isDarkMode, state.zoomMode, zoomMorph];
      for(i = 0; i < ysLen; i++) {
        hash.push(state[`om_${i}`]);
        hash.push(state[`f_${i}`]);
      }
      const joinedHash = hash.join(',');

      if(joinedHash === this.cached) {
        this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
        return;
      }

      this.cached = joinedHash;
    }

    xScale = (dims.w - pRight - pLeft) / (x2 - x1);
    let xInd1 = Math.floor(getXIndex(x, x1 - pLeft / xScale));
    let xInd2 = Math.ceil(getXIndex(x, x2 + pRight / xScale));

    xScale *= dpi;
    const xShift = (pLeft + (mini ? 0 : dims.l)) * dpi - x1 * xScale;
    const hBottom = (dims.h - pBottom + (mini ? 0 : dims.t)) * dpi;

    const visibleCols = [];
    const opacityCols = [];
    let textToCenter = 0; // animation for text moving to center for only 1 selected column
    let fullyVisibleCount = 0;
    let fullyVisibleInd = 0;
    let hasUnfocusedColumns = false;
    for(i = 0; i < ysLen; i++) {
      o = mini ? state[`om_${i}`] : state[`o_${i}`];

      hasUnfocusedColumns = hasUnfocusedColumns || state[`f_${i}`] < 1;

      if(o < 1 && o > 0) {
        textToCenter = o;
      }

      if(o > 0) {
        visibleCols.push(i);
        opacityCols.push(o);

        if(o === 1 && state[`e_${i}`]) {
          fullyVisibleCount++;
          fullyVisibleInd = visibleCols.length - 1;
        }
      }
    }

    const colsLen = visibleCols.length;
    textToCenter = fullyVisibleCount === 1 ? textToCenter : 1;

    const y1 = mini ? state['y1m'] : state['y1'];
    const y2 = mini ? state['y2m'] : state['y2'];
    const optData = simplifyData('line', x, ys, xScale, xShift, visibleCols, xInd1, xInd2, dims.w - pRight - pLeft);

    xInd1 = optData.xInd1;
    xInd2 = optData.xInd2;
    const optX = optData.x;
    const optYs = optData.ys;
    let hasGapsInData = false;

    for(j = xInd1; j <= xInd2; j++) {
      prevY[j] = 0;
      totalPerX[j] = 0;
      for(i = 0; i < colsLen; i++) {
        totalPerX[j] += (optYs[visibleCols[i]].y[j] || 0) * opacityCols[i];
      }
      if(totalPerX[j] === 0) {
        hasGapsInData = true;
      }
    }

    if(hasGapsInData || hasUnfocusedColumns) {
      ctx.fillStyle = this.opts.settings.COLORS.background;
      ctx.fillRect(0, 0, dims.w * dpi, dims.h * dpi);
    }

    let angles: TChartAngle[], radius: number, cx: number, cy: number;

    // calc totals for fractional period so all animations will be transformed for pie representation
    if(zoomMorph > 0 && !mini) {
      if(morph === 1) {
        this.savedX1 = x1;
        this.savedX2 = x2;
      }

      let xInd1Real: number, xInd2Real: number;
      if(morph < 1) {
        const x1AnimItem = this.opts.animator.get('x1');
        const x2AnimItem = this.opts.animator.get('x2');
        const x1End = x1AnimItem ? x1AnimItem.end : this.opts.state['x1'];
        const x2End = x2AnimItem ? x2AnimItem.end : this.opts.state['x2'];
        xInd1Real = getXIndex(x, this.opts.state.zoomDir === -1 ? this.savedX1 : x1End, true);
        xInd2Real = getXIndex(x, this.opts.state.zoomDir === -1 ? this.savedX2 : x2End, true);
      } else {
        xInd1Real = getXIndex(x, x1, true);
        xInd2Real = getXIndex(x, x2, true);
      }
      xInd2Real--;

      var xInd1RealFloor = Math.floor(xInd1Real);
      var xInd1RealCeil = Math.ceil(xInd1Real);
      var xInd2RealFloor = Math.floor(xInd2Real);
      var xInd2RealCeil = Math.ceil(xInd2Real);
      var totalForAll = 0;
      var totalPerItem = [];

      for(i = 0; i < colsLen; i++) {
        totalPerItem[i] = 0;
        const tmpY = ys[visibleCols[i]].y;

        let tmp: number;
        for(j = xInd1RealCeil; j <= xInd2RealFloor; j++) {
          tmp = (tmpY[j] || 0) * opacityCols[i];
          totalPerItem[i] += tmp;
          totalForAll += tmp;
        }

        // partly visible data from left side
        tmp = ((xInd1RealCeil - xInd1Real) * (tmpY[xInd1RealFloor] || 0)) * opacityCols[i];
        totalPerItem[i] += tmp;
        totalForAll += tmp;

        // partly visible data from right side
        tmp = ((xInd2Real - xInd2RealFloor) * (tmpY[xInd2RealCeil] || 0)) * opacityCols[i];
        totalPerItem[i] += tmp;
        totalForAll += tmp;
      }

      // calc angles for pie representation
      const elastic =  this.opts.state.zoomDir === 1 ? Math.pow(Math.min(Math.max(morph < 0.85 ? (morph-0.65)/0.2 : 1 - (morph-0.9)/0.15, 0), 1), 0.8) : this.prevElastic;
      let prevAngle = 2 * Math.PI - Math.PI / (7 - morph) - Math.PI / 8 * elastic;
      const initAngle = prevAngle;


      if(this.opts.state.zoomDir === 1) {
        morph = Math.min(Math.max((morph - 0.25) / 0.4, 0), 1);
        this.prevElastic = elastic;
      } else {
        morph = Math.min(Math.max((morph * 2.4) - 1.4, 0), 1);
      }


      angles = [];
      radius = settings.PIE_RADIUS * (zoomMorph < 1 ? 2.31 : 1) * dpi; // during zoom animation use clipping, then use plain geometry to create sectors
      cx = dpi * (dims.w / 2 + dims.l);
      cy = dpi * (dims.h / 2 + dims.t + 2);
      const rLen =  2 * Math.PI * radius / dpi;
      const pointsPerArcLen = 1 / 13; // 1 point per each 10 pixels of arc
      for(i = 0; i < colsLen; i++) {
        let percentage = totalPerItem[i] / totalForAll;
        percentage = percentage || 0; // absent data
        const len = 2 * Math.PI * percentage;
        let newAngle = prevAngle - len;
        const additionalPoints = Math.round(percentage * rLen * pointsPerArcLen);
        if(i === colsLen - 1) newAngle = initAngle - 2 * Math.PI;
        const overlapAng = Math.PI * 2 * 0.1 / (rLen);
        const yItem = ys[visibleCols[i]];
        angles.push({
          st: prevAngle + overlapAng,
          ed: newAngle - overlapAng,
          mid: prevAngle - len / 2 - overlapAng / 2,
          additionalPoints: Math.max(additionalPoints, 4),
          percentage: percentage === 0 ? 0 : Math.max(Math.round(percentage * 100), 1),
          percentageText: percentage === 0 ? '' : (percentage < 0.01 ? '<1%' : Math.round(percentage * 100) + '%'),
          ind: visibleCols[i],
          value: totalPerItem[i],
          label: yItem.label,
          color: this.isDarkMode ? yItem.colors_n[2] : yItem.colors_d[2]
        });


        prevAngle = newAngle;
      }

      state.pieAngles = angles;
    }

    const yScale = dpi * (dims.h - pTop - pBottom + (mini ? 0 : -4));
    const yShift = (dims.h - pBottom + (mini ? 0 : dims.t)) * dpi;

    let colInd = 0;

    for(i = 0; i < ysLen; i++) {
      o = mini ? state[`om_${i}`] : state[`o_${i}`];

      if(o <= 0) {
        continue;
      }

      y = optYs[i].y;

      const k = o * yScale;

      ctx.fillStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];
      ctx.globalAlpha = state[`f_${i}`] * 0.9 + 0.1;
      ctx.beginPath();

      if(zoomMorph === 0 || !mini) {
        // use regular version to skip complex math evaluations
        // despite of fact that they produce same result for morph === 0
        if(zoomMorph === 0) {
          if(i > 0) {
            ctx.moveTo(optX[xInd2] * xScale + xShift << 0, hBottom - prevY[xInd2] + overlap << 0);
            for(j = xInd2 - 1; j >= xInd1; j--) {
              ctx.lineTo(optX[j] * xScale + xShift << 0, hBottom - prevY[j] + overlap << 0);
            }
          } else {
            ctx.moveTo(optX[xInd2] * xScale + xShift << 0, hBottom << 0);
            ctx.lineTo(optX[xInd1] * xScale + xShift << 0, hBottom << 0);
          }

          if(colInd < colsLen - 1 || hasGapsInData) {
            for(j = xInd1; j <= xInd2; j++) {
              const curY = (yShift - ((y[j] * k / totalPerX[j]) || 0));
              const curH = hBottom - curY;
              let sy = prevY[j] + curH;
              if(sy > yScale) sy = yScale;
              ctx.lineTo(optX[j] * xScale + xShift << 0, hBottom - sy << 0);
              prevY[j] += curH;
            }
          } else {
            ctx.lineTo(optX[xInd1] * xScale + xShift << 0, hBottom - yScale << 0);
            ctx.lineTo(optX[xInd2] * xScale + xShift << 0, hBottom - yScale << 0);
          }
        } else {
          // magic starts here
          const calcTrans = (fromX: number, fromY: number, toAngle: number, toR: number) => {
            let sx = 0;
            let sy = 0;
            if(selectionOffset && fullyVisibleCount > 1) {
              sx = Math.cos(angles[colInd].mid) * selectionOffset * 8 * dpi;
              sy = -Math.sin(angles[colInd].mid) * selectionOffset * 8 * dpi;
            }

            if(toR > radius) toR = radius;
            let fromAngle = Math.atan2(cy - fromY, fromX - cx);
            fromAngle = fromAngle < 0 ? Math.PI * 2 + fromAngle : fromAngle;
            const fromR = Math.pow((cy - fromY) * (cy - fromY) + (fromX - cx) * (fromX - cx), 0.5);

            if(Math.abs(toAngle - fromAngle) > Math.PI * (colsLen === 1 ? 1.5 : 1)) {
              toAngle -= Math.PI * 2;
            }
            if(toAngle < -Math.PI * 2) {
              toAngle -= -Math.PI * 2;
            }

            const ang = fromAngle + morph * (toAngle - fromAngle);
            const r = fromR + morph * (toR - fromR);
            const res = [
              cx + Math.cos(ang) * r + sx,
              cy - Math.sin(ang) * r + sy
            ] as const;

            return res;
          };

          const additionalSteps = (zoomMorph < 1 ? 4 : angles[colInd].additionalPoints);
          let dist: number;
          let cBot = false, cTop = false, xj: number;
          var selectionOffset = state[`pieInd_${visibleCols[colInd]}`] || 0;

          if(angles[colInd].percentage === 0) {
            ctx.globalAlpha = 0;
          }

          let res = calcTrans(optX[xInd2] * xScale + xShift, hBottom - prevY[xInd2], angles[0].st, radius);
          ctx.moveTo(res[0], res[1]);

          if(colInd > 0) {
            for(j = xInd2 - 1; j >= xInd1; j--) {
              xj = optX[j] * xScale + xShift;
              if(xj === cx) cBot = true;
              if(xj >= cx) {
                dist = (xj - cx) / (dims.w * dpi / 2);
                if(morph === 0) dist = 0;
                res = calcTrans(xj, hBottom - prevY[j] + overlap, angles[0].st, radius * dist);
              } else {
                if(!cBot) {
                  cBot = true;
                  const sc = (cx - xj) / (optX[j + 1] * xScale + xShift - xj);
                  const sy1 = hBottom - prevY[j] + overlap;
                  const sy2 = hBottom - prevY[j + 1] + overlap;
                  res = calcTrans(cx, sy1 + sc * (sy2 - sy1), angles[colInd].st, 0);
                  ctx.lineTo(res[0], res[1]);
                }
                dist = (cx - xj) / (dims.w * dpi / 2);
                res = calcTrans(xj, hBottom - prevY[j] + overlap, angles[colInd].st, radius * dist);
              }
              ctx.lineTo(res[0], res[1]);
            }
          } else {
            res = calcTrans(
              optX[xInd1] * xScale + xShift,
              hBottom,
              angles[0].st,
              radius
            );
            ctx.lineTo(res[0], res[1]);
          }

          if(colInd < colsLen - 1) {
            let sy1: number;
            for(j = 0; j <= additionalSteps; j++) {
              const curY = (yShift - ((y[xInd1] * k / totalPerX[xInd1]) || 0));
              const curH = hBottom - curY;
              sy1 = hBottom - prevY[xInd1] + overlap;
              const sy2 = hBottom - prevY[xInd1] - curH;

              res = calcTrans(
                optX[xInd1] * xScale + xShift,
                sy1 + (j / additionalSteps) * (sy2 - sy1),
                angles[colInd].st + (j / additionalSteps) * (angles[colInd].ed - angles[colInd].st),
                radius
              );

              ctx.lineTo(res[0], res[1]);
            }

            for(j = xInd1; j <= xInd2; j++) {
              const curY = (yShift - ((y[j] * k / totalPerX[j]) || 0));
              const curH = hBottom - curY;
              xj = optX[j] * xScale + xShift;

              if(xj === cx) cTop = true;
              if(xj <= cx) {
                dist = (cx - xj) / (dims.w * dpi / 2);
                var xjprev = xj;
                var syprev = hBottom - prevY[j] - curH;
                res = calcTrans(xj, syprev, angles[colInd].ed, radius * dist);
              } else {
                if(!cTop) {
                  cTop = true;
                  const sc = (cx - xjprev) / (xj - xjprev);
                  sy1 = syprev;
                  const sy2 = hBottom - prevY[j] - curH;
                  res = calcTrans(cx, sy1 + sc * (sy2 - sy1), angles[colInd].ed, 0);
                  ctx.lineTo(res[0], res[1]);
                }
                dist = (xj - cx) / (dims.w * dpi / 2);
                if(morph === 0) dist = 0;
                res = calcTrans(xj, hBottom - prevY[j] - curH, angles[0].st, radius * dist);
              }

              ctx.lineTo(res[0], res[1]);
              prevY[j] += curH;
            }

            if(xj < cx) { // last day, haack
              if(!cTop) {
                res = calcTrans(cx, sy1, angles[colInd].ed, 0);
                ctx.lineTo(res[0], res[1]);
              }
            }
          } else {
            for(j = 0; j <= additionalSteps; j++) {
              res = calcTrans(
                (optX[xInd1] + (j / additionalSteps) * (optX[xInd2] - optX[xInd1])) * xScale + xShift,
                0,
                angles[colInd].st + (j / additionalSteps) * (angles[0].st - 2 * Math.PI  - angles[colInd].st),
                radius
              );

              ctx.lineTo(res[0], res[1]);
            }
          }
        }
      } else {
        const xw = this.opts.data.mainPeriodLen * xScale;

        ctx.moveTo(optX[xInd2] * xScale + xw + xShift, hBottom - prevY[xInd2]);

        if(i > 0) {
          ctx.lineTo(optX[xInd2] * xScale + xShift, hBottom - prevY[xInd2]);

          for(j = xInd2; j >= xInd1 + 1; j--) {
            ctx.lineTo(optX[j] * xScale + xShift, hBottom - (prevY[j] + morph * (prevY[j - 1] - prevY[j])) + overlap);
            ctx.lineTo(optX[j - 1] * xScale + xShift, hBottom - prevY[j - 1] + overlap);
          }
        } else {
          ctx.lineTo(optX[xInd1] * xScale + xShift, hBottom);
        }

        let curHNext: number;
        if(colInd < colsLen - 1) {
          for(j = xInd1; j <= xInd2 - 1; j++) {
            let curY = (yShift - ((y[j] * k / totalPerX[j]) || 0));
            const curH = hBottom - curY;

            if(j === xInd1) {
              ctx.lineTo(optX[xInd1] * xScale + xShift, hBottom - prevY[xInd1] - curH);
            }

            curY = (yShift - ((y[j + 1] * k / totalPerX[j + 1]) || 0));
            curHNext = hBottom - curY;

            const yTo = prevY[j] + curH;
            const yFrom = prevY[j + 1] + curHNext;

            ctx.lineTo(optX[j+1] * xScale + xShift, hBottom - (yFrom + morph * (yTo - yFrom)));
            ctx.lineTo(optX[j+1] * xScale + xShift, hBottom - yFrom);

            if(j === xInd2 - 1) {
              ctx.lineTo(optX[xInd2] * xScale + xw + xShift, hBottom - prevY[xInd2] - curHNext);
            }

            prevY[j] += curH;
          }
        } else {
          ctx.lineTo(optX[xInd1] * xScale + xShift << 0, hBottom - yScale << 0);
          ctx.lineTo(optX[xInd2] * xScale + xShift << 0, hBottom - yScale << 0);
        }

        prevY[xInd2] += curHNext;
      }

      ctx.closePath();
      ctx.fill();

      // texts
      if(!mini && zoomMorph > 0 && angles[colInd].percentageText) {
        const opacity = Math.pow(morph, this.opts.state.zoomDir === 1 ? 4 : 20) * o * (state[`f_${i}`] * 0.9 + 0.1);
        let fontSize = Math.max(Math.min(angles[colInd].percentage * 2, 26), 10);
        const rad = settings.PIE_RADIUS;
        let offset = rad * 2 / 3;
        const cosVal = Math.cos(angles[colInd].mid);
        const sinVal = Math.sin(angles[colInd].mid);
        const isOutboard = angles[colInd].percentage < opts.data.pieLabelsPercentages.outboard;

        let sx = 0;
        let sy = 0;
        if(selectionOffset && fullyVisibleCount > 1) {
          sx = cosVal * selectionOffset * 8 * dpi;
          sy = -sinVal * selectionOffset * 8 * dpi;
        }

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.globalAlpha = opacity;

        if(angles[colInd].percentage < opts.data.pieLabelsPercentages.hoverOnly) {
          ctx.globalAlpha = selectionOffset * opacity;
        }

        if(isOutboard) {
          fontSize = Math.max(fontSize, 14);
          offset = rad + fontSize / 3 + 13;
          ctx.fillStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];
          ctx.lineWidth = 1;
          ctx.strokeStyle = this.isDarkMode ? ys[i].colors_n[0] : ys[i].colors_d[0];

          const lx1 = cx + sx + (cosVal * (rad - 1)) * dpi;
          const ly1 = cy + sy - (sinVal * (rad - 1)) * dpi;
          const lx2 = cx + sx + (cosVal * (rad + 6 * (1 - selectionOffset) - 1)) * dpi;
          const ly2 = cy + sy - (sinVal * (rad + 6 * (1 - selectionOffset) - 1)) * dpi;

          ctx.beginPath();
          ctx.moveTo(lx1, ly1);
          ctx.lineTo(lx2, ly2);
          ctx.stroke();
        }

        const dx = (cosVal * offset) * (fullyVisibleInd === colInd ? textToCenter : 1);
        const tx = cx + sx + dx * dpi + (isOutboard ? (fontSize / 4 * angles[colInd].percentageText.length * dx / offset) * dpi : 0);
        const ty = cy + sy - (sinVal * offset) * (fullyVisibleInd === colInd ? textToCenter : 1) * dpi;

        ctx.font = `${opts.settings.FONT.bold} ${fontSize * dpi}px ${opts.settings.FONT.family}`;
        ctx.fillText(angles[colInd].percentageText, tx, ty + fontSize * dpi / 2.9);// fontSize * dpi / 2.9 cause text render point is baseline

        ctx.globalAlpha = 1;
      }

      colInd++;
    }

    ctx.globalAlpha = 1;

    mini && this.opts.ctx.drawImage(this.$canvas, dims.l * dpi, dims.t * dpi);
  }
}

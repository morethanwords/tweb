import {statsFormatDay, statsFormatDayHour, statsFormatDayHourFull, statsFormatMin} from './format';
import {TChartData} from './types';

Math.log2 ||= function(x) {
  return Math.log(x) * Math.LOG2E;
};

Math.log10 ||= function(x) {
  return Math.log(x) * Math.LOG10E;
};

export function simplifyData(tp: any, x: number[], ys: TChartData['ys'], xScale: number, xShift: number, visibleCols: number[], xInd1: number, xInd2: number, dw: number) {
  const pointsPerPixel = (xInd2 - xInd1) / dw;
  const optX: number[] = [];
  const optYs: {y: number[]}[] = [];

  if(pointsPerPixel <= 1) {
    return {
      xInd1: xInd1,
      xInd2: xInd2,
      x: x,
      ys: ys
    };
  } else {
    let xInd = 0;
    let xPrev = -999999999;
    const colsLen = visibleCols.length;
    let cnt: number;

    for(let i = xInd1; i <= xInd2; i++) {
      const tmpX = x[i] * xScale + xShift << 0;
      const notTheSame = tmpX > xPrev;

      if(notTheSame) {
        optX[xInd] = x[i];
        xInd++;
      } else {
        cnt++;
      }

      // calc avg y per column that fits inside same x in pixels
      for(let j = 0; j < colsLen; j++) {
        const visColInd = visibleCols[j];
        optYs[visColInd] = optYs[visColInd] || {y: []};
        const prevOptY = optYs[visColInd].y[xInd - 1];
        const curY = ys[visColInd].y[i];
        if(prevOptY === undefined) {
          optYs[visColInd].y[xInd - 1] = curY;
        } else {
          optYs[visColInd].y[xInd - 1] += curY;
        }
        if(xInd > 1) {
          if(notTheSame) {
            optYs[visColInd].y[xInd - 2] /= cnt;
          }
          if(i === xInd2) {
            optYs[visColInd].y[xInd - 1] /= cnt;
          }
        }
      }

      if(notTheSame) {
        cnt = 1;
      }

      xPrev = tmpX;
    }

    xInd1 = 0;
    xInd2 = xInd - 1;

    return {
      isOptimized: pointsPerPixel > 1,
      xInd1: 0,
      xInd2: xInd - 1,
      x: optX,
      ys: optYs
    };
  }
}

export function getElemPagePos($el: HTMLElement) {
  const rect = $el.getBoundingClientRect();

  return {
    x: rect.left + (window.pageXOffset || document.documentElement.scrollLeft),
    y: rect.top + (window.pageYOffset || document.documentElement.scrollTop)
  };
}

export function getXIndex(x: number[], xc: number, doNotClip?: boolean) {
  let i1 = 0;
  let i2 = x.length - 1;

  if(!doNotClip) {
    if(xc < x[i1]) {
      xc = x[i1];
    } else if(xc > x[i2]) {
      xc = x[i2];
    }
  }

  while(Math.abs(i1 - i2) > 1) {
    const i = Math.round((i1 + i2) / 2);

    if(xc >= x[i1] && xc <= x[i]) {
      i2 = i;
    } else {
      i1 = i;
    }
  }

  return i1 + (xc - x[i1]) / (x[i2] - x[i1]);
}

export function triggerEvent(eventName: string, details: any) {
  if(typeof(window.CustomEvent) !== 'function') return;
  document.dispatchEvent(new CustomEvent(eventName, {detail: details || null}));
}

export function isTouchDevice() {
  const prefixes = ' -webkit- -moz- -o- -ms- '.split(' ');
  const mq = (query: string) => {
    return window.matchMedia(query).matches;
  };

  // @ts-ignore
  if(('ontouchstart' in window) || (window as any).DocumentTouch && document instanceof DocumentTouch) {
    return true;
  }

  const query = ['(', prefixes.join('touch-enabled),('), 'heartz', ')'].join('');
  return mq(query);
}

export function drawRoundedRect(ctx: CanvasRenderingContext2D, dpi: number, w: number, h: number, x: number, y: number, r: [number, number, number, number] | number) {
  w *= dpi;
  h *= dpi;
  x *= dpi;
  y *= dpi;

  if(typeof(r) === 'number') {
    r = [r, r, r, r];
  }

  r[0] *= dpi; // tl
  r[1] *= dpi; // tr
  r[2] *= dpi; // br
  r[3] *= dpi; // bl

  ctx.beginPath();
  ctx.moveTo(x + r[0], y);
  ctx.lineTo(x + w - r[1], y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
  ctx.lineTo(x + r[3], y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
  ctx.lineTo(x, y + r[0]);
  ctx.quadraticCurveTo(x, y, x + r[0], y);
  ctx.closePath();
}

export function drawRoundedRect2(ctx: CanvasRenderingContext2D, dpi: number, w: number, h: number, x: number, y: number, r: number) {
  w *= dpi;
  h *= dpi;
  x *= dpi;
  y *= dpi;
  r *= dpi;

  if(w < 2 * r) r = w / 2;
  if(h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Formatter = (x: number, isZoom?: boolean, unknown?: boolean) => string;

export function getFormatter(formatterName: 'xRangeFormatter' | 'xTickFormatter' | 'xTooltipFormatter' | 'yTickFormatter' | 'yTooltipFormatter', data: TChartData, zoomMorph: number): Formatter {
  const lookupIn = zoomMorph && zoomMorph > 0.5 && data.details ? data.details : data;
  const f: string = lookupIn[formatterName as keyof typeof lookupIn];
  const map: Record<string, Formatter> = {
    'statsFormatDayHourFull': (value) => statsFormatDayHourFull(value, data),
    'statsFormatDayHour': (value) => statsFormatDayHour(value, data),
    'statsFormat(\'week\')': (value) => statsFormatDay(value, data),
    'statsFormat(\'day\')': (value) => statsFormatDay(value, data),
    'statsFormat(\'hour\')': (value) => statsFormatMin(value, data),
    'statsFormat(\'5min\')': (value) => statsFormatMin(value, data),
    'statsFormatTooltipValue': yTooltipFormatter,
    'statsTooltipFormat(\'week\')': (value) => data.getLabelDate(value),
    'statsTooltipFormat(\'day\')': (value) => data.getLabelDate(value),
    'statsTooltipFormat(\'hour\')': (value) => data.getLabelTime(value),
    'statsTooltipFormat(\'5min\')': (value) => data.getLabelTime(value),
    'null': (value) => '' + value
  };

  let formatter = map[f] || map['null'];
  if(f === 'null') {
    const m: Record<string, Formatter> = {
      xRangeFormatter: (value) => data.getLabelDate(value, {isShort: false, isMonthShort: false}),
      yTickFormatter: yTickFormatter as any
    };

    formatter = m[formatterName] || formatter;
  }

  return formatter;
}

export function yTickFormatter(val: number, step: number, isFractional?: boolean) {
  if(val === 0) return '' + 0;

  if(step < 1000) {
    return '' + Math.floor(val);
  } else {
    if(step >= 1000 && step < 1000000) {
      if(isFractional) {
        return Math.floor(10 * val / 1000) / 10 + 'K';
      } else {
        return Math.round(val / 1000) + 'K';
      }
    } else {
      if(isFractional) {
        return Math.floor(10 * val / 1000000) / 10 + 'M';
      } else {
        return Math.round(val / 1000000) + 'M';
      }
    }
  }
}

export function yTooltipFormatter(val: number | string) {
  if(typeof(val) !== 'number') {
    return typeof(val) === 'string' ? val : '?';
  }
  // var endingZeroesReg = new RegExp('\\.0+$', 'g');
  // var numValue = item.y[xInd];
  // if (typeof numValue === 'number') {
  //     numValue = numValue.toFixed(2).toString(10);
  // } else {
  //     numValue = numValue + '';
  // }
  // this.labels[ind].$valueText.nodeValue = numValue.replace(endingZeroesReg, '').replace(thSepReg, ' ');
  return statsFormatKMBT(val);
}

export function statsFormatKMBT(val: number, kmbt?: string, precision?: number) {
  if(val === 0) {
    return '0';
  }
  if(kmbt === undefined) {
    kmbt = statsChooseNumKMBT(val);
  }
  const sval = statsFormatFixedKMBT(val, kmbt);
  if(precision === undefined) {
    precision = statsChoosePrecision(sval);
  }
  return sval.toFixed(precision) + kmbt;
}

export function statsFormatFixedKMBT(val: number, kmbt: string) {
  switch(kmbt) {
    case 'K':
      return val / 1000;
    case 'M':
      return val / 1000000;
    case 'B':
      return val / 1000000000;
    case 'T':
      return val / 1000000000000;
  }
  return val
}

export function statsChoosePrecision(val: number) {
  var absVal = Math.abs(val);
  if(absVal > 10) {
    return 0;
  }
  if(absVal >= 1.0) {
    return (Math.abs(absVal - Math.floor(absVal)) < 0.001) ? 0 : 1;
  }
  return 2;
}

export function statsChooseNumKMBT(val: number) {
  var absVal = Math.abs(val);
  if(absVal >= 1000000000000) {
    return 'T';
  } else if(absVal >= 1000000000) {
    return 'B';
  } else if(absVal >= 1000000) {
    return 'M';
  } else if(absVal >= 2000) {
    return 'K';
  }
  return '';
}

type RoundedRange = {
  good?: boolean,
  yMin: number,
  yMax: number,
  yMinOrig: number,
  yMaxOrig: number
};
export function roundRange(y1: number, y2: number, cnt?: number, refRange?: RoundedRange): RoundedRange {
  // for paired graphs, second one should fit range of the first one (wich is rounded)
  if(Math.abs(y2 - y1) < 1) {
    y1 -= y1 / 10;
    y2 += y2 / 10;
  }
  if(refRange) {
    const yd1 = (refRange.yMinOrig - refRange.yMin) / (refRange.yMaxOrig - refRange.yMinOrig);
    const yd2 = (refRange.yMax - refRange.yMaxOrig) / (refRange.yMaxOrig - refRange.yMinOrig);
    return {
      yMin: y1 - (y2 - y1) * yd1,
      yMax: y2 + (y2 - y1) * yd2,
      yMinOrig: y1,
      yMaxOrig: y2
    };
  }

  const calc = (d: number) => {
    const power = curPower * d;
    const min = Math.floor(y1 / power) * power;
    const max = min + cnt * Math.ceil((y2 - min) * scale / power) * power;

    return {
      good: max <= maxLevel && min >= minLevel,
      yMin: Math.round(min),
      yMax: Math.round(max),
      yMinOrig: y1,
      yMaxOrig: y2
    };
  };

  const scale = 1 / cnt;
  const step = (y2 - y1) * scale;
  let curPower = Math.max(Math.pow(10, Math.floor(Math.log10(step))), 1);
  const minLevel = y1 - step * 0.5;
  const maxLevel = y2 + step * 0.5;
  let range;

  let c = 1;

  while(true) {
    range = calc(5);
    if(range.good) break;
    range = calc(2);
    if(range.good) break;
    range = calc(1);
    if(range.good) break;
    curPower *= 0.1;
    c++;
    if(c > 10) { // seems impossible? but have no time to prove it, so this is save exit from cycle
      return {
        yMinOrig: y1,
        yMaxOrig: y2,
        yMin: y1,
        yMax: y2
      };
    }
  }

  return range;
}

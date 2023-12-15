import TAnimator from './animator';
import TAreas from './areas';
import TAxisX from './axisX';
import TAxisY from './axisY';
import TBars from './bars';
import TComposer from './composer';
import TFade from './fade';
import THandle from './handle';
import TLines from './lines';
import TSwitchers from './switchers';
import TTip from './tip';
import {getFormatter, getXIndex, roundRange, triggerEvent} from './utils';
import {TChartAnimationProperty, TChartConstructorOptions, TChartData, TChartDataDetails, TChartRange, TChartRangePaired, TChartRangeSingle, TChartSettings, TChartState, TChartStateZoom, TChartType, TChartTypeRenderer, TChartUnitOptions} from './types';
import {getLabelDate, getLabelTime} from './format';
import './chart.scss';

export default class TChart {
  private opts: TChartConstructorOptions;
  private state: TChartState;
  private specialZoomTransition: boolean;
  private settings: TChartSettings;
  private data: TChartData;
  private pairY: boolean;
  private graphStyle: TChartType;
  private ww: number;
  private switcherLeaveTimeout: number;
  private zoomEnterSpeed: number;
  private hasSavedData: boolean;

  public axisY: TAxisY;
  public fade: TFade;
  public axisX: TAxisX;
  private composer: TComposer;
  private switchers: TSwitchers;
  public handle: THandle;
  private animator: TAnimator;
  private tip: TTip;
  private slaveChart: TChart;
  public graph: TChartTypeRenderer;
  public mini: TChartTypeRenderer;

  public $el: HTMLElement;
  public $wrapper: HTMLElement;
  private $switchers: HTMLElement;
  private $graph: HTMLElement;
  private $h1: HTMLElement;
  private $zoom: HTMLElement;

  public static render(opts: TChartConstructorOptions) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tchart--wrapper';
    opts.container.appendChild(wrapper);
    opts.container = wrapper;

    const tChart = new TChart(opts);
    tChart.$wrapper = wrapper;
    return tChart;
  }

  constructor(opts: TChartConstructorOptions) {
    this.state = {} as any;

    this.state.masterVisibility = 1;
    this.state.slaveVisibility = 0;
    this.specialZoomTransition = undefined;

    const isIEOld = ((!!(window as any).ActiveXObject && +(/msie\s(\d+)/i.exec(navigator.userAgent)[1])) || NaN - 0) < 11
    const isIE11 = navigator.userAgent.indexOf('Trident/') !== -1 && (navigator.userAgent.indexOf('rv:') !== -1 || navigator.appName.indexOf('Netscape') !== -1)

    const DAY_COLORS: TChartSettings['COLORS'] = {
      background: '#FFFFFF',
      backgroundRgb: [255, 255, 255],
      text: '#000000',
      dates: '#000',
      grid: 'rgba(24, 45, 59, 0.1)',
      axis: {
        x: 'rgba(37,37,41,0.5)',
        y: 'rgba(37,37,41,0.5)'
      },
      barsSelectionBackground: 'rgba(255, 255, 255, 0.5)',
      miniMask: 'rgba(226, 238, 249, 0.6)',
      miniFrame: '#C0D1E1'
    };

    const NIGHT_COLORS: TChartSettings['COLORS'] = {
      background: '#242F3E',
      backgroundRgb: [36, 47, 62],
      text: '#FFFFFF',
      dates: '#fff',
      grid: 'rgba(255, 255, 255, 0.1)',
      axis: {
        x: 'rgba(163,177,194,0.6)',
        y: 'rgba(236,242,248,0.5)'
      },
      barsSelectionBackground: 'rgba(36, 47, 62, 0.5)',
      miniMask: 'rgba(48, 66, 89, 0.6)',
      miniFrame: '#56626D'
    };

    const darkMode = !!document.documentElement.classList.contains('dark');
    this.settings = {
      isIE: isIEOld || isIE11,
      isEdge: /Edge\/\d./i.test(navigator.userAgent),
      dpi: Math.min(window.devicePixelRatio || 1, 2),
      darkMode: darkMode,
      ALL_LABEL: 'All',
      Y_AXIS_RANGE: 5.3, // 0.3 this is part of one step, graph is overflowed above last y axis for this value, so take care of it
      PADD: [20, 16, 20, 16],
      PADD_MINI: [2, 0, 2, 0],
      PADD_MINI_BAR: [0, 0, 0, 0],
      PADD_MINI_AREA: [0, 0, 0, 0],
      Y_LABELS_WIDTH: 50,
      X_LABELS_HEIGHT: 12,
      DATES_HEIGHT: 18,
      DATES_WIDTH: 300,
      DATES_SIDE: 'right',
      DATES_WEIGHT: 'bold',
      ZOOM_TEXT: 'Zoom Out',
      MINI_GRAPH_HEIGHT: 40,
      MINI_GRAPH_TOP: 14,
      MINI_GRAPH_BOTTOM: 2,
      FADE_HEIGHT: 16,
      PIE_RADIUS: 130,
      FONT: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        bold: 'bold',
        normal: 'normal'
      },
      COLORS: darkMode ? NIGHT_COLORS : DAY_COLORS,
      ...(opts.settings || {})
    };

    this.data = {
      caption: opts.data.title,
      detailsFunc: opts.data.x_on_zoom,
      hasDetail: !!opts.data.x_on_zoom,
      slave: opts.slave,
      yTickFormatter: opts.data.yTickFormatter,
      yTooltipFormatter: opts.data.yTooltipFormatter,
      yMinStep: opts.data.yMinStep,
      xTickFormatter: opts.data.xTickFormatter,
      xTooltipFormatter: opts.data.xTooltipFormatter,
      xRangeFormatter: opts.data.xRangeFormatter,
      strokeWidth: opts.data.strokeWidth || 'auto',
      hidden: opts.data.hidden || [],
      tooltipOnHover: !!opts.data.tooltipOnHover,
      forceLegend: opts.data.forceLegend,
      sideLegend: opts.data.sideLegend || false,
      pieZoomRange: opts.data.pieZoomRange || 7 * 86400 * 1000,
      pieLabelsPercentages: {
        outboard: opts.data.pieLabelsPercentages && opts.data.pieLabelsPercentages.outboard !== undefined ? opts.data.pieLabelsPercentages.outboard : 5,
        hoverOnly: opts.data.pieLabelsPercentages && opts.data.pieLabelsPercentages.hoverOnly !== undefined ? opts.data.pieLabelsPercentages.hoverOnly : 2
      },
      subchart: {
        show: opts.data.subchart && opts.data.subchart.show !== undefined ? opts.data.subchart.show : true,
        defaultZoom: opts.data.subchart && opts.data.subchart.defaultZoom
      },
      getLabelDate: opts.data.getLabelDate || getLabelDate,
      getLabelTime: opts.data.getLabelTime || getLabelTime
    };

    if(opts.data.y_scaled) {
      this.pairY = true;
    }

    this.graphStyle = 'line';
    const settings = this.settings;

    // transform data to more convinient format
    opts.data.columns.forEach((item) => {
      const id = item.shift() as any as string;
      const tp = opts.data.types[id];

      if(tp === 'x') {
        this.data.x = item;

        this.state.xCount = item.length;
        this.state.x1 = item[(item.length * 0.75) << 0]; // initial zoom if no defaultZoom set
        this.state.x2 = item[item.length - 1];
        this.state.xg1 = item[0];
        this.state.xg2 = item[item.length - 1];
        this.state.xg1Ind = 0;
        this.state.xg2Ind = item.length - 1;
        this.state.xMainMin = item[0];
        this.state.xMainMax = item[this.state.xg2Ind];
        this.state.xgMin = item[0];
        this.state.xgMax = item[this.state.xg2Ind];

        const defaultZoom = this.getDefaultZoom({
          x1: this.state.x1,
          x2: this.state.x2,
          xg1: this.state.xg1,
          xg2: this.state.xg2,
          default: this.data.subchart.defaultZoom
        });

        this.state.x1 = defaultZoom.x1;
        this.state.x2 = defaultZoom.x2;

        this.data.mainPeriodLen = this.data.x[1] - this.data.x[0];
        this.data.detailPeriodLen = this.data.mainPeriodLen; // first detail upload would set correct value

        this.data.dates = [];
        this.data.datesShort = [];
        this.data.datesRange = [];

        const xTooltipFormatter = getFormatter('xTooltipFormatter', this.data, 0);
        const xTickFormatter = getFormatter('xTickFormatter', this.data, 0);
        const xRangeFormatter = this.data.subchart.show ? getFormatter('xRangeFormatter', this.data, 0) : undefined;
        let maxXTickLength = 0;

        item.forEach((item, ind) => {
          this.data.dates[ind] = xTooltipFormatter(item, false);
          this.data.datesShort[ind] = xTickFormatter(item, false);

          if(xRangeFormatter) {
            this.data.datesRange[ind] = xRangeFormatter(item, false);
          }

          if(this.data.datesShort[ind].length > maxXTickLength) {
            maxXTickLength = this.data.datesShort[ind].length;
          }
        });

        this.data.maxXTickLength = maxXTickLength;
      } else {
        this.data.ys = this.data.ys || [];
        this.data.yIds = this.data.yIds || {};

        const color = opts.data.colors[id];
        this.data.ys.push({
          colors_d: [color, color, color], // light mode colors: [line/area/bar/step, switcher/y_labels(for y_scaled type), tooltip entry]
          colors_n: [color, color, color], // dark ones
          label: opts.data.names[id],
          y: item,
          tp: tp,
          id: id
        });

        // if(tp === 'line' || tp === 'step') {
        //   DAY_COLORS.axis = {
        //     x: '#8E8E93',
        //     y: '#8E8E93'
        //   };
        //   NIGHT_COLORS.axis = {
        //     x: 'rgba(163,177,194,0.6)',
        //     y: 'rgba(163,177,194,0.6)'
        //   };
        // }

        const yind = this.data.ys.length - 1;

        const isVisible = this.data.hidden.indexOf(id) === -1;

        this.data.yIds[id] = yind;
        this.state[`e_${yind}`] = isVisible;
        this.state[`o_${yind}`] = isVisible ? 1 : 0;
        this.state[`om_${yind}`] = isVisible ? 1 : 0;
        this.state[`pieInd_${yind}`] = 0;
        this.state[`f_${yind}`] = 1;

        this.graphStyle = tp as TChartType;
      }
    });

    this.state.activeColumnsCount = this.data.ys.length;
    this.updateSpeed();

    // @ts-ignore
    if(this.graphStyle === 'area') {
      settings.Y_AXIS_RANGE = 4.06;
      this.data.hasDetail = true;
    }

    // reduce global range to exclude data gaps
    const reducedRange = this.reduceGlobalRange({});

    if(reducedRange.isReduced) {
      this.state.x1 = reducedRange.x1;
      this.state.x2 = reducedRange.x2;
      this.state.xg1 = reducedRange.xg1;
      this.state.xg2 = reducedRange.xg2;
      this.state.xg1Ind = reducedRange.xg1Ind;
      this.state.xg2Ind = reducedRange.xg2Ind;
    }

    this.createDOM(opts.container);

    window.addEventListener('resize', this.onResize);

    document.addEventListener('darkmode', () => {
      this.setDarkMode(!this.darkMode);
    }, false);

    document.addEventListener('chart-hide-tips', (e: any) => {
      e.detail.except !== this && this.tip.toggle(false);
    }, false);

    this.opts = opts;

    this.onResize();

    this.darkMode && this.setDarkMode(this.darkMode);

    // detect dpi changes
    window.matchMedia('(-webkit-min-device-pixel-ratio: 1), (min-resolution: 96dpi)').addListener(this.onResize);
    window.matchMedia('(-webkit-min-device-pixel-ratio: 1.5), (min-resolution: 144dpi)').addListener(this.onResize);
    window.matchMedia('(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)').addListener(this.onResize);
    window.matchMedia('(-webkit-min-device-pixel-ratio: 3), (min-resolution: 288dpi)').addListener(this.onResize);
  }

  private get darkMode() {
    return this.settings.darkMode;
  }

  reduceGlobalRange(params: TChartStateZoom) {
    let x1 = params.x1 === undefined ? this.state.x1 : params.x1;
    let x2 = params.x2 === undefined ? this.state.x2 : params.x2;
    const xg1Orig = params.xg1 === undefined ? this.state.xg1 : params.xg1;
    const xg2Orig = params.xg2 === undefined ? this.state.xg2 : params.xg2;
    const x = params.useSaved ? this.data.saved.x : this.data.x;


    const xg1Ind = Math.floor(getXIndex(x, this.state.xgMin));
    const xg2Ind = Math.ceil(getXIndex(x, this.state.xgMax));

    let minXInd = xg2Ind;
    let maxXInd = xg1Ind;
    let shift = this.state.zoomMode ? (this.graphStyle === 'bar' || this.graphStyle === 'step' ? 1 : 2) : 0;

    if(this.graphStyle === 'area') shift = 0; // has no details insertion

    this.data.ys.forEach((item, ind) => {
      var y = params.useSaved ? this.data.saved.y[ind] : item.y;
      if(this.state[`e_${ind}`]) {
        for(let i = xg1Ind; i <= xg2Ind - shift; ++i) {
          const v = y[i];
          if(v !== undefined) {
            minXInd = Math.min(minXInd, i);
            maxXInd = Math.max(maxXInd, i);
          }
        }
      }
    });

    if((maxXInd + shift) === xg2Ind) {
      maxXInd = xg2Ind - Math.max(shift - 1, 0);
    }

    if(minXInd >= maxXInd) {
      return {
        isReduced: false
      };
    }

    const xg1 = x[minXInd];
    const xg2 = x[maxXInd];

    if(xg1Orig === xg1 && xg2Orig === xg2) {
      return {
        isReduced: false
      };
    }

    if(x2 > xg2) {
      x1 = xg2 - (x2 - x1);
      x2 = xg2;
      if(x1 < xg1) {
        x1 = xg1;
      }
    } else if(x1 < xg1) {
      x2 = xg1 + (x2 - x1);
      x1 = xg1;
      if(x2 > xg2) {
        x2 = xg2;
      }
    }

    return {
      isReduced: true,
      x1: x1,
      x2: x2,
      xg1: xg1,
      xg2: xg2,
      xg1Ind: minXInd,
      xg2Ind: maxXInd
    };
  }

  getDefaultZoom(params: TChartStateZoom) {
    if(!params.default) {
      return {
        x1: params.x1,
        x2: params.x2
      };
    }

    const res: TChartStateZoom = {};
    res.x1 = params.default[0];
    res.x2 = params.default[1];
    res.x1 = Math.max(res.x1, params.xg1);
    res.x2 = Math.min(res.x2, params.xg2);

    if(res.x1 >= res.x2) {
      res.x1 = params.xg1;
      res.x2 = params.xg2;
    }

    return res;
  }

  updateSpeed(speed?: number) {
    const points = this.state.activeColumnsCount * this.state.xCount * Math.pow((this.state.x2 - this.state.x1) / (this.state.xMainMax - this.state.xMainMin), 0.5);
    const periods = (this.state.deviceSpeed * points / 16.66 << 0);
    let k = Math.max(1 - 0.25 * periods, 0);
    k = Math.pow(k, 0.85);
    if(this.state.deviceSpeed === undefined) {
      speed = 1;
    }
    speed = 1;
    this.state.speed = speed === undefined ? k : speed;
    return this.state.speed;
  }

  getYMinMax(x1: number, x2: number, isMini: boolean, fitTo?: boolean, useSaved?: boolean): TChartRange {
    if(this.graphStyle === 'area') {
      return {
        min: 0,
        max: 102
      };
    }

    const graphAreaWidth = this.state.dims ? this.state.dims.graph.w : this.getGraphWidth(this.data.sideLegend).width;

    let yMin = Number.MAX_VALUE;
    let yMax = -Number.MAX_VALUE;
    const datePerPixel = (x2 - x1) / graphAreaWidth;

    let start = getXIndex(useSaved ? this.data.saved.x : this.data.x, x1 - datePerPixel * this.settings.PADD[3]);
    let end = getXIndex(useSaved ? this.data.saved.x : this.data.x, x2 + datePerPixel * this.settings.PADD[1]);
    const yMinStep = this.data.yMinStep || 1;
    const resMin: number[] = [];
    const resMax: number[] = [];
    const settings = this.settings;
    const state = this.state;
    let prevRange: ReturnType<typeof roundRange>;
    let yFirst: number;
    let yLast: number;

    if(!useSaved && this.state.zoomMode) { // not backing up from zoom mode
      start = Math.max(start, this.state.detailInd1);
      end = Math.min(end, this.state.detailInd2);
    } else {
      start = Math.max(start, 0);
      end = Math.min(end, this.data.x.length - 1);
    }

    const floorStart = Math.floor(start);
    const ceilStart = Math.ceil(start);
    const floorEnd = Math.floor(end);
    const ceilEnd = Math.ceil(end);

    const proceedMinMax = (yMin: number, yMax: number, ind?: number, refRange?: ReturnType<typeof roundRange>) => {
      let range: ReturnType<typeof roundRange>;
      if(yMin === Number.MAX_VALUE) {
        if(isMini) {
          if(ind === undefined) {
            yMin = state.y1m as number;
            yMax = state.y2m as number;
          } else {
            yMin = state[`y1m_${ind}`] as number;
            yMax = state[`y2m_${ind}`] as number;
          }
        } else {
          if(ind === undefined) {
            yMin = state.y1 as number;
            yMax = state.y2 as number;
          } else {
            yMin = state[`y1_${ind}`] as number;
            yMax = state[`y2_${ind}`] as number;
          }
        }
      } else {
        if(this.graphStyle === 'bar') {
          yMin = 0;
        }

        yMin = Math.floor(yMin);
        yMax = Math.ceil(yMax);

        if(fitTo) {
          // second pair should fit it scale to first one exactly
          // but only then first one is enabled
          // refRange holds data to fit within
          range = roundRange(yMin, yMax, settings.Y_AXIS_RANGE, refRange);
          yMin = range.yMin;
          yMax = range.yMax;
          if(Math.abs(yMin - yMax) < settings.Y_AXIS_RANGE * yMinStep) {
            yMax = yMin + Math.floor(settings.Y_AXIS_RANGE * yMinStep);
          }
        }
      }

      if(Math.abs(yMin - yMax) < 0.1) {
        yMax++;
      }

      return {
        min: yMin,
        max: yMax,
        range: range
      };
    };

    if(this.graphStyle === 'line' || this.graphStyle === 'step') {
      this.data.ys.forEach((item, ind) => {
        const y = useSaved ? this.data.saved.y[ind] : item.y;
        const startIndex = this.graphStyle === 'step' ? floorStart : ceilStart;
        const endIndex = this.graphStyle === 'step' ? ceilEnd : floorEnd;

        if(state[`e_${ind}`] || (ind === 0 && this.pairY)) {
          let v: number;
          for(let i = startIndex; i <= endIndex; i++) {
            v = y[i];
            if(v === undefined) continue;
            if(v < yMin) yMin = v;
            if(v > yMax) yMax = v;
          }

          if(this.graphStyle === 'line') {
            if(y[floorStart] !== undefined && y[ceilStart] !== undefined) {
              yFirst = y[floorStart] + (start - floorStart) * (y[ceilStart] - y[floorStart]); // clipped part of line from the beginning
              if(yFirst < yMin) yMin = yFirst;
              if(yFirst > yMax) yMax = yFirst;
            }

            if(y[floorEnd] !== undefined && y[ceilEnd] !== undefined) {
              yLast = y[floorEnd] + (end - floorEnd) * (y[ceilEnd] - y[floorEnd]); // clipped part of line from the end
              if(yLast < yMin) yMin = yLast;
              if(yLast > yMax) yMax = yLast;
            }
          }
        }

        if(this.pairY) {
          // this.prevRange will be available for pair graphs for second one to fit first one
          // if first graph is disabled this.prevRange wiil be null and range will be rounded as always
          const tunedY = proceedMinMax(yMin, yMax, ind, prevRange);
          resMin[ind] = tunedY.min;
          resMax[ind] = tunedY.max;
          yMin = Number.MAX_VALUE;
          yMax = -Number.MAX_VALUE;
          // upd. disabled prevRange, caused problems
          // prevRange = tunedY.range;
        }
      });
    }

    if(this.graphStyle === 'bar') {
      const visibleCols: number[] = [];

      for(let j = 0; j < this.data.ys.length; j++) {
        if(state[`e_${j}`]) {
          visibleCols.push(j);
        }
      }

      const colsLen = visibleCols.length;

      for(let i = floorStart; i <= ceilEnd; i++) {
        let yCur = 0;
        for(let j = 0; j < colsLen; j++) {
          yCur += (useSaved ? this.data.saved.y[visibleCols[j]][i] : this.data.ys[visibleCols[j]].y[i]) || 0;
        }
        if(yCur > yMax) yMax = yCur;
      }

      yMin = 0;
    }

    if(this.pairY) {
      // for absent values
      if(isNaN(resMin[0])) resMin[0] = resMin[1];
      if(isNaN(resMin[1])) resMin[1] = resMin[0];
      if(isNaN(resMax[0])) resMax[0] = resMax[1];
      if(isNaN(resMax[1])) resMax[1] = resMax[0];
      return {
        min: resMin,
        max: resMax
      };
    } else {
      const tunedY = proceedMinMax(yMin, yMax);
      return {
        min: tunedY.min,
        max: tunedY.max
      };
    }
  }

  setDarkMode(enabled: boolean, colors?: TChartSettings['COLORS']) {
    this.settings.darkMode = enabled;
    if(colors) {
      this.settings.COLORS = colors;
    }

    this.graph.setDarkMode(enabled);
    this.axisY.setDarkMode(enabled);
    this.fade.setDarkMode(enabled);
    this.axisX.setDarkMode(enabled);
    this.mini.setDarkMode(enabled);
    this.handle.setDarkMode(enabled);
    this.tip.setDarkMode(enabled);
    this.switchers.setDarkMode(enabled);
    this.composer.setDarkMode(enabled);
  }

  getGraphWidth(hasLegend: boolean) {
    const rectEl = this.$el.getBoundingClientRect();

    if(hasLegend) {
      const rectLegend = this.$switchers.getBoundingClientRect();

      if((rectEl.width - rectLegend.width) >= 500) {
        return {
          hasSpaceForLegend: true,
          width: Math.max(rectEl.width - rectLegend.width, 1)
        };
      } else {
        return {
          hasSpaceForLegend: false,
          width: rectEl.width
        };
      }
    } else {
      return {
        width: rectEl.width
      };
    }
  }

  onResize = () => {
    const dpi = Math.min(window.devicePixelRatio || 1, 2);
    if(this.ww === window.innerWidth && dpi === this.settings.dpi) return;
    this.settings.dpi = dpi;

    this.ww = window.innerWidth;

    if(this.data.sideLegend) {
      this.$switchers.classList.remove('tchart--switchers__no-space');

      const graphWidthData = this.getGraphWidth(true);

      // if no space for legend - skip sideLegend option
      if(graphWidthData.hasSpaceForLegend) {
        this.$graph.style.width = graphWidthData.width + 'px';
      } else {
        this.$switchers.classList.add('tchart--switchers__no-space');
        this.$graph.style.width = graphWidthData.width + 'px';
      }
    }


    const rectGraph = this.$graph.getBoundingClientRect();
    const s = this.settings;
    const graphHeight = rectGraph.height - s.DATES_HEIGHT - s.MINI_GRAPH_HEIGHT - s.MINI_GRAPH_TOP - s.MINI_GRAPH_BOTTOM;

    this.state.dims = {
      composer: {
        w: rectGraph.width,
        h: rectGraph.height,
        l: 0,
        t: 0
      },
      graph: {
        w: rectGraph.width,
        h: graphHeight,
        l: 0,
        t: s.DATES_HEIGHT
      },
      axisYLeft: {
        w: s.Y_LABELS_WIDTH,
        h: graphHeight,
        l: s.PADD[3],
        t: s.DATES_HEIGHT
      },
      axisYRight: {
        w: s.Y_LABELS_WIDTH,
        h: graphHeight,
        l: rectGraph.width - s.PADD[1] - s.Y_LABELS_WIDTH,
        t: s.DATES_HEIGHT
      },
      axisYLines: {
        w: rectGraph.width - s.PADD[1] - s.PADD[3],
        h: graphHeight,
        l: s.PADD[3],
        t: s.DATES_HEIGHT
      },
      fadeTop: {
        w: rectGraph.width,
        h: s.FADE_HEIGHT,
        l: 0,
        t: s.DATES_HEIGHT
      },
      fadeBottom: {
        w: rectGraph.width,
        h: s.FADE_HEIGHT,
        l: 0,
        t: s.DATES_HEIGHT + graphHeight - s.FADE_HEIGHT
      },
      axisX: {
        w: rectGraph.width,
        h: s.X_LABELS_HEIGHT,
        l: 0,
        t: s.DATES_HEIGHT + graphHeight - s.X_LABELS_HEIGHT
      },
      dates: {
        w: s.DATES_WIDTH,
        h: s.DATES_HEIGHT,
        l: this.opts.settings.DATES_SIDE === 'right' ? rectGraph.width - s.DATES_WIDTH - s.PADD[1] : s.PADD[1],
        t: 0
      },
      mini: {
        w: rectGraph.width - s.PADD[1] - s.PADD[3],
        h: s.MINI_GRAPH_HEIGHT,
        l: s.PADD[3],
        t: s.DATES_HEIGHT + graphHeight + s.MINI_GRAPH_TOP
      },
      handle: {
        w: rectGraph.width - s.PADD[1] - s.PADD[3],
        h: s.MINI_GRAPH_HEIGHT + 2,
        l: s.PADD[3],
        t: s.DATES_HEIGHT + graphHeight + s.MINI_GRAPH_TOP - 1
      },
      tip: {
        w: rectGraph.width,
        h: graphHeight,
        l: 0,
        t: s.DATES_HEIGHT
      }
    };

    this.graph.onResize();
    this.axisY.onResize();
    this.fade.onResize();
    this.axisX.onResize();
    this.mini.onResize();
    this.handle.onResize();
    this.tip.onResize();
    this.composer.onResize();
  };

  createDOM(container: HTMLElement) {
    const settings = this.settings;

    this.$el = document.createElement('div');
    this.$el.className = 'tchart';

    if(!this.data.subchart.show) {
      this.$el.classList.add('tchart__no-subchart');
    }

    if(this.data.slave) {
      this.$el.classList.add('tchart__slave');
    }

    this.$h1 = document.createElement('h1');
    this.$h1.className = 'tchart--header';
    this.$h1.textContent = this.data.caption;
    this.$el.appendChild(this.$h1);

    this.$zoom = document.createElement('div');
    this.$zoom.className = 'tchart--zoom';
    this.$el.appendChild(this.$zoom);

    const $zoomIcon = document.createElement('div');
    $zoomIcon.className = 'tchart--zoom-icon';
    this.$zoom.appendChild($zoomIcon);
    const $zoomText = document.createElement('span');
    $zoomText.textContent = this.settings.ZOOM_TEXT;
    this.$zoom.appendChild($zoomText);

    this.$zoom.addEventListener('click', () => {
      this.toggleZoom(false);
    });

    this.$graph = document.createElement('div');
    this.$graph.className = 'tchart--graph';
    this.$el.appendChild(this.$graph);

    this.$switchers = document.createElement('div');
    this.$switchers.className = 'tchart--switchers';
    this.data.sideLegend && this.$switchers.classList.add('tchart--switchers__side-legend');
    this.$el.appendChild(this.$switchers);

    container.appendChild(this.$el);

    const rangeGraph = this.getYMinMax(this.state.x1, this.state.x2, false, true);
    const rangeMini = this.getYMinMax(this.state.xg1, this.state.xg2, true);

    if(this.pairY) {
      for(let i = 0; i < this.data.ys.length; i++) {
        this.state[`y1_${i}`] = (rangeGraph as TChartRangePaired).min[i];
        this.state[`y2_${i}`] = (rangeGraph as TChartRangePaired).max[i];
        this.state[`y1m_${i}`] = (rangeMini as TChartRangePaired).min[i];
        this.state[`y2m_${i}`] = (rangeMini as TChartRangePaired).max[i];
      }
    } else {
      this.state['y1'] = (rangeGraph as TChartRangeSingle).min;
      this.state['y2'] = (rangeGraph as TChartRangeSingle).max;
      this.state['y1m'] = (rangeMini as TChartRangeSingle).min;
      this.state['y2m'] = (rangeMini as TChartRangeSingle).max;
    }

    this.composer = new TComposer({
      $parent: this.$graph,
      settings: settings,
      chart: this,
      state: this.state,
      data: this.data,
      graphStyle: this.graphStyle
    });

    this.animator = new TAnimator({
      state: this.state,
      composer: this.composer
    });

    const graphStyle: {[type in TChartType]: any} = {
      line: TLines,
      step: TLines,
      bar: TBars,
      area: TAreas
    };

    const objs: [property: string, constructor: any, $parent: HTMLElement, additional?: any][] = [
      ['graph', graphStyle[this.graphStyle], this.$graph],
      ['axisX', TAxisX, this.$graph],
      ['fade', TFade, this.$graph],
      ['axisY', TAxisY, this.$graph],
      ['tip', TTip, this.$graph, {
        onClick: this.toggleZoom
      }],
      ['mini', graphStyle[this.graphStyle], this.$graph, {
        mini: true
      }],
      ['handle', THandle, this.$graph, {
        cb: this.onHandleMove
      }],
      ['switchers', TSwitchers, this.$switchers, {
        onClick: this.onSwitcherChange,
        onLongTap: this.onSwitcherChange,
        onEnter: this.onSwitcherEnter,
        onLeave: this.onSwitcherLeave
      }]
    ];

    objs.forEach((obj) => {
      const options: TChartUnitOptions = {
        animator: this.animator,
        $canvas: this.composer.$canvas,
        ctx: this.composer.ctx,
        graphStyle: this.graphStyle,
        chart: this,
        pairY: this.pairY,
        state: this.state,
        data: this.data,
        $parent: obj[2],
        settings: settings,
        additional: obj[3] || {}
      };
      // @ts-ignore
      this[obj[0]] = new obj[1](options);
      // @ts-ignore
      this[obj[0]].id = obj[0];
    });
  }

  onHandleMove = (x1: number, x2: number, tp: 'both', firstMove: boolean) => {
    // snap to days behaviour
    let isMagnet = this.state.zoomMode;

    this.updateSpeed();

    isMagnet = false; // due to range reducers on detail data gaps

    if(isMagnet) {
      const periodLen = this.data.mainPeriodLen;
      x1 = Math.round(x1 / periodLen) * periodLen;
      x2 = Math.round(x2 / periodLen) * periodLen;

      x1 = Math.min(Math.max(x1, this.state.xg1), this.state.xg2 - periodLen);
      x2 = Math.min(Math.max(x2, this.state.xg1 + periodLen), this.state.xg2);

      if(x2 <= x1) {
        x2 = x1 + periodLen;
      }

      const x1AnimItem = this.animator.get('x1');
      const x2AnimItem = this.animator.get('x2');
      const x1End = x1AnimItem ? x1AnimItem.end : this.state['x1'];
      const x2End = x2AnimItem ? x2AnimItem.end : this.state['x2'];

      if(x1 === x1End && x2 === x2End) {
        return;
      }
    }


    const props: TChartAnimationProperty[] = [];
    const range = this.getYMinMax(x1, x2, false, true);

    this.axisX.setAnimation(isMagnet || tp !== 'both');
    this.axisY.setAnimation(true);
    this.axisY.setForceUpdate(false);
    firstMove && triggerEvent('chart-hide-tips', {
      except: null
    });

    props.push({
      prop: 'x1',
      state: this.state,
      end: x1,
      fixed: true,
      duration: isMagnet ? 250 : 0,
      group: {
        top: true,
        bottom: true
      }
    });

    props.push({
      prop: 'x2',
      state: this.state,
      end: x2,
      fixed: true,
      duration: isMagnet ? 250 : 0,
      group: {
        top: true,
        bottom: true
      }
    });

    for(let i = 0; i < this.data.ys.length; i++) {
      if(this.graphStyle === 'line' || this.graphStyle === 'step') {
        props.push({
          prop: this.pairY ? `y1_${i}` : 'y1',
          state: this.state,
          end: this.pairY ? (range as TChartRangePaired).min[i] : (range as TChartRangeSingle).min,
          duration: 500,
          fixed: true,
          tween: 'exp',
          speed: 0.25,
          group: {
            top: true
          }
        });
      }

      if(this.graphStyle !== 'area') {
        props.push({
          prop: this.pairY ? `y2_${i}` : 'y2',
          state: this.state,
          end: this.pairY ? (range as TChartRangePaired).max[i] : (range as TChartRangeSingle).max,
          duration: 500,
          fixed: true,
          tween: 'exp',
          speed: 0.25,
          group: {
            top: true
          }
        });
      }
    }

    this.animator.add(props);
  };

  onSwitcherEnter = (ind: number) => {
    clearTimeout(this.switcherLeaveTimeout);

    const props: TChartAnimationProperty[] = [];

    for(let i = 0; i < this.data.ys.length; i++) {
      props.push({
        prop: `f_${i}`,
        state: this.state,
        end: ind === i ? 1 : 0,
        duration: 300,
        tween: 'exp',
        speed: 0.15,
        group: {top: true, bottom: true}
      });

      props.push({
        prop: `pieInd_${i}`,
        state: this.state,
        end: ind === i ? 1 : 0,
        duration: 300,
        tween: 'exp',
        speed: 0.15,
        group: {top: true, bottom: true}
      });
    }

    this.animator.add(props);
  };

  onSwitcherLeave = (propsind?: number) => {
    clearTimeout(this.switcherLeaveTimeout);

    this.switcherLeaveTimeout = window.setTimeout(() => {
      const props: TChartAnimationProperty[] = [];

      for(let i = 0; i < this.data.ys.length; i++) {
        props.push({
          prop: `f_${i}`,
          state: this.state,
          end: 1,
          duration: 300,
          tween: 'exp',
          speed: 0.15,
          group: {top: true, bottom: true}
        });

        props.push({
          prop: `pieInd_${i}`,
          state: this.state,
          end: 0,
          duration: 300,
          tween: 'exp',
          speed: 0.15,
          group: {top: true, bottom: true}
        });
      }

      this.animator.add(props);
    }, 300);
  };

  onSwitcherChange = (enabled: boolean, ind: number) => {
    var rangeGraph: TChartRange, rangeMini: TChartRange, i: number, props: TChartAnimationProperty[] = [],
      isCurrent: boolean, e: boolean[] = [],
      prevE: boolean[] = [];
    var longTap: boolean, isAllOffExceptCurrent: boolean;

    this.updateSpeed();

    if(typeof(enabled) !== 'boolean') {
      longTap = true;
      ind = enabled;

      isAllOffExceptCurrent = true;
      for(i = 0; i < this.data.ys.length; i++) {
        isAllOffExceptCurrent = isAllOffExceptCurrent && (i === ind ? this.state[`e_${i}`] : !this.state[`e_${i}`]);
      }
    }

    var maxYSize = 0;

    for(i = 0; i < this.data.ys.length; i++) {
      isCurrent = i === ind;

      prevE[i] = this.state[`e_${i}`];

      if(longTap) {
        this.state[`e_${i}`] = isCurrent;
      } else if(isCurrent) {
        this.state[`e_${i}`] = !!enabled;
      }

      if(isAllOffExceptCurrent && longTap) {
        this.state[`e_${i}`] = true;
      }

      e[i] = this.state[`e_${i}`];

      if(e[i]) {
        maxYSize = Math.max(maxYSize, this.data.ys[i].y.length);
      }
    }

    // reduce global range to exclude data gaps
    var reducedRange = this.reduceGlobalRange({});

    if(reducedRange.isReduced) {
      props.push({
        prop: 'x1',
        state: this.state,
        end: reducedRange.x1,
        duration: 333,
        group: {
          top: true,
          bottom: true
        }
      });

      props.push({
        prop: 'x2',
        state: this.state,
        end: reducedRange.x2,
        duration: 333,
        group: {
          top: true,
          bottom: true
        }
      });

      props.push({
        prop: 'xg1',
        state: this.state,
        end: reducedRange.xg1,
        duration: 333,
        group: {
          top: true,
          bottom: true
        }
      });

      props.push({
        prop: 'xg2',
        state: this.state,
        end: reducedRange.xg2,
        duration: 333,
        group: {
          top: true,
          bottom: true
        }
      });
      this.state.xg1Ind = reducedRange.xg1Ind;
      this.state.xg2Ind = reducedRange.xg2Ind;

      rangeGraph = this.getYMinMax(reducedRange.x1, reducedRange.x2, false, true);
      rangeMini = this.getYMinMax(reducedRange.xg1, reducedRange.xg2, true);
    } else {
      rangeGraph = this.getYMinMax(this.state.x1, this.state.x2, false, true);
      rangeMini = this.getYMinMax(this.state.xg1, this.state.xg2, true);
    }


    triggerEvent('chart-hide-tips', {
      except: null
    });
    this.axisY.setForceUpdate(true);
    this.axisY.setAnimation(true);

    this.state.activeColumnsCount = 0;

    for(i = 0; i < e.length; i++) {
      e[i] && this.state.activeColumnsCount++;

      if(prevE[i] !== e[i]) {
        props.push({
          prop: `o_${i}`,
          state: this.state,
          end: e[i] ? 1 : 0,
          duration: 300,
          group: {
            top: true
          }
        });

        props.push({
          prop: `om_${i}`,
          state: this.state,
          end: e[i] ? 1 : 0,
          duration: this.graphStyle === 'line' || this.graphStyle === 'step' ? 166 : 300,
          delay: e[i] && this.graphStyle === 'line' || this.graphStyle === 'step' ? 200 : 0,
          tween: 'linear',
          group: {
            bottom: true
          }
        });
      }
    }

    for(i = 0; i < (this.pairY ? e.length : 1); i++) {
      if(this.graphStyle === 'line' || this.graphStyle === 'step') {
        props.push({
          prop: this.pairY ? `y1_${i}` : 'y1',
          state: this.state,
          end: this.pairY ? (rangeGraph as TChartRangePaired).min[i] : (rangeGraph as TChartRangeSingle).min,
          duration: this.pairY ? 0 : 333,
          group: {
            top: true
          }
        });
      }

      if(this.graphStyle !== 'area') {
        props.push({
          prop: this.pairY ? `y2_${i}` : 'y2',
          state: this.state,
          end: this.pairY ? (rangeGraph as TChartRangePaired).max[i] : (rangeGraph as TChartRangeSingle).max,
          duration: this.pairY ? 0 : 333,
          group: {
            top: true
          }
        });
      }

      if(this.graphStyle === 'line' || this.graphStyle === 'step') {
        props.push({
          prop: this.pairY ? `y1m_${i}` : 'y1m',
          state: this.state,
          end: this.pairY ? (rangeMini as TChartRangePaired).min[i] : (rangeMini as TChartRangeSingle).min,
          duration: this.pairY ? 0 : 316,
          group: {
            bottom: true
          }
        });
      }

      if(this.graphStyle !== 'area') {
        props.push({
          prop: this.pairY ? `y2m_${i}` : 'y2m',
          state: this.state,
          end: this.pairY ? (rangeMini as TChartRangePaired).max[i] : (rangeMini as TChartRangeSingle).max,
          duration: this.pairY ? 0 : 316,
          group: {
            bottom: true
          }
        });
      }
    }

    this.state['y1m_hidd'] = this.state.y1m;
    this.state['y2m_hidd'] = this.state.y2m;
    this.state['y1m_show'] = rangeMini.min as number;
    this.state['y2m_show'] = rangeMini.max as number;


    this.switchers.render(e);

    this.animator.add(props);
  };

  toggleSlave(enabled: boolean, zoomSpecialOrigin: number, details: TChartDataDetails, speed: number) {
    const props: TChartAnimationProperty[] = [];

    this.updateSpeed(speed);

    if(this.state.zoomModeSlave === enabled) return;

    this.state.zoomSpecialOrigin = zoomSpecialOrigin;

    if(enabled) {
      this.state.zoomModeSlave = true;

      this.switchers.switchers.forEach((div, ind) => {
        div.classList.add('tchart--switcher__visible');
        div.getElementsByTagName('span')[0].textContent = details.names[ind];
      });

      this.tip.labels.forEach((item, ind) => {
        item.$label.textContent = details.names[ind];
      });


      this.data.x = details.x;
      const e: boolean[] = [];
      for(let i = 0; i < details.y.length; i++) {
        this.data.ys[i].y = details.y[i];

        const isVisible = details.hidden.indexOf(this.data.ys[i].id) === -1;

        this.state[`e_${i}`] = isVisible;
        this.state[`o_${i}`] = isVisible ? 1 : 0;
        this.state[`om_${i}`] = isVisible ? 1 : 0;
        e[i] = isVisible;
      }

      this.switchers.render(e);

      const x1 = this.data.x[0];
      const x2 = this.data.x[this.data.x.length - 1];

      this.data.dates = [];
      this.data.datesShort = [];
      this.data.datesRange = [];

      const xTooltipFormatter = getFormatter('xTooltipFormatter', this.data, 1);
      const xTickFormatter = getFormatter('xTickFormatter', this.data, 1);
      const xRangeFormatter = getFormatter('xRangeFormatter', this.data, 1);
      let maxXTickLength = 0;

      for(let i = 0; i < this.data.x.length; i++) {
        this.data.dates[i] = xTooltipFormatter(this.data.x[i], true);
        this.data.datesShort[i] = xTickFormatter(this.data.x[i], true);
        this.data.datesRange[i] = xRangeFormatter(this.data.x[i], true);

        if(this.data.datesShort[i].length > maxXTickLength) {
          maxXTickLength = this.data.datesShort[i].length;
        }
      }

      this.data.maxXTickLength = maxXTickLength;

      this.data.subchart = details.subchart;
      this.data.hidden = details.hidden;

      const defaultZoom = this.getDefaultZoom({
        x1: x1,
        x2: x2,
        xg1: x1,
        xg2: x2,
        default: this.data.subchart.defaultZoom
      });

      this.state.x1 = defaultZoom.x1;
      this.state.x2 = defaultZoom.x2;

      this.state['xCount'] = this.data.x.length;
      this.state['xg1'] = x1;
      this.state['xg2'] = x2;
      this.state['xg1Ind'] = 0;
      this.state['xg2Ind'] = this.data.x.length - 1;
      this.state['xMainMin'] = x1;
      this.state['xMainMax'] = x2;
      this.state['xgMin'] = x1;
      this.state['xgMax'] = x2;


      // reduce global range to exclude data gaps
      const reducedRange = this.reduceGlobalRange({});

      if(reducedRange.isReduced) {
        this.state.x1 = reducedRange.x1;
        this.state.x2 = reducedRange.x2;
        this.state.xg1 = reducedRange.xg1;
        this.state.xg2 = reducedRange.xg2;
        this.state.xg1Ind = reducedRange.xg1Ind;
        this.state.xg2Ind = reducedRange.xg2Ind;
      }


      const rangeGraph = this.getYMinMax(this.state.x1, this.state.x2, false, true);
      const rangeMini = this.getYMinMax(x1, x2, true);

      this.state['y1'] = rangeGraph.min as number;
      this.state['y2'] = rangeGraph.max as number;
      this.state['y1m'] = rangeMini.min as number;
      this.state['y2m'] = rangeMini.max as number;
    } else {
      this.switchers.switchers.forEach((div) => {
        div.classList.remove('tchart--switcher__visible');
      });
    }
    const durationY = 450;

    setTimeout(() => {
      if(!enabled) {
        this.state.zoomModeSlave = false;
      }
    }, durationY + 20);

    this.state.slaveVisibility = enabled ? 0 : 1;

    props.push({
      prop: 'slaveVisibility',
      state: this.state,
      end: enabled ? 1 : 0,
      duration: durationY,
      group: {
        top: true,
        bottom: true
      }
    });

    this.animator.add(props);
  }

  toggleZoomSpecial(enabled: boolean, dt: number, details: TChartDataDetails) {
    var props: TChartAnimationProperty[] = [];

    if(this.state.zoomModeSpecial === enabled) return;

    var speed = this.updateSpeed();

    if(enabled) {
      var scale = (this.state.x2 - this.state.x1) / (this.state.dims.graph.w - this.settings.PADD[3] - this.settings.PADD[1]);
      var lPaddInDt = this.settings.PADD[3] * scale;
      var rPaddInDt = this.settings.PADD[1] * scale;
      this.state.zoomSpecialOrigin = (dt - this.state.x1 + lPaddInDt) / (this.state.x2 - this.state.x1 + lPaddInDt + rPaddInDt);

      this.state.zoomModeSpecial = true;
      this.$h1.classList.add('tchart--header__hidden');
      this.$zoom.classList.add('tchart--zoom__visible');

      this.switchers.switchers.forEach((div) => {
        div.classList.remove('tchart--switcher__visible');
      });

      this.slaveChart.toggleSlave(true, this.state.zoomSpecialOrigin, details, speed);
    } else {
      this.$h1.classList.remove('tchart--header__hidden');
      this.$zoom.classList.remove('tchart--zoom__visible');

      this.switchers.switchers.forEach((div) => {
        div.classList.add('tchart--switcher__visible');
      });

      this.slaveChart.toggleSlave(false, this.state.zoomSpecialOrigin, null, speed);
    }
    var durationY = 450;

    document.body.style.pointerEvents = 'none';
    setTimeout(() => {
      if(!enabled) {
        this.state.zoomModeSpecial = false;
      }
      document.body.style.pointerEvents = '';
    }, durationY + 20);

    this.state.masterVisibility = enabled ? 1 : 0;

    props.push({
      prop: 'masterVisibility',
      state: this.state,
      end: enabled ? 0 : 1,
      duration: durationY,
      group: {
        top: true,
        bottom: true
      }
    });

    this.animator.add(props);
  }

  toggleZoom = (enabled: boolean, dt?: number, data?: TChartData) => {
    // this.specialZoomTransition = true;
    if(enabled) {
      // this.specialZoomTransition = this.state.isSlowNow ? true : undefined;
      // this.specialZoomTransition = true;
    }

    if(data && this.specialZoomTransition === undefined) {
      if(data.columns.length !== this.data.ys.length + 1) this.specialZoomTransition = true;
      if(!this.specialZoomTransition) {
        data.columns.forEach((item) => {
          const id = item[0];
          const tp = data.types[id];
          const label = data.names[id];
          const ind = this.data.yIds[id];
          if(ind !== undefined) {
            const tpOrig = this.data.ys[ind].tp;
            const labelOrig = this.data.ys[ind].label;
            if(tpOrig !== tp || labelOrig !== label) {
              this.specialZoomTransition = true;
            }
          } else {
            if((id as any as string) !== 'x') {
              this.specialZoomTransition = true;
            }
          }
        });
      }
      if(this.specialZoomTransition === undefined) {
        this.specialZoomTransition = false;
      }
    }

    if(this.specialZoomTransition) {
      this.data.master = true;
      this.$el.classList.add('tchart__master');

      if(!this.slaveChart) {
        const clonedData: TChartConstructorOptions['data'] = JSON.parse(JSON.stringify(data));
        clonedData.yTickFormatter = data.yTickFormatter;
        clonedData.yTooltipFormatter = data.yTooltipFormatter;
        clonedData.xTickFormatter = data.xTickFormatter;
        clonedData.xTooltipFormatter = data.xTooltipFormatter;
        clonedData.xRangeFormatter = data.xRangeFormatter;
        clonedData.sideLegend = this.data.sideLegend;
        clonedData.getLabelDate = this.data.getLabelDate;
        clonedData.getLabelTime = this.data.getLabelTime;
        this.slaveChart = new TChart({
          container: this.opts.container,
          slave: true,
          data: clonedData
        });

        this.slaveChart.setDarkMode(this.darkMode);
      }
    }

    if(data && !data.details) {
      data.details = {
        y: [],
        names: []
      } as TChartDataDetails;

      data.columns.forEach((item) => {
        const id = item.shift();
        const tp = data.types[id];
        const label = data.names[id];

        if(tp === 'x') {
          data.details.x = item;
        } else {
          if(this.specialZoomTransition) {
            data.details.y.push(item);
            data.details.names.push(label);
          } else {
            data.details.y[this.data.yIds[id]] = item;
          }
        }
      });
    }

    if(data) {
      data.subchart = {
        show: data.subchart && data.subchart.show !== undefined ? data.subchart.show : true,
        defaultZoom: data.subchart && data.subchart.defaultZoom
      }
      data.details.subchart = data.subchart;
      data.details.hidden = data.hidden || [];
    }


    if(this.specialZoomTransition) {
      this.toggleZoomSpecial(enabled, dt, data && data.details);
      return;
    }


    const details = data && data.details;

    var rangeGraph: TChartRange,
      rangeMini: TChartRange,
      props: TChartAnimationProperty[] = [];

    if(this.state.zoomMode === enabled) return;

    if(enabled) {
      this.state.zoomMode = true;
      this.state.zoomDir = 1;
      this.$h1.classList.add('tchart--header__hidden');
      this.$zoom.classList.add('tchart--zoom__visible');

      this.zoomEnterSpeed = this.updateSpeed();

      // area has no data
      if(data) {
        this.data.details = {
          yTickFormatter: data.yTickFormatter,
          yTooltipFormatter: data.yTooltipFormatter,
          xTickFormatter: data.xTickFormatter,
          xTooltipFormatter: data.xTooltipFormatter,
          xRangeFormatter: data.xRangeFormatter,
          subchart: data.subchart,
          hidden: data.hidden || []
        };
      }

      // save
      if(!this.hasSavedData) {
        this.data.saved = {};
        this.data.saved.x = this.data.x.slice();
        this.data.saved.dates = this.data.dates.slice();
        this.data.saved.datesShort = this.data.datesShort.slice();
        this.data.saved.datesRange = this.data.datesRange.slice();
        this.data.saved.y = [];

        for(let j = 0; j < this.data.ys.length; j++) {
          this.data.saved.y[j] = this.data.ys[j].y.slice();
        }
        this.hasSavedData = true;
      }

      if(this.data.details && this.data.details.subchart) {
        if(!this.data.details.subchart.show) {
          this.$el.classList.add('tchart__no-subchart');
        } else {
          this.$el.classList.remove('tchart__no-subchart');
        }
      }


      this.state.zoomSaved = {
        x1: this.state.x1,
        x2: this.state.x2,
        xg1: this.state.xg1,
        xg2: this.state.xg2,
        xgMin: this.state.xgMin,
        xgMax: this.state.xgMax
      }

      var periodLen = this.data.mainPeriodLen;
      var x1 = dt;
      var x2 = dt + periodLen;

      if(this.data.details) {
        var defaultZoom = this.getDefaultZoom({
          x1: x1,
          x2: x2,
          xg1: details.x[0],
          xg2: details.x[details.x.length - 1],
          default: this.data.details.subchart.defaultZoom
        });

        var x1 = defaultZoom.x1;
        var x2 = defaultZoom.x2;
      }
      var xg1, xg2;


      if(this.graphStyle !== 'area') {
        this.data.detailPeriodLen = details.x[1] - details.x[0];

        xg1 = details.x[0];
        xg2 = details.x[details.x.length - 1];
      } else {
        this.data.detailPeriodLen = periodLen;
        var totalRange = this.data.pieZoomRange;
        xg1 = x1 - (totalRange - periodLen) / 2;
        xg2 = xg1 + totalRange;

        x2 = x1 + Math.round((totalRange / 7) / periodLen) * periodLen;

        if(xg1 < this.data.x[0]) {
          xg1 = this.data.x[0];
          xg2 = xg1 + totalRange;

          if(xg2 > this.data.x[this.data.x.length - 1]) {
            xg2 = this.data.x[this.data.x.length - 1] + periodLen;
          }
        } else if(xg2 > this.data.x[this.data.x.length - 1]) {
          xg2 = this.data.x[this.data.x.length - 1] + periodLen;
          xg1 = xg2 - totalRange;

          if(xg1 < this.data.x[0]) {
            xg1 = this.data.x[0];
          }
        }
      }

      xg1 = Math.round(xg1 / periodLen) * periodLen;
      xg2 = Math.round(xg2 / periodLen) * periodLen;


      if(this.graphStyle !== 'area') {
        this.insertDetails(xg1, xg2, details);
      }

      this.state.xgMin = xg1;
      this.state.xgMax = xg2;
    } else {
      this.updateSpeed(this.zoomEnterSpeed / (this.graphStyle === 'area' ? 2 : 1));

      this.$h1.classList.remove('tchart--header__hidden');
      this.$zoom.classList.remove('tchart--zoom__visible');

      if(this.data.details) {
        if(!this.data.subchart.show) {
          this.$el.classList.add('tchart__no-subchart');
        } else {
          this.$el.classList.remove('tchart__no-subchart');
        }
      }

      this.state.zoomDir = -1;

      x1 = this.state.zoomSaved.x1;
      x2 = this.state.zoomSaved.x2;
      xg1 = this.state.zoomSaved.xg1;
      xg2 = this.state.zoomSaved.xg2;
      this.state.xgMin = this.state.zoomSaved.xgMin;
      this.state.xgMax = this.state.zoomSaved.xgMax;
    }

    this.axisY.setForceUpdate(true);
    this.axisY.setAnimation(true);
    this.axisX.setAnimation(true);

    let duration = 450;
    let delayMain = 0;
    let delayZoom = 0;

    if(this.graphStyle === 'area') {
      duration = 350;
      if(enabled) {
        delayZoom = duration * 0.95;
      } else {
        delayMain = duration * 0.95;
      }
    }


    // reduce global range to exclude data gaps
    const reducedRange = this.reduceGlobalRange({
      x1: x1,
      x2: x2,
      xg1: xg1,
      xg2: xg2,
      useSaved: !enabled
    });

    if(reducedRange.isReduced) {
      x1 = reducedRange.x1;
      x2 = reducedRange.x2;
      xg1 = reducedRange.xg1;
      xg2 = reducedRange.xg2;
    }

    this.state.xg1Ind = Math.floor(getXIndex(enabled ? this.data.x : this.data.saved.x, xg1));
    this.state.xg2Ind = Math.ceil(getXIndex(enabled ? this.data.x : this.data.saved.x, xg2));

    rangeGraph = this.getYMinMax(x1, x2, false, true, !enabled);
    rangeMini = this.getYMinMax(xg1, xg2, true, false, !enabled);


    document.body.style.pointerEvents = 'none';
    setTimeout(() => {
      if(!enabled) {
        this.state.zoomMode = false;

        if(this.graphStyle !== 'area') {
          this.revertDetails();
        }
      }
      document.body.style.pointerEvents = '';

      this.composer.render({
        top: true,
        bottom: true
      });
    }, duration + 20 + (this.graphStyle === 'area' ? duration * 0.9 : 0));

    this.state.zoomMorph = enabled ? 0 : 1;


    props.push({
      prop: 'zoomMorph',
      state: this.state,
      end: enabled ? 1 : 0,
      duration: duration,
      delay: delayZoom,
      group: {
        top: true,
        bottom: true
      }
    });

    props.push({
      prop: 'x1',
      state: this.state,
      end: x1,
      delay: delayMain,
      duration: duration,
      group: {
        top: true,
        bottom: true
      }
    });

    props.push({
      prop: 'x2',
      state: this.state,
      end: x2,
      delay: delayMain,
      duration: duration,
      group: {
        top: true,
        bottom: true
      }
    });

    props.push({
      prop: 'xg1',
      state: this.state,
      end: xg1,
      delay: delayMain,
      duration: duration,
      group: {
        top: true,
        bottom: true
      }
    });

    props.push({
      prop: 'xg2',
      state: this.state,
      end: xg2,
      delay: delayMain,
      duration: duration,
      group: {
        top: true,
        bottom: true
      }
    });

    for(let i = 0; i < (this.pairY ? this.data.ys.length : 1); i++) {
      if(this.graphStyle === 'line' || this.graphStyle === 'step') {
        props.push({
          prop: this.pairY ? `y1_${i}` : 'y1',
          state: this.state,
          end: this.pairY ? (rangeGraph as TChartRangePaired).min[i] : (rangeGraph as TChartRangeSingle).min,
          delay: delayMain,
          duration: duration,
          group: {
            top: true
          }
        });
      }

      if(this.graphStyle !== 'area') {
        props.push({
          prop: this.pairY ? `y2_${i}` : 'y2',
          state: this.state,
          end: this.pairY ? (rangeGraph as TChartRangePaired).max[i] : (rangeGraph as TChartRangeSingle).max,
          delay: delayMain,
          duration: duration,
          group: {
            top: true
          }
        });
      }

      if(this.graphStyle === 'line' || this.graphStyle === 'step') {
        props.push({
          prop: this.pairY ? `y1m_${i}` : 'y1m',
          state: this.state,
          end: this.pairY ? (rangeMini as TChartRangePaired).min[i] : (rangeMini as TChartRangeSingle).min,
          delay: delayMain,
          duration: duration,
          group: {
            bottom: true
          }
        });
      }

      if(this.graphStyle !== 'area') {
        props.push({
          prop: this.pairY ? `y2m_${i}` : 'y2m',
          state: this.state,
          end: this.pairY ? (rangeMini as TChartRangePaired).max[i] : (rangeMini as TChartRangeSingle).max,
          delay: delayMain,
          duration: duration,
          group: {
            bottom: true
          }
        });
      }
    }

    this.animator.add(props);
  };

  insertDetails(xg1: number, xg2: number, details: TChartDataDetails) {
    const startMain = Math.ceil(getXIndex(this.data.x, xg1));
    let endMain = Math.ceil(getXIndex(this.data.x, xg2));
    const startDetail = 0;
    const endDetail = details.x.length - 1;

    if(xg2 > this.data.x[endMain]) {
      endMain++;
    }


    const xl1 = 0;
    const xl2 = startMain; // not including it

    const xr1 = endMain - (this.graphStyle === 'bar' || this.graphStyle === 'step' ? 1 : 0); // not including it (for bars shoudl include)
    const xr2 = this.data.x.length - 1;


    const newX: number[] = [];
    const newDates: string[] = [];
    const newDatesShort: string[] = [];
    const newDatesRange: string[] = [];
    let newInd: number, y: number[], yFrom: number[], origY: number[], origYDet: number[];
    const newY: number[][] = [];
    const newYFrom: number[][] = [];

    for(let i = xl1; i < xl2; i++) {
      newInd = i - xl1;
      newX[newInd] = this.data.x[i];
      newDates[newInd] = this.data.dates[i];
      newDatesShort[newInd] = this.data.datesShort[i];
      newDatesRange[newInd] = this.data.datesRange[i];
    }
    for(let j = 0; j < this.data.ys.length; j++) {
      newY[j] = newY[j] || [];
      y = newY[j];
      origY = this.data.ys[j].y;
      for(let i = xl1; i < xl2; i++) {
        y[i - xl1] = origY[i];
      }
    }


    // insert details
    const ndx: number[] = [];
    const fdx: number[] = [];
    const cdx: number[] = [];

    const xTooltipFormatter = getFormatter('xTooltipFormatter', this.data, 1);
    const xTickFormatter = getFormatter('xTickFormatter', this.data, 1);
    const xRangeFormatter = getFormatter('xRangeFormatter', this.data, 1);
    let maxXTickLength = 0;

    for(let i = startDetail; i <= endDetail; i++) {
      newInd = i - startDetail + xl2;
      newX[newInd] = details.x[i];

      newDates[newInd] = xTooltipFormatter(newX[newInd], true);
      newDatesShort[newInd] = xTickFormatter(newX[newInd], true);
      newDatesRange[newInd] = xRangeFormatter(newX[newInd], true);

      if(newDatesShort[newInd].length > maxXTickLength) {
        maxXTickLength = newDatesShort[newInd].length;
      }

      const dx = getXIndex(this.data.x, newX[newInd]);
      ndx[i] = dx;
      fdx[i] = Math.floor(dx);
      cdx[i] = Math.ceil(dx);
    }

    this.data.details.maxXTickLength = maxXTickLength;

    for(let j = 0; j < this.data.ys.length; j++) {
      newY[j] = newY[j] || [];
      y = newY[j];
      origY = this.data.ys[j].y;
      origYDet = details.y[j];
      newYFrom[j] = newYFrom[j] || [];
      yFrom = newYFrom[j];
      for(let i = startDetail; i <= endDetail; i++) {
        let yInter: number;
        if(this.graphStyle === 'bar') {
          yInter = origY[fdx[i]] || 0;
        } else if(this.graphStyle === 'step') {
          yInter = origY[fdx[i]];
        } else {
          yInter = origY[fdx[i]] + (ndx[i] - fdx[i]) * (origY[cdx[i]] - origY[fdx[i]]);
        }
        const yDet = origYDet[i];
        // for bars it is simple, we may use 0 as value, cause they are cumulative and always starts from 0
        if(this.graphStyle !== 'bar') {
          // has no initial value, but has detail value
          if(isNaN(yInter) && !isNaN(yDet)) {
            yInter = 0; // ugly, but seem like this situation is impossible in real cases
          }
        }

        y[i - startDetail + xl2] = yDet;
        yFrom[i - startDetail + xl2] = yInter;
      }
    }


    for(let i = xr1 + 1; i <= xr2; i++) {
      newInd = i - xr1 + endDetail + xl2;
      newX[newInd] = this.data.x[i];
      newDates[newInd] = this.data.dates[i];
      newDatesShort[newInd] = this.data.datesShort[i];
      newDatesRange[newInd] = this.data.datesRange[i];
    }
    for(let j = 0; j < this.data.ys.length; j++) {
      newY[j] = newY[j] || [];
      y = newY[j];
      origY = this.data.ys[j].y;
      for(let i = xr1 + 1; i <= xr2; i++) {
        y[i - xr1 + endDetail + xl2] = origY[i];
      }
    }

    this.state.detailInd1 = xl2;
    this.state.detailInd2 = xl2 + endDetail - startDetail;


    this.data.x = newX;
    this.data.dates = newDates;
    this.data.datesShort = newDatesShort;
    this.data.datesRange = newDatesRange;

    for(let j = 0; j < this.data.ys.length; j++) {
      this.data.ys[j].y = newY[j];
      this.data.ys[j].yFrom = newYFrom[j];
    }
  }

  revertDetails() {
    this.data.x = this.data.saved.x;
    this.data.dates = this.data.saved.dates;
    this.data.datesShort = this.data.saved.datesShort;
    this.data.datesRange = this.data.saved.datesRange;

    for(let i = 0; i < this.data.ys.length; ++i) {
      this.data.ys[i].y = this.data.saved.y[i];
    }
  }
}

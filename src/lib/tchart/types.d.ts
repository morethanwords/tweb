import TAnimator from './animator';
import TChart from './chart';
import TLines from './lines';
import TAreas from './areas';
import TBars from './bars';
import {getLabelTime, getLabelDate} from './format';

export type Modify<T, R> = Omit<T, keyof R> & R;

export type TChartRange = TChartRangeSingle | TChartRangePaired;

export type TChartRangeSingle = {
  min: number,
  max: number
};

export type TChartRangePaired = {
  min: number[],
  max: number[]
};

export type TChartAngle = {
  st: number,
  ed: number,
  mid: number,
  additionalPoints: number,
  percentage: number,
  percentageText: string,
  ind: number,
  value: number,
  label: string,
  color: string
};

export type TChartType = 'line' | 'step' | 'bar' | 'area';

export type TChartTypeRenderer = TLines | TBars | TAreas;

export type TChartUnitOptions = Partial<{
  animator: TAnimator,
  $canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  graphStyle: TChartType,
  chart: TChart,
  pairY: boolean,
  state: TChartState,
  data: TChartData,
  $parent: HTMLElement,
  settings: TChartSettings,
  additional: Partial<{
    mini: boolean,
    onClick: (...args: any[]) => void,
    cb: (...args: any[]) => void,
    onEnter: (ind: number) => void,
    onLeave: (ind: number) => void,
    onLongTap: (ind: number) => void,
  }>
}>;

export type TChartSettings = {
  isIE: boolean,
  isEdge: boolean,
  dpi: number,
  darkMode: boolean,
  ALL_LABEL: string,
  Y_AXIS_RANGE: number,
  PADD: [number, number, number, number],
  PADD_MINI: [number, number, number, number],
  PADD_MINI_BAR: [number, number, number, number],
  PADD_MINI_AREA: [number, number, number, number],
  Y_LABELS_WIDTH: number,
  X_LABELS_HEIGHT: number,
  DATES_HEIGHT: number,
  DATES_WIDTH: number,
  DATES_SIDE: 'left' | 'right',
  DATES_WEIGHT: 'bold' | 'normal',
  DATES_FONT_SIZE?: number,
  ZOOM_TEXT: string,
  MINI_GRAPH_HEIGHT: number,
  MINI_GRAPH_TOP: number,
  MINI_GRAPH_BOTTOM: number,
  FADE_HEIGHT: number,
  PIE_RADIUS: number,
  FONT: {
    family: string,
    bold: string,
    normal: string
  },
  COLORS: {
    primary?: string,   // used in css
    secondary?: string, // used in css
    background: string,
    backgroundRgb: [number, number, number],
    text: string,
    dates: string,
    grid: string,
    axis: {
      x: string,
      y: string
    },
    barsSelectionBackground: string,
    miniMask: string,
    miniFrame: string
  }
};

export type TChartDataDetails = Partial<{
  maxXTickLength: number,
  x: number[],
  y: number[][],
  names: string[]
}> & Partial<Pick<TChartConstructorOptions['data'], 'subchart' | 'types' | 'columns' | 'hidden' | 'yTickFormatter' | 'yTooltipFormatter' | 'xTickFormatter' | 'xTooltipFormatter' | 'xRangeFormatter' | 'getLabelDate' | 'getLabelTime'>>;

export type TChartData = TChartDataDetails & {
  caption: string,
  detailsFunc: (x: number) => Promise<TChartConstructorOptions['data']>,
  hasDetail: boolean,
  slave: boolean,
  yMinStep: number,
  xRangeFormatter: any,
  strokeWidth: number | 'auto',
  tooltipOnHover: boolean,
  forceLegend: boolean,
  sideLegend: boolean,
  pieZoomRange: number,
  pieLabelsPercentages: {
    outboard: number,
    hoverOnly: number
  },

  mainPeriodLen?: number,
  detailPeriodLen?: number,
  dates?: string[],
  datesShort?: string[],
  datesRange?: string[],
  ys?: {
    colors_d: [string, string, string]
    colors_n: [string, string, string],
    label: string,
    y: number[],
    tp: string,
    id: string,
    yFrom?: number[],
    outside?: boolean
  }[],
  yIds?: any,
  saved?: any,
  master?: boolean,
  details?: TChartDataDetails,
};

export type TChartDimensions = {
  w: number,
  h: number,
  l: number,
  t: number
};

export type TChartStateZoom = {
  x1?: number,
  x2?: number,
  xg1?: number,
  xg2?: number,
  xgMin?: number,
  xgMax?: number,

  default?: [number, number],
  useSaved?: boolean
};

type C = 'y1' | 'y2' | 'y1m' | 'y2m';
export type TChartState = TChartStateZoom & {
  masterVisibility: number,
  slaveVisibility: number,
  activeColumnsCount: number,

  xCount?: number,
  xg1Ind?: number,
  xg2Ind?: number,
  xMainMin?: number,
  xMainMax?: number,

  zoomMode?: boolean,
  speed?: number,
  deviceSpeed?: number,
  dims?: {[type in 'composer' | 'graph' | 'axisYLeft' | 'axisYRight' | 'axisYLines' | 'fadeTop' | 'fadeBottom' | 'axisX' | 'dates' | 'mini' | 'handle' | 'tip']: TChartDimensions},
  detailInd1?: number,
  detailInd2?: number,
  zoomModeSlave?: boolean,
  zoomSpecialOrigin?: number,
  zoomModeSpecial?: boolean,
  zoomDir?: number,
  zoomSaved?: TChartStateZoom,
  zoomMorph?: number,
  id?: string,

  pieAngles?: TChartAngle[],
  barInd?: number,
  barO?: number
} & {
  [key in `${'o' | 'om' | 'pieInd' | 'f' | 'ox'}_${number | string}`]?: number
} & {
  [key in `${'e'}_${number | string}`]?: boolean
} & {
  [key in `${C}_${number}` | C | `${C}_${'hidd' | 'show'}`]?: number
};

export type TChartAnimationProperty<S extends any = TChartState> = {
  prop: keyof S,
  state: S,
  end: number,
  duration: number,
  tween?: 'exp' | 'linear' | 'easeInOutQuad',
  speed?: number,
  delay?: number,
  cbEnd?: (state: S) => void,
  fixed?: boolean,
  group: {top?: boolean, bottom?: boolean}
};

export type TChartAnimationItem = {
  lastStart: number,
  start: number,
  startDt: number,
  endDt: number
} & Pick<TChartAnimationProperty, 'cbEnd' | 'state' | 'end' | 'tween' | 'speed' | 'group'>;

export type TChartConstructorOptions = {
  container: HTMLElement,
  data: TChatOriginalData & {
    getLabelDate?: typeof getLabelDate,
    getLabelTime?: typeof getLabelTime,
    x_on_zoom?: TChartData['detailsFunc'],
    yMinStep?: number,
    tooltipOnHover?: boolean,
    forceLegend?: boolean,
    sideLegend?: boolean,
    pieZoomRange?: number,
    pieLabelsPercentages?: {
      outboard: number,
      hoverOnly: number
    }
  },
  settings?: Partial<TChartSettings>,
  slave?: boolean
};

export type TChatOriginalData = {
  colors: Record<string, string>,
  columns: number[][], // in reality it will be ['x0', ...number]
  hidden: string[],
  names: Record<string, string>,
  strokeWidth?: number,
  subchart?: {
    show: boolean,
    defaultZoom: [number, number]
  },
  title: string,
  types: Record<string, string>,
  xRangeFormatter: string,
  xTickFormatter: string,
  xTooltipFormatter: string,
  yTickFormatter: string,
  yTooltipFormatter: string,
  y_scaled?: boolean,
};

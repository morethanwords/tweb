import {createAxes} from './Axes';
import {createHeader} from './Header';
import {createMinimap} from './Minimap';
import {createProjection} from './Projection';
import {createStateManager} from './StateManager';
import {createTools} from './Tools';
import {createTooltip} from './Tooltip';
import {createTransitionManager} from './TransitionManager';
import {createZoomer} from './Zoomer';
import {getLabelDate, getLabelTime} from './format';

export type StatisticsGraphDataset = {
  key?: string,
  name: string,
  color: string,
  values: number[],
  hasOwnYAxis?: boolean,

  yMax?: number,
  yMin?: number,
  type?: 'line' | 'bar' | 'step' | 'area' | 'pie'
}

export type StatisticsGraph = {
  type: StatisticsGraphDataset['type'],
  zoomToken?: string,
  labelFormatter: string,
  tooltipFormatter: string,
  labels: Array<string | number>,
  isStacked: boolean,
  isPercentage?: boolean,
  hideCaption: boolean,
  hasSecondYAxis: boolean,
  minimapRange: {
    begin: number,
    end: number,
  },
  labelFromIndex: number,
  labelToIndex: number,
  datasets: StatisticsGraphDataset[],

  title?: string,
  onZoom?: (value: number | string) => Promise<StatisticsGraph>,
  zoomOutLabel?: string,
  axesFont?: string,
  pieFont?: {
    weight: number,
    font: string
  },
  colors?: Record<string, string>,
  myColors?: LovelyChartColors,
  getLabelDate?: typeof getLabelDate,
  getLabelTime?: typeof getLabelTime,
  headerElements?: {
    title?: HTMLElement,
    caption?: HTMLElement,
    zoomOut?: HTMLElement
  },
  xLabels?: {value: string | number, text: string | number}[],
  isLines?: boolean,
  isBars?: boolean,
  isSteps?: boolean,
  isAreas?: boolean,
  isPie?: boolean,
  yMin?: number,
  yMax?: number,
  shouldZoomToPie?: boolean,
  isZoomable?: boolean
}

export type LovelyChartColorType = 'background' | 'text-color' |
  'minimap-mask' | 'minimap-slider' |
  'grid-lines' | 'zoom-out-text' |
  'tooltip-background' | 'tooltip-arrow' |
  'mask' | 'x-axis-text' | 'y-axis-text' |
  `dataset#${string}`;
export type LovelyChartSkinType = 'skin-day' | 'skin-night';
export type LovelyChartColors = {[color in LovelyChartColorType]: string};

export type LovelyChartParsedColor = [number, number, number, number?];
export type LovelyChartBuildedColors = {[color in LovelyChartColorType]: LovelyChartParsedColor};

export type LovelyChartProjection = ReturnType<typeof createProjection>;
export type LovelyChartProjectionParams = LovelyChartBounds & {
  begin: number,
  end: number,
  totalXWidth: number,
  availableWidth: number,
  availableHeight: number,
  xPadding?: number,
  yPadding?: number
};

export type LovelyChartMinimap = ReturnType<typeof createMinimap>;

export type LovelyChartZoomer = ReturnType<typeof createZoomer>;

export type LovelyChartStateManager = ReturnType<typeof createStateManager>;

export type LovelyChartHeader = ReturnType<typeof createHeader>;

export type LovelyChartTooltip = ReturnType<typeof createTooltip>;

export type LovelyChartTools = ReturnType<typeof createTools>;

export type LovelyChartAxes = ReturnType<typeof createAxes>;

export type LovelyChartTransitionManager = ReturnType<typeof createTransitionManager>;
export type LovelyChartTransition = {
  from: number,
  to: number,
  duration: number,
  options: any,
  current: number,
  startedAt: number,
  progress: number
};

export type LovelyChartRange = Partial<{begin: number, end: number}>;
export type LovelyChartRange2 = Partial<{from: number, to: number}>;
export type LovelyChartYRanges = {
  yMinViewport: number,
  yMaxViewport: number,
  yMinMinimap: number,
  yMaxMinimap: number,
  yMinViewportSecond?: number,
  yMaxViewportSecond?: number,
  yMinMinimapSecond?: number,
  yMaxMinimapSecond?: number
};

export type LovelyChartPoint = {
  labelIndex: number,
  value: number,
  visibleValue: number,
  stackOffset: number,
  stackValue: number,
  percent?: number
};
export type LovelyChartPoints = LovelyChartPoint[][];

export type LovelyChartBounds = {
  yMin: number,
  yMax: number
};
export type LovelyChartBoundsAndParams = LovelyChartBounds & {
  begin: number,
  end: number,
  totalXWidth: number,
  availableWidth: number,
  availableHeight: number,
  yPadding: number
};

export type LovelyChartVisibilities = number[];

export type LovelyChartPlotSize = {width: number, height: number};

export type LovelyChartStatistics = {
  key: string,
  name: string,
  value: number,
  hasOwnYAxis: boolean,
  originalIndex: number
}[];

export type LovelyChartDrawOptions = {
  color: string,
  lineWidth: number,
  opacity?: number,
  simplification?: number,

  // pie
  center?: number[],
  radius?: number,
  pointerVector?: LovelyChartState['focusOn'],
  pieFont?: StatisticsGraph['pieFont'],

  // bar
  focusOn?: LovelyChartState['focusOn']
};

export type LovelyChartPointerVector = {
  angle: number,
  distance: number
};

export type LovelyChartState = {
  range?: LovelyChartRange,
  filter?: Record<string, boolean>,
  focusOn?: LovelyChartPointerVector | number,
  minimapDelta?: number,
  labelFromIndex?: number
  labelToIndex?: number,
  begin?: number,
  end?: number,
  xAxisScale?: number,
  totalXWidth?: number,
  yMinViewport?: number,
  yMaxViewport?: number,
  yMinMinimap?: number,
  yMaxMinimap?: number,
  yMinMinimapSecond?: number
  yMaxMinimapSecond?: number,
  yAxisScale?: number,
  yAxisScaleFrom?: number,
  yAxisScaleTo?: number,
  yAxisScaleProgress?: number,
  yMinViewportSecond?: number,
  yMinViewportSecondFrom?: number,
  yMinViewportSecondTo?: number,
  yMaxViewportSecond?: number,
  yMaxViewportSecondFrom?: number,
  yMaxViewportSecondTo?: number,
  yMinViewportFrom?: number
  yMinViewportTo?: number
  yMaxViewportFrom?: number
  yMaxViewportTo?: number,
  yAxisScaleSecond?: number
  yAxisScaleSecondFrom?: number
  yAxisScaleSecondTo?: number
  yAxisScaleSecondProgress?: number,
  static?: LovelyChartState
} & {[key in `${string}#${string}`]?: number};

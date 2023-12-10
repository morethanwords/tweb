import {GUTTER, PLOT_PIE_RADIUS_FACTOR, MILISECONDS_IN_DAY, SIMPLIFIER_MIN_POINTS} from './constants';
import {LovelyChartProjection, StatisticsGraph} from './types';

export function xScaleLevelToStep(scaleLevel: number) {
  return Math.pow(2, scaleLevel);
}

export function xStepToScaleLevel(step: number) {
  return Math.ceil(Math.log2(step || 1));
}

const SCALE_LEVELS = [
  1, 2, 8, 18, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
  250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000
];

export function yScaleLevelToStep(scaleLevel: number) {
  return SCALE_LEVELS[scaleLevel] || SCALE_LEVELS[SCALE_LEVELS.length - 1];
}

export function yStepToScaleLevel(neededStep: number) {
  return SCALE_LEVELS.findIndex((step) => step >= neededStep) || SCALE_LEVELS.length - 1;
}

export function applyYEdgeOpacity(opacity: number, xPx: number, plotWidth: number) {
  const edgeOffset = Math.min(xPx + GUTTER, plotWidth - xPx);
  if(edgeOffset <= GUTTER * 4) {
    opacity = Math.min(1, opacity, edgeOffset / (GUTTER * 4));
  }
  return opacity;
}

export function applyXEdgeOpacity(opacity: number, yPx: number) {
  return (yPx - GUTTER <= GUTTER * 2) ?
    Math.min(1, opacity, (yPx - GUTTER) / (GUTTER * 2)) :
    opacity;
}

export function getPieRadius(projection: LovelyChartProjection) {
  return Math.min(...projection.getSize()) * PLOT_PIE_RADIUS_FACTOR;
}

export function getPieTextSize(percent: number, radius: number) {
  return (radius + percent * 200) / 10;
}

export function getPieTextShift(percent: number, radius: number, shift?: number) {
  return percent >= 0.99 ? 0 : Math.min(1 - Math.log(percent * 30) / 5, 4 / 5) * radius;
}

export function isDataRange(labelFrom: StatisticsGraph['xLabels'][0], labelTo: StatisticsGraph['xLabels'][0]) {
  return Math.abs(+labelTo.value - +labelFrom.value) > MILISECONDS_IN_DAY;
}

export function getSimplificationDelta(pointsLength: number) {
  return pointsLength >= SIMPLIFIER_MIN_POINTS ? Math.min((pointsLength / 1000), 1) : 0;
}

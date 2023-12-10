import {LovelyChartProjection, LovelyChartProjectionParams} from './types';
import {proxyMerge} from './utils';

export function createProjection(params: LovelyChartProjectionParams, cons?: any) {
  const {
    begin,
    end,
    totalXWidth,
    yMin,
    yMax,
    availableWidth,
    availableHeight,
    xPadding = 0,
    yPadding = 0
  } = params;

  let effectiveWidth = availableWidth;

  // TODO bug get rid of padding jumps
  if(begin === 0) {
    effectiveWidth -= xPadding;
  }
  if(end === 1) {
    effectiveWidth -= xPadding;
  }
  const xFactor = effectiveWidth / ((end - begin) * totalXWidth);
  let xOffsetPx = (begin * totalXWidth) * xFactor;
  if(begin === 0) {
    xOffsetPx -= xPadding;
  }

  const effectiveHeight = availableHeight - yPadding;
  const yFactor = effectiveHeight / (yMax - yMin);
  const yOffsetPx = yMin * yFactor;

  function getState() {
    return {xFactor, xOffsetPx, availableHeight, yFactor, yOffsetPx};
  }

  function findClosestLabelIndex(xPx: number) {
    return Math.round((xPx + xOffsetPx) / xFactor);
  }

  function copy(overrides: any, cons?: any) {
    return createProjection(proxyMerge(params, overrides) as LovelyChartProjectionParams, cons);
  }

  function getCenter() {
    return [
      availableWidth / 2,
      availableHeight - effectiveHeight / 2
    ];
  }

  function getSize() {
    return [availableWidth, effectiveHeight];
  }

  function getParams() {
    return params;
  }

  return {
    findClosestLabelIndex,
    copy,
    getCenter,
    getSize,
    getParams,
    getState
  };
}

export function toPixels(projection: LovelyChartProjection, labelIndex: number, value: number): [number, number] {
  const {xFactor, xOffsetPx, availableHeight, yFactor, yOffsetPx} = projection.getState();

  return [
    labelIndex * xFactor - xOffsetPx,
    availableHeight - (value * yFactor - yOffsetPx)
  ];
}

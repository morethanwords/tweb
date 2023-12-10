import {LovelyChartBounds, LovelyChartPoint, LovelyChartPoints, LovelyChartRange, LovelyChartRange2, LovelyChartVisibilities, StatisticsGraph} from './types';
import {sumArrays} from './utils';

export function preparePoints(
  data: StatisticsGraph,
  datasets: StatisticsGraph['datasets'],
  range: LovelyChartRange2,
  visibilities: LovelyChartVisibilities,
  bounds: LovelyChartBounds,
  pieToArea?: boolean
) {
  let values = datasets.map(({values}) => (
    values.slice(range.from, range.to + 1)
  ));

  if(data.isPie && !pieToArea) {
    values = prepareSumsByX(values);
  }

  const points: LovelyChartPoints = values.map((datasetValues, i) => (
    datasetValues.map((value, j) => {
      let visibleValue = value;

      if(data.isStacked) {
        visibleValue *= visibilities[i];
      }

      return {
        labelIndex: range.from + j,
        value,
        visibleValue,
        stackOffset: 0,
        stackValue: visibleValue
      };
    })
  ));

  if(data.isPercentage) {
    preparePercentage(points, bounds);
  }

  if(data.isStacked) {
    prepareStacked(points);
  }

  return points;
}

function getSumsByY(points: LovelyChartPoints) {
  return sumArrays(points.map((datasetPoints) => (
    datasetPoints.map(({visibleValue}) => visibleValue)
  )));
}

// TODO perf cache for [0..1], use in state
function preparePercentage(points: LovelyChartPoints, bounds: LovelyChartBounds) {
  const sumsByY = getSumsByY(points);

  points.forEach((datasetPoints) => {
    datasetPoints.forEach((point, j) => {
      point.percent = point.visibleValue / sumsByY[j];
      point.visibleValue = point.percent * bounds.yMax;
    });
  });
}

function prepareStacked(points: LovelyChartPoints) {
  const accum: number[] = [];

  points.forEach((datasetPoints) => {
    datasetPoints.forEach((point, j) => {
      if(accum[j] === undefined) {
        accum[j] = 0;
      }

      point.stackOffset = accum[j];
      accum[j] += point.visibleValue;
      point.stackValue = accum[j];
    });
  });
}

function prepareSumsByX(values: number[][]) {
  return values.map((datasetValues) => (
    [datasetValues.reduce((sum, value) => sum + value, 0)]
  ));
}

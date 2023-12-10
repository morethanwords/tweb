import {getMaxMin} from './utils';
import {statsFormatDay, statsFormatDayHour, statsFormatText, statsFormatMin} from './format';
import {StatisticsGraph} from './types';

export function analyzeData(data: StatisticsGraph, term?: 'day' | 'hour') {
  const {datasets, labels} = prepareDatasets(data);

  const colors: StatisticsGraph['colors'] = {};
  let totalYMin = Infinity;
  let totalYMax = -Infinity;
  datasets.forEach(({key, color, yMin, yMax}) => {
    colors[key] = color;

    if(yMin < totalYMin) {
      totalYMin = yMin;
    }

    if(yMax > totalYMax) {
      totalYMax = yMax;
    }
  });

  let xLabels: StatisticsGraph['xLabels'];
  switch(data.labelFormatter) {
    case 'statsFormatDayHour':
      xLabels = statsFormatDayHour(labels, data);
      break;
    case 'statsFormat(\'day\')':
      xLabels = statsFormatDay(labels, data);
      break;
    case 'statsFormat(\'hour\')':
    case 'statsFormat(\'5min\')':
      xLabels = statsFormatMin(labels, data);
      break;
    default:
      xLabels = statsFormatText(labels);
      break;
  }

  const analyzed: StatisticsGraph = {
    ...data,
    xLabels,
    datasets,
    isLines: data.type === 'line',
    isBars: data.type === 'bar',
    isSteps: data.type === 'step',
    isAreas: data.type === 'area',
    isPie: data.type === 'pie',
    yMin: totalYMin,
    yMax: totalYMax,
    colors,
    shouldZoomToPie: false,
    isZoomable: false
  };

  analyzed.shouldZoomToPie = !analyzed.onZoom && !!analyzed.isPercentage;
  analyzed.isZoomable = !!analyzed.onZoom || analyzed.shouldZoomToPie;

  return analyzed;
}

function prepareDatasets(data: StatisticsGraph) {
  const {type, labels, datasets, hasSecondYAxis} = data;

  return {
    labels: labels.slice(),
    datasets: datasets.map(({name, color, values}, i) => {
      const {min: yMin, max: yMax} = getMaxMin(values);

      return {
        type,
        key: `y${i}`,
        name,
        color,
        values: values.slice(),
        hasOwnYAxis: hasSecondYAxis && i === datasets.length - 1,
        yMin,
        yMax
      };
    })
  };
}

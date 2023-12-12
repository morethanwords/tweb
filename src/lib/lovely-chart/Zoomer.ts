import {analyzeData} from './data';
import {ZOOM_RANGE_DELTA, ZOOM_RANGE_MIDDLE, ZOOM_TIMEOUT} from './constants';
import {createColors} from './skin';
import {LovelyChartBuildedColors, LovelyChartHeader, LovelyChartMinimap, LovelyChartState, LovelyChartStateManager, LovelyChartTools, LovelyChartTooltip, StatisticsGraph} from './types';

export function createZoomer(
  data: StatisticsGraph,
  overviewData: StatisticsGraph,
  colors: LovelyChartBuildedColors,
  stateManager: LovelyChartStateManager,
  container: HTMLElement,
  header: LovelyChartHeader,
  minimap: LovelyChartMinimap,
  tooltip: LovelyChartTooltip,
  tools: LovelyChartTools
) {
  let _isZoomed: boolean = false;
  let _stateBeforeZoomIn: LovelyChartState;
  let _stateBeforeZoomOut: LovelyChartState;

  function zoomIn(state: typeof _stateBeforeZoomIn, labelIndex: number) {
    if(_isZoomed) {
      return;
    }

    const label = data.xLabels[labelIndex];

    _stateBeforeZoomIn = state;
    header.toggleIsZooming(true);
    tooltip.toggleLoading(true);
    tooltip.toggleIsZoomed(true);
    if(data.shouldZoomToPie) {
      container.classList.add('lovely-chart--state-zoomed-in');
      container.classList.add('lovely-chart--state-animating');
    }

    const {value} = label;
    const dataPromise = data.shouldZoomToPie ? Promise.resolve(_generatePieData(labelIndex)) : data.onZoom(value);
    dataPromise.then((newData) => _replaceData(newData, labelIndex, label));
  }

  function zoomOut(state: typeof _stateBeforeZoomOut) {
    if(!_isZoomed) {
      return;
    }

    _stateBeforeZoomOut = state;
    header.toggleIsZooming(true);
    tooltip.toggleLoading(true);
    tooltip.toggleIsZoomed(false);
    if(data.shouldZoomToPie) {
      container.classList.remove('lovely-chart--state-zoomed-in');
      container.classList.add('lovely-chart--state-animating');
    }

    const labelIndex = Math.round((state.labelFromIndex + state.labelToIndex) / 2);
    _replaceData(overviewData, labelIndex);
  }

  function isZoomed() {
    return _isZoomed;
  }

  function _replaceData(newRawData: StatisticsGraph, labelIndex: number, zoomInLabel?: StatisticsGraph['xLabels'][0]) {
    if(!newRawData) {
      tooltip.toggleLoading(false);
      tooltip.toggleIsZoomed(false);
      header.toggleIsZooming(false);

      return;
    }

    tooltip.toggleLoading(false);

    const labelWidth = 1 / data.xLabels.length;
    const labelMiddle = labelIndex / (data.xLabels.length - 1);
    const filter: Record<string, boolean> = {};
    data.datasets.forEach(({key}) => filter[key] = false);
    const newData = analyzeData(newRawData, _isZoomed || data.shouldZoomToPie ? 'day' : 'hour');
    const shouldZoomToLines = Object.keys(data.datasets).length !== Object.keys(newData.datasets).length;

    stateManager.update({
      range: {
        begin: labelMiddle - labelWidth / 2,
        end: labelMiddle + labelWidth / 2
      },
      filter
    });

    setTimeout(() => {
      Object.assign(data, newData);

      if(shouldZoomToLines && newRawData.colors) {
        Object.assign(colors, createColors(newRawData.colors));
      }

      if(shouldZoomToLines) {
        minimap.toggle(_isZoomed);
        tools.redraw();
        const {scrollWidth, scrollHeight} = container;
        container.style.width = `${scrollWidth}px`;
        container.style.height = `${scrollHeight}px`;
      }

      stateManager.update({
        range: {
          begin: ZOOM_RANGE_MIDDLE - ZOOM_RANGE_DELTA,
          end: ZOOM_RANGE_MIDDLE + ZOOM_RANGE_DELTA
        },
        focusOn: null
      }, true);

      const daysCount = _isZoomed || data.shouldZoomToPie ? data.xLabels.length : data.xLabels.length / 24;
      const halfDayWidth = (1 / daysCount) / 2;

      let range: typeof _stateBeforeZoomIn['range'];
      let filter: typeof _stateBeforeZoomIn['filter'];

      if(_isZoomed) {
        range = {
          begin: _stateBeforeZoomIn.begin,
          end: _stateBeforeZoomIn.end
        };
        filter = shouldZoomToLines ? _stateBeforeZoomIn.filter : _stateBeforeZoomOut.filter;
      } else {
        if(shouldZoomToLines) {
          range = {
            begin: 0,
            end: 1
          };
          filter = {};
          data.datasets.forEach(({key}) => filter[key] = true);
        } else {
          range = data.shouldZoomToPie ? {
            begin: ZOOM_RANGE_MIDDLE - halfDayWidth,
            end: ZOOM_RANGE_MIDDLE + halfDayWidth
          } : newData.minimapRange;
          filter = _stateBeforeZoomIn.filter;
        }
      }

      stateManager.update({
        range,
        filter,
        minimapDelta: _isZoomed ? null : range.end - range.begin
      });

      if(zoomInLabel) {
        header.zoom(data.getLabelDate(zoomInLabel, {displayWeekDay: true}));
      }

      _isZoomed = !_isZoomed;
      header.toggleIsZooming(false);
    }, stateManager.hasAnimations() ? ZOOM_TIMEOUT : 0);

    setTimeout(() => {
      if(data.shouldZoomToPie) {
        container.classList.remove('lovely-chart--state-animating');
      }
    }, stateManager.hasAnimations() ? 1000 : 0);
  }

  function _generatePieData(labelIndex: number) {
    return Object.assign(
      {},
      overviewData,
      {
        type: 'pie',
        // labels: overviewData.labels.slice(labelIndex - 3, labelIndex + 4),
        labels: overviewData.labels.slice(),
        datasets: overviewData.datasets.map((dataset) => ({
          ...dataset,
          // values: dataset.values.slice(labelIndex - 3, labelIndex + 4)
          values: dataset.values.slice()
        }))
      }
    );
  }

  return {zoomIn, zoomOut, isZoomed};
}

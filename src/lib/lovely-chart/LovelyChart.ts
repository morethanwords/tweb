import {createStateManager} from './StateManager';
import {createHeader} from './Header';
import {createAxes} from './Axes';
import {createMinimap} from './Minimap';
import {createTooltip} from './Tooltip';
import {createTools} from './Tools';
import {createZoomer} from './Zoomer';
import {createColors} from './skin';
import {analyzeData} from './data';
import {setupCanvas, clearCanvas} from './canvas';
import {preparePoints} from './preparePoints';
import {createProjection} from './Projection';
import {drawDatasets} from './drawDatasets';
import {createElement} from './minifiers';
import {getLabelDate, getLabelTime} from './format';
import {
  X_AXIS_HEIGHT,
  GUTTER,
  PLOT_TOP_PADDING,
  PLOT_HEIGHT,
  PLOT_LINE_WIDTH,
  SIMPLIFIER_PLOT_FACTOR
} from './constants';
import {getSimplificationDelta, isDataRange} from './formulas';
import {debounce} from './utils';
import './styles/index.scss';
import {LovelyChartColors, LovelyChartPoint, LovelyChartPoints, LovelyChartProjection, LovelyChartProjectionParams, LovelyChartState, StatisticsGraph} from './types';

export function create(container: HTMLElement, originalData: StatisticsGraph) {
  let _stateManager: ReturnType<typeof createStateManager>;

  let _element: HTMLElement;
  let _plot: HTMLCanvasElement;
  let _context: CanvasRenderingContext2D;
  let _plotSize: {width: number, height: number};

  let _header: ReturnType<typeof createHeader>;
  let _axes: ReturnType<typeof createAxes>;
  let _minimap: ReturnType<typeof createMinimap>;
  let _tooltip: ReturnType<typeof createTooltip>;
  let _tools: ReturnType<typeof createTools>;
  let _zoomer: ReturnType<typeof createZoomer>;

  let _state: LovelyChartState;
  let _windowWidth = window.innerWidth;

  originalData.getLabelDate ||= getLabelDate;
  originalData.getLabelTime ||= getLabelTime;

  const _data = analyzeData(originalData);
  let _colors = createColors(_data.colors, undefined, originalData.myColors);
  const _redrawDebounced = debounce(_redraw, 500, false, true);

  _setupComponents();
  _setupGlobalListeners();

  function _setupComponents() {
    _setupContainer();
    _header = createHeader(_element, _data.title, _data.zoomOutLabel, _onZoomOut, originalData.headerElements?.title, originalData.headerElements?.caption, originalData.headerElements?.zoomOut);
    _setupPlotCanvas();
    _stateManager = createStateManager(_data, _plotSize, _onStateUpdate);
    _axes = createAxes(_context, _data, _plotSize, _colors, originalData.axesFont);
    _minimap = createMinimap(_element, _data, _colors, _onRangeChange);
    _tooltip = createTooltip(_element, _data, _plotSize, _colors, _onZoomIn, _onFocus);
    _tools = createTools(_element, _data, _onFilterChange);
    _zoomer = _data.isZoomable && createZoomer(_data, originalData, _colors, _stateManager, _element, _header, _minimap, _tooltip, _tools);
    // hideOnScroll(_element);
  }

  function _setupContainer() {
    _element = createElement();
    _element.className = `lovely-chart--container${_data.shouldZoomToPie ? ' lovely-chart--container-type-pie' : ''}`;

    container.appendChild(_element);
  }

  function _setupPlotCanvas() {
    const {canvas, context} = setupCanvas(_element, {
      width: _element.clientWidth,
      height: PLOT_HEIGHT
    });
    canvas.classList.add('lovely--chart-canvas');

    _plot = canvas;
    _context = context;

    _plotSize = {
      width: _plot.offsetWidth,
      height: _plot.offsetHeight
    };
  }

  function _onStateUpdate(state: typeof _state) {
    _state = state;

    const {datasets} = _data;
    const range = {
      from: state.labelFromIndex,
      to: state.labelToIndex
    };
    const boundsAndParams: LovelyChartProjectionParams = {
      begin: state.begin,
      end: state.end,
      totalXWidth: state.totalXWidth,
      yMin: state.yMinViewport,
      yMax: state.yMaxViewport,
      availableWidth: _plotSize.width,
      availableHeight: _plotSize.height - X_AXIS_HEIGHT,
      xPadding: GUTTER,
      yPadding: PLOT_TOP_PADDING
    };
    const visibilities = datasets.map(({key}) => state[`opacity#${key}`]);
    const points = preparePoints(_data, datasets, range, visibilities, boundsAndParams);
    const projection = createProjection(boundsAndParams);

    let secondaryPoints: LovelyChartPoint[] = null;
    let secondaryProjection: LovelyChartProjection = null;
    if(_data.hasSecondYAxis) {
      const secondaryDataset = datasets.find((d) => d.hasOwnYAxis);
      const bounds = {
        yMin: state.yMinViewportSecond,
        yMax: state.yMaxViewportSecond
      };
      secondaryPoints = preparePoints(_data, [secondaryDataset], range, visibilities, bounds)[0];
      secondaryProjection = projection.copy(bounds);
    }

    if(!_data.hideCaption) {
      _header.setCaption(_getCaption(state));
    }

    clearCanvas(_plot, _context);

    const totalPoints = points.reduce((a, p) => a + p.length, 0);
    const simplification = getSimplificationDelta(totalPoints) * SIMPLIFIER_PLOT_FACTOR;

    drawDatasets(
      _context, state, _data,
      range, points, projection, secondaryPoints, secondaryProjection,
      PLOT_LINE_WIDTH, visibilities, _colors, false, simplification, originalData.pieFont
    );
    if(!_data.isPie) {
      _axes.drawYAxis(state, projection, secondaryProjection);
      // TODO check isChanged
      _axes.drawXAxis(state, projection);
    }
    _minimap.update(state);
    _tooltip.update(state, points, projection, secondaryPoints, secondaryProjection);
  }

  function _onRangeChange(range: LovelyChartState['range']) {
    _stateManager.update({range});
  }

  function _onFilterChange(filter: LovelyChartState['filter']) {
    _stateManager.update({filter});
  }

  function _onFocus(focusOn: LovelyChartState['focusOn']) {
    if(_data.isBars || _data.isPie || _data.isSteps) {
      // TODO animate
      _stateManager.update({focusOn});
    }
  }

  function _onZoomIn(labelIndex: number) {
    _zoomer.zoomIn(_state, labelIndex);
  }

  function _onZoomOut() {
    _zoomer.zoomOut(_state);
  }

  function _setupGlobalListeners() {
    window.addEventListener('resize', () => {
      if(window.innerWidth !== _windowWidth) {
        _windowWidth = window.innerWidth;
        _redrawDebounced();
      }
    });

    window.addEventListener('orientationchange', () => {
      _redrawDebounced();
    });
  }

  function _redraw() {
    Object.assign(_data, analyzeData(originalData));
    _element.remove();
    _setupComponents();
  }

  function _getCaption(state: typeof _state) {
    let startIndex;
    let endIndex;

    if(_zoomer && _zoomer.isZoomed()) {
      // TODO Fix label
      startIndex = state.labelFromIndex === 0 ? 0 : state.labelFromIndex + 1;
      endIndex = state.labelToIndex === state.totalXWidth - 1 ? state.labelToIndex : state.labelToIndex - 1;
    } else {
      startIndex = state.labelFromIndex;
      endIndex = state.labelToIndex;
    }

    return isDataRange(_data.xLabels[startIndex], _data.xLabels[endIndex]) ?
      (
        `${_data.getLabelDate(_data.xLabels[startIndex])}` +
        ' — ' +
        `${_data.getLabelDate(_data.xLabels[endIndex])}`
      ) :
      _data.getLabelDate(_data.xLabels[startIndex], {displayWeekDay: true});
  }

  function onThemeChange(myColors?: LovelyChartColors) {
    if(myColors) {
      _colors = createColors(_data.colors, _colors, myColors);
    }

    _stateManager.update();
  }

  return {
    onThemeChange
  };
}

import TDrag from './drag';
import {isTouchDevice, getElemPagePos, triggerEvent, getFormatter, getXIndex} from './utils';
import {TChartAngle, TChartAnimationProperty, TChartData, TChartUnitOptions} from './types';

type TipLabel = ReturnType<TTip['addLabel']>;

export default class TTip {
  private opts: TChartUnitOptions;
  private shown: boolean;
  private isTouch: boolean;
  private cache: any;
  public labels: TipLabel[];
  private allLabel: TipLabel;
  private pieLabel: TipLabel;
  private tooltipOnHover: boolean;
  private points: HTMLElement[];
  private drag: TDrag;
  private canvasPos: {x: number; y: number;};
  private dx: number;
  private dy: number;
  private tp: string;
  private showTimeout: number;

  private $canvas: HTMLElement;
  private $line: HTMLElement;
  private $lineFill: HTMLElement;
  private $tip: HTMLElement;
  private $tipDt: HTMLElement;
  private $tipDtText: Text;
  private $tipArrow: HTMLElement;
  private $tipLoader: HTMLElement;
  private $tipScrollerWrapper: HTMLElement;
  private $tipScroller: HTMLElement;
  private bodyTimeout: number;
  private detailCallbacks: any[];
  private prevXInd: number;
  private isDarkMode: boolean;
  private lastCurPieItemInd: number;
  private lastTipTop: number;
  private lastTipLeft: number;
  private tipH: number;
  private tipW: number;
  private itemsVisible: number;
  private maxLabelWidth: number;
  private maxValueWidth: number;
  private maxPercentageWidth: number;
  private maxDateWidth: number;
  private rowPaddings: number;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;

    this.shown = false;

    this.isTouch = isTouchDevice();
    this.$canvas = opts.$canvas;
    this.cache = {};

    this.$tip = document.createElement('div');
    this.$tip.className = 'tchart--tip';
    opts.$parent.appendChild(this.$tip);

    this.$tipDt = document.createElement('h6');
    this.$tipDt.className = 'tchart--tip-header';
    this.$tip.appendChild(this.$tipDt);

    this.$tipDtText = document.createTextNode('');
    this.$tipDt.appendChild(this.$tipDtText);
    this.$tipDtText.nodeValue = '.';

    this.$tipArrow = document.createElement('div');
    this.$tipArrow.className = 'tchart--tip-arrow';
    this.$tip.appendChild(this.$tipArrow);

    this.$tipLoader = document.createElement('div');
    this.$tipLoader.className = 'tchart--tip-loader';
    this.$tip.appendChild(this.$tipLoader);

    this.$tipScrollerWrapper = document.createElement('div');
    this.$tipScrollerWrapper.className = 'tchart--tip-scroller-wrapper';
    this.$tip.appendChild(this.$tipScrollerWrapper);

    this.$tipScroller = document.createElement('div');
    this.$tipScroller.className = 'tchart--tip-scroller';
    this.$tipScrollerWrapper.appendChild(this.$tipScroller);

    this.$tipScroller.addEventListener('scroll', this.updateTipScrollClasses);

    this.labels = [];
    opts.data.ys.forEach((item) => {
      this.labels.push(this.addLabel(item));
    });

    if(opts.graphStyle === 'bar' && opts.data.ys.length > 1) {
      this.allLabel = this.addLabel({
        label: opts.settings.ALL_LABEL,
        outside: true
      });
    }

    if(opts.graphStyle === 'area') {
      this.pieLabel = this.addLabel({
        label: 'pie',
        outside: true
      });
    }

    this.tooltipOnHover = this.isTouch ? false : opts.data.tooltipOnHover;

    if(opts.graphStyle !== 'bar') {
      this.$line = document.createElement('div');
      this.$line.className = 'tchart--line';
      opts.$parent.appendChild(this.$line);

      this.$lineFill = document.createElement('div');
      this.$lineFill.className = 'tchart--line-fill';
      this.$line.appendChild(this.$lineFill);

      if(opts.graphStyle !== 'area') {
        this.points = opts.data.ys.map(() => {
          const $el = document.createElement('span');
          $el.className = 'tchart--line-point';
          this.$line.appendChild($el);
          return $el;
        });
      }
    } else {
      opts.state.barInd = -1;
      opts.state.barO = 0;
    }

    if(!this.tooltipOnHover) {
      this.drag = new TDrag({
        $el: this.$canvas,
        onDragStart: (params) => {
          this.canvasPos = getElemPagePos(this.$canvas);
          this.dx = params.pageX - this.canvasPos.x;
          this.dy = params.pageY - this.canvasPos.y;

          const dims = this.opts.state.dims.tip;
          this.tp = this.getTp(this.dx, this.dy - dims.t, params.isTouch);

          delete this.prevXInd;

          clearTimeout(this.showTimeout);
          this.showTimeout = window.setTimeout(() => {
            this.toggle(!!this.tp);
            this.tp && this.render();
          }, this.isTouch ? 100 : 30);

          document.body.removeEventListener('click', this.onBodyClick);

          return !this.tp;
        },
        onDragMove: (params) => {
          if(params.canceled) {
            clearTimeout(this.showTimeout);
            this.toggle(false);
            return;
          }
          this.canvasPos = this.canvasPos || getElemPagePos(this.$canvas);
          this.dx = params.pageX - this.canvasPos.x;
          this.dy = params.pageY - this.canvasPos.y;
          this.render({isMove: true});
        },
        onDragEnd: () => {
          delete this.canvasPos;
          this.bodyTimeout = window.setTimeout(() => {
            document.body.addEventListener('click', this.onBodyClick);
          }, 140);
        }
      });


      this.$tip.addEventListener('click', this.onTipClick);
    } else {
      this.$canvas.addEventListener('mousemove', (e) => {
        this.canvasPos = this.canvasPos || getElemPagePos(this.$canvas);
        this.dx = e.pageX - this.canvasPos.x;
        this.dy = e.pageY - this.canvasPos.y;

        const dims = this.opts.state.dims.tip;
        this.tp = this.getTp(this.dx, this.dy - dims.t, this.isTouch);

        if(this.tp) {
          if(!this.shown) {
            delete this.prevXInd;
            this.toggle(true);
            this.render({});
          } else {
            this.render({isMove: true});
          }
        } else {
          this.toggle(false);
        }
      });

      this.$canvas.addEventListener('mouseleave', () => {
        delete this.canvasPos;
        this.toggle(false);
      });

      this.$canvas.addEventListener('click', (e) => {
        if(this.shown) {
          this.onTipClick(e);
        }
      });

      this.$tip.style.pointerEvents = 'none';
    }

    this.trackMouse(true);

    this.updateColors();
  }

  onResize(rect?: any) {
    const dims = this.opts.state.dims.tip;

    if(this.$line) {
      const dh = this.opts.graphStyle === 'area' ? 25 : 16;

      this.$line.style.top = dims.t + 'px';
      this.$line.style.height = dims.h + 'px';

      this.$lineFill.style.top = dh + 'px';
      this.$lineFill.style.bottom = (this.opts.settings.PADD[2] + 1) + 'px';
    }

    this.render();
  }

  abortDetailCallbacks() {
    if(!this.detailCallbacks) return;

    this.detailCallbacks.forEach((item) => {
      item.cancelled = true;
    });

    delete this.detailCallbacks;
  }

  onTipClick = (e: Event) => {
    if(this.prevXInd === undefined) return;
    if(!this.opts.additional.onClick) return;
    if(!this.opts.data.hasDetail) return;
    if(this.opts.state.zoomMode || this.opts.state.zoomModeSpecial) return;

    e.stopPropagation();

    if(this.$tip.classList.contains('tchart--tip__loading')) return;

    const x = this.opts.data.x[this.prevXInd];

    // area case
    if(!this.opts.data.detailsFunc) {
      this.toggle(false, true);
      this.opts.additional.onClick(true, x);
      return;
    }

    this.$tip.classList.remove('tchart--tip__error');
    this.$tip.classList.add('tchart--tip__loading');

    if(this.cache[x]) {
      this.toggle(false, true);
      this.opts.additional.onClick(true, x, this.cache[x]);
      this.$tip.classList.remove('tchart--tip__loading');
      return;
    }

    this.abortDetailCallbacks();

    const dataPromise = this.opts.data.detailsFunc(x);

    this.detailCallbacks = this.detailCallbacks || [];

    const successDetailCallback = (val: any) => {
      if((successDetailCallback as any).cancelled) return;
      this.$tip.classList.remove('tchart--tip__loading');

      if(!val || !val.columns) {
        this.$tip.classList.add('tchart--tip__error');
        return;
      }

      this.toggle(false, true);
      this.opts.additional.onClick(true, x, val);
      this.cache[x] = val;
    };

    const errorDetailCallback = (val: any) => {
      if((errorDetailCallback as any).cancelled) return;
      console.log('error:', val);
      this.$tip.classList.remove('tchart--tip__loading');
      this.$tip.classList.add('tchart--tip__error');
    };

    this.detailCallbacks.push(successDetailCallback);
    this.detailCallbacks.push(errorDetailCallback);

    dataPromise
    .then(successDetailCallback)
    .catch(errorDetailCallback);
  };

  updateColors() {
    const ys = this.opts.data.ys;

    this.labels.forEach((item, ind) => {
      this.points && (this.points[ind].style.borderColor = this.isDarkMode ? ys[ind].colors_n[0] : ys[ind].colors_d[0]);
      item.$value.style.color = this.isDarkMode ? ys[ind].colors_n[2] : ys[ind].colors_d[2];
    });

    if(this.allLabel) {
      this.allLabel.$value.style.color = 'var(--tchart-text-color)';
    }

    if(this.$lineFill) {
      // this.$lineFill.style.backgroundColor = 'rgba(var(--tchart-background-color-rgb), 0.1)';
      this.$lineFill.style.backgroundColor = this.opts.settings.COLORS.grid;
    }
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
    this.updateColors();
  }

  addLabel(item: Partial<Pick<TChartData['ys'][0], 'label' | 'outside'>>) {
    const $row = document.createElement('div');
    $row.className = 'tchart--tip-row';
    if(item.outside) {
      this.$tip.appendChild($row);
      $row.classList.add('tchart--tip-row__outside');
    } else {
      this.$tipScroller.appendChild($row);
    }

    const $label = document.createElement('span');
    $label.className = 'tchart--tip-row-label';
    $row.appendChild($label);

    const $labelText = document.createTextNode('');
    $labelText.nodeValue = item.label;
    $label.appendChild($labelText);

    let $perText: Text;

    let $per: HTMLParagraphElement;
    if(this.opts.graphStyle === 'area') {
      $per = document.createElement('p');
      $per.className = 'tchart--tip-row-per';
      $row.appendChild($per);

      $perText = document.createTextNode('');
      $per.appendChild($perText);
    }

    const $value = document.createElement('div');
    $value.className = 'tchart--tip-row-value';
    $row.appendChild($value);

    const $valueText = document.createTextNode('');
    $value.appendChild($valueText);

    return {
      $row: $row,
      $value: $value,
      $valueText: $valueText,
      $label: $label,
      $labelText: $labelText,
      $per: $per,
      $perText: $perText
    };
  }

  getTp(x: number, y: number, isTouch?: boolean) {
    if(this.opts.graphStyle === 'area' && this.opts.state.zoomMode) {
      const dims = this.opts.state.dims.graph;
      const cx = dims.w / 2;
      const cy = dims.h / 2;
      const dist = Math.pow((cy - y) * (cy - y) + (x - cx) * (x - cx), 0.5);
      return dist <= this.opts.settings.PIE_RADIUS ? 'graph' : '';
    } else {
      const dims = this.opts.state.dims.tip;
      if(y < 0 || y > dims.h) return '';
      return 'graph';
    }
  }

  trackMouse(enabled?: boolean, noPropagation?: boolean) {
    if(this.isTouch) return;

    this.$canvas.addEventListener('mousemove', this.onMouseMove);
    this.$canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  onMouseLeave = () => {
    this.$canvas.classList.remove('tchart--graph-canvas__tip-pointer');
    delete this.canvasPos;
  };

  onMouseMove = (e: MouseEvent) => {
    this.canvasPos = this.canvasPos || getElemPagePos(this.$canvas);
    const dx = e.pageX - this.canvasPos.x;
    const dy = e.pageY - this.canvasPos.y;

    const dims = this.opts.state.dims.tip;
    const tp = this.getTp(dx, dy - dims.t, false);

    this.onMouseLeave();
    tp && this.$canvas.classList.add('tchart--graph-canvas__tip-pointer');
  };

  toggle(enabled: boolean, shiftHide?: boolean) {
    const opts = this.opts;
    const state = opts.state;

    if(enabled && !this.shown) {
      this.$tip.classList.add('tchart--tip__visible');
      if(this.opts.data.hasDetail && !(this.opts.state.zoomMode || this.opts.state.zoomModeSpecial)) {
        this.$tip.classList.add('tchart--tip__has-zoom');
      } else {
        this.$tip.classList.remove('tchart--tip__has-zoom');
      }
      this.$tip.classList.remove('tchart--tip__shiftHide');
      this.$line && this.$line.classList.add('tchart--line__visible');
      triggerEvent('chart-hide-tips', {except: this.opts.chart});
    }

    if(!enabled && this.shown) {
      delete this.lastCurPieItemInd;

      if(opts.graphStyle === 'area' && state.zoomMode) {
        const animProps: TChartAnimationProperty[] = [];
        for(let i = 0; i < state.pieAngles.length; i++) {
          const pieItem = state.pieAngles[i];
          animProps.push({
            prop: `pieInd_${pieItem.ind}`,
            state: opts.state,
            end: 0,
            duration: 350,
            tween: 'exp',
            speed: 0.2,
            group: {top: true}
          });
        }
        opts.animator.add(animProps);
      }

      if(shiftHide) {
        this.$tip.classList.add('tchart--tip__shiftHide');
        this.lastTipTop -= 12;
        this.lastTipLeft = this.lastTipLeft < this.opts.state.dims.tip.w / 2 ? this.lastTipLeft - 12 : this.lastTipLeft + 12;
        this.$tip.style.transform = 'translate(' + this.lastTipLeft + 'px,' + this.lastTipTop + 'px)';
        this.$tip.style.webkitTransform = 'translate(' + this.lastTipLeft + 'px,' + this.lastTipTop + 'px)';
      }
      this.$tip.classList.remove('tchart--tip__visible');
      this.$line && this.$line.classList.remove('tchart--line__visible');

      this.abortDetailCallbacks();

      this.$tip.classList.remove('tchart--tip__error');
      this.$tip.classList.remove('tchart--tip__loading');

      // add to animaion query request to disable tooltip selection overlay
      if(this.opts.graphStyle === 'bar') {
        this.opts.animator.add([{
          prop: 'barInd',
          state: this.opts.state,
          end: -1,
          duration: 0,
          delay: 150,
          tween: 'linear',
          group: {top: true}
        }, {
          prop: 'barO',
          state: this.opts.state,
          end: 0,
          duration: 150,
          tween: 'exp',
          speed: 0.3,
          group: {top: true}
        }]);
      }
      document.body.removeEventListener('click', this.onBodyClick);
    }

    this.shown = enabled;
  }

  onBodyClick = (e: Event) => {
    if(e.target === this.$canvas) return;

    this.toggle(false);
  };

  renderPieTooltip(params?: any) {
    const opts = this.opts;
    const state = opts.state;
    const settings = this.opts.settings;
    const pTop = settings.PADD[0];
    const pRight = settings.PADD[1];
    const pBottom = settings.PADD[2];
    const pLeft = settings.PADD[3];
    const dims = state.dims.graph;
    const dimsTip = state.dims.tip;
    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const formatter = getFormatter('yTooltipFormatter', opts.data, state.zoomMorph);
    let ang = Math.atan2(cy - this.dy + dims.t, this.dx - cx);
    ang = ang < 0 ? Math.PI * 2 + ang : ang;

    let curPieItem: TChartAngle;
    for(let i = 0; i < state.pieAngles.length; i++) {
      const pieItem = state.pieAngles[i];
      if(ang <= pieItem.st && ang >= pieItem.ed) {
        curPieItem = pieItem;
      }

      if(ang - 2 * Math.PI <= pieItem.st && ang - 2 * Math.PI >= pieItem.ed) {
        curPieItem = pieItem;
      }
    }

    if(this.lastCurPieItemInd !== curPieItem.ind) {
      const animProps: TChartAnimationProperty[] = [];
      for(let i = 0; i < state.pieAngles.length; i++) {
        const pieItem = state.pieAngles[i];
        animProps.push({
          prop: `pieInd_${pieItem.ind}`,
          state: opts.state,
          end: pieItem === curPieItem ? 1 : 0,
          duration: 350,
          tween: 'exp',
          speed: 0.2,
          group: {top: true}
        });
      }
      opts.animator.add(animProps);
    }


    this.pieLabel.$row.style.display = 'block';
    this.labels.forEach((item) => {
      item.$row.style.display = 'none';
    });

    this.pieLabel.$labelText.nodeValue = curPieItem.label;
    this.pieLabel.$valueText.nodeValue = !isNaN(curPieItem.value) ? formatter(curPieItem.value) : 'n/a';

    this.pieLabel.$value.style.color = curPieItem.color;
    this.$tip.classList.add('tchart--tip__piemode');
    this.$line && this.$line.classList.add('tchart--line__piemode');

    this.tipH = this.$tip.offsetHeight;
    this.tipW = this.$tip.offsetWidth;

    const tipMarginFromPointer = 20;
    let left = (this.dx - this.tipW / 2);
    let top = Math.min(this.dy - tipMarginFromPointer - this.tipH, dimsTip.t + dimsTip.h - this.tipH - pBottom);
    if(top < dimsTip.t + pTop) {
      top = dimsTip.t + pTop;
    }

    left = Math.min(Math.max(left, pLeft / 2), dimsTip.w - this.tipW - pRight / 2);

    this.$tip.style.transform = 'translate(' + (left << 0) + 'px,' + (top << 0) + 'px)';
    this.$tip.style.webkitTransform = 'translate(' + (left << 0) + 'px,' + (top << 0) + 'px)';

    this.lastCurPieItemInd = curPieItem.ind;

    this.updateTipScrollClasses();
  }

  render(params: any = {}) {
    if(!this.shown) return;

    const opts = this.opts;
    const state = opts.state;
    const settings = this.opts.settings;
    const pTop = settings.PADD[0];
    const pRight = settings.PADD[1];
    const pBottom = settings.PADD[2];
    const pLeft = settings.PADD[3];
    let $el: HTMLElement;
    let y1: number, y2: number;
    let itemsVisible = 0;
    const dims = this.opts.state.dims.tip;
    const formatter = getFormatter('yTooltipFormatter', opts.data, state.zoomMorph);

    const zoomMorph = state.zoomMorph === undefined ? 0 : state.zoomMorph;
    const offsetForBarGraphMain = opts.graphStyle === 'bar' || opts.graphStyle === 'step' ? this.opts.data.mainPeriodLen : 0;
    const offsetForBarGraphScale = offsetForBarGraphMain * (1 - zoomMorph);

    this.abortDetailCallbacks();

    this.$tip.classList.remove('tchart--tip__error');
    this.$tip.classList.remove('tchart--tip__loading');

    if(opts.graphStyle === 'area' && state.zoomMode) {
      this.renderPieTooltip(params);
      return;
    } else {
      if(this.pieLabel) {
        this.pieLabel.$row.style.display = 'none';
      }
    }

    const constrainedDx = Math.max(Math.min(this.dx, dims.w - 1), 0);
    const x = state.x1 + (state.x2 - state.x1 + offsetForBarGraphScale) * ((constrainedDx - pLeft) / (dims.w - pRight - pLeft));
    const xPos = getXIndex(opts.data.x, x);
    let xInd = (opts.graphStyle === 'bar' || opts.graphStyle === 'step' ? Math.floor(xPos) : Math.round(xPos));

    // prevent out of canvas points
    if(opts.graphStyle !== 'bar' && opts.graphStyle !== 'step') {
      const lx = (opts.data.x[xInd] - state.x1) / (state.x2 - state.x1 + offsetForBarGraphScale);
      const cx = ((lx * (dims.w - pLeft - pRight) + pLeft) << 0);
      if(cx < 0) {
        xInd++
      }
      if(cx > dims.w - 1) {
        xInd--;
      }
    } else {
      if(this.opts.state.zoomMode || this.opts.state.zoomModeSpecial) {
        if(xInd < opts.state.detailInd1) {
          xInd++;
        }
        if(xInd > opts.state.detailInd2) {
          xInd--;
        }
      }
    }


    // add to anitaion query request to redraw graph
    // it will notice barInd: xInd and draw needed selection
    if(opts.graphStyle === 'bar') {
      opts.animator.add([{
        prop: 'barInd',
        state: opts.state,
        end: xInd,
        duration: 0,
        tween: 'linear',
        group: {top: true}
      }, {
        prop: 'barO',
        state: this.opts.state,
        end: 1,
        duration: 150,
        tween: 'exp',
        speed: 0.3,
        group: {top: true}
      }]);
    }

    if(this.prevXInd !== xInd || !params.isMove) {
      this.$tip.classList.remove('tchart--tip__piemode');
      this.$line && this.$line.classList.remove('tchart--line__piemode');


      this.labels.forEach((item, ind) => {
        const display = opts.state[`e_${ind}`] && !isNaN(opts.data.ys[ind].y[xInd]) ? 'block' : 'none';
        item.$row.style.display = display;
        this.points && (this.points[ind].style.display = display);
        itemsVisible += display === 'block' ? 1 : 0;
      });

      this.itemsVisible = itemsVisible;
      if(this.allLabel) {
        this.allLabel.$row.style.display = itemsVisible > 1 ? 'block' : 'none';
      }

      if(this.itemsVisible) {
        this.$tip.classList.remove('tchart--tip__has_no_items');
        this.$line && this.$line.classList.remove('tchart--line__has_no_items');
      } else {
        this.$tip.classList.add('tchart--tip__has_no_items');
        this.$line && this.$line.classList.add('tchart--line__has_no_items');
      }

      let xw = 0;
      if(opts.graphStyle === 'step') {
        if(this.opts.state.zoomMode) {
          xw = opts.data.detailPeriodLen;
        } else {
          xw = opts.data.mainPeriodLen;
        }
      }

      const lx = (opts.data.x[xInd] - state.x1 + xw / 2) / (state.x2 - state.x1 + offsetForBarGraphScale);
      const cx = ((lx * (dims.w - pLeft - pRight) + pLeft) << 0);

      this.$line && (this.$line.style.transform = 'translateX(' + cx + 'px)');
      this.$line && (this.$line.style.webkitTransform = 'translateX(' + cx + 'px)');

      this.$tipDtText.nodeValue = opts.data.dates[xInd];

      let sumAll = 0;
      opts.data.ys.forEach((item, ind) => {
        if(opts.state[`e_${ind}`] && !isNaN(item.y[xInd])) {
          this.labels[ind].$valueText.nodeValue = formatter(item.y[xInd]);
          sumAll += item.y[xInd] || 0

          if(this.points) {
            $el = this.points[ind];

            if(opts.pairY) {
              y1 = state[`y1_${ind}`] as number;
              y2 = state[`y2_${ind}`] as number;
            } else {
              y1 = state['y1'] as number;
              y2 = state['y2'] as number;
            }

            const y = (item.y[xInd] - y1) / (y2 - y1);
            $el.style.transform = 'translateY(' + ((dims.h - y * (dims.h - pTop - pBottom) - pBottom) << 0) + 'px)';
            $el.style.webkitTransform = 'translateY(' + ((dims.h - y * (dims.h - pTop - pBottom) - pBottom) << 0) + 'px)';
          }
        }
      });


      if(this.allLabel) {
        this.allLabel.$valueText.nodeValue = formatter(sumAll);
      }

      if(!params.isMove) {
        // reset max width for current tooltip shown session
        this.maxLabelWidth = 0;
        this.maxValueWidth = 0;
        this.maxPercentageWidth = 0;
        this.maxDateWidth = 0;

        // calc content paddings
        const compStyles = window.getComputedStyle(this.$tip);
        this.rowPaddings = parseInt(compStyles.getPropertyValue('padding-left'), 10) + parseInt(compStyles.getPropertyValue('padding-right'), 10);
      }


      if(opts.graphStyle === 'area') {
        this.fillPercentages(xInd, sumAll);
      }

      // calc max labels and values width
      this.labels.forEach((item, ind) => {
        const isVisible = opts.state[`e_${ind}`] && !isNaN(opts.data.ys[ind].y[xInd]);
        if(isVisible) {
          const labelWidth = item.$label.offsetWidth;
          if(labelWidth > this.maxLabelWidth) {
            this.maxLabelWidth = labelWidth;
          }
          const valueWidth = item.$value.offsetWidth;
          if(valueWidth > this.maxValueWidth) {
            this.maxValueWidth = valueWidth;
          }
        }
      });


      // calc tooltip width to fit all labels and values witout overlaping each another
      let minWidth = this.rowPaddings + this.maxLabelWidth + 20 +this.maxValueWidth;// 20 - min margin between label and value
      minWidth += opts.graphStyle === 'area' ? this.maxPercentageWidth : 0; // percentages block for area

      // and don't forget about date caption, 20 - space for detail arrow
      const dateWidth = this.rowPaddings + this.$tipDt.offsetWidth + 20;
      if(dateWidth > this.maxDateWidth) {
        this.maxDateWidth = dateWidth;
      }
      minWidth = Math.max(minWidth, this.maxDateWidth);

      this.$tip.style.width = minWidth + 'px';

      this.tipH = this.$tip.offsetHeight;
      this.tipW = this.$tip.offsetWidth;
    }

    let pos = this.itemsVisible <= 2 ? 'center' : 'side';
    const tipMarginFromPointer = 20;

    let left: number, top: number;
    if(pos === 'center') {
      left = (this.dx - this.tipW / 2);
      top = Math.min(this.dy - tipMarginFromPointer - this.tipH, dims.t + dims.h - this.tipH - pBottom);
      if(top < dims.t + pTop) {
        pos = 'side';
      }
    }

    if(pos === 'side') {
      if(this.dx > dims.w / 2) {
        left = this.dx - this.tipW - tipMarginFromPointer;
      } else {
        left = this.dx + tipMarginFromPointer;
      }
      top = Math.min(Math.max(this.dy - this.tipH / 2, dims.t + pTop), dims.t + dims.h - this.tipH - pBottom);
    }

    left = Math.min(Math.max(left, pLeft / 2), dims.w - this.tipW - pRight / 2);

    this.$tip.style.transform = 'translate(' + (left << 0) + 'px,' + (top << 0) + 'px)';
    this.$tip.style.webkitTransform = 'translate(' + (left << 0) + 'px,' + (top << 0) + 'px)';

    this.lastTipLeft = left << 0;
    this.lastTipTop = top << 0;

    this.prevXInd = xInd;

    this.updateTipScrollClasses();
  }

  updateTipScrollClasses = () => {
    if(this.$tipScroller.scrollHeight > this.$tipScroller.offsetHeight) {
      this.$tip.classList.add('tchart--tip__scroll');
    } else {
      this.$tip.classList.remove('tchart--tip__scroll');
    }

    if(this.$tipScroller.scrollTop <= 0) {
      this.$tip.classList.remove('tchart--tip__has_less');
    } else {
      this.$tip.classList.add('tchart--tip__has_less');
    }

    if(this.$tipScroller.scrollTop >= this.$tipScroller.scrollHeight - this.$tipScroller.offsetHeight) {
      this.$tip.classList.remove('tchart--tip__has_more');
    } else {
      this.$tip.classList.add('tchart--tip__has_more');
    }
  };

  fillPercentages(xInd: number, sumAll: number) {
    const opts = this.opts;
    const perInt: number[] = [];
    let maxLen = 2;

    opts.data.ys.forEach((item, ind) => {
      if(opts.state[`e_${ind}`]) {
        perInt[ind] = Math.max(Math.round(100 * item.y[xInd] / sumAll), 0);

        if(isNaN(item.y[xInd]) || sumAll === 0) {
          perInt[ind] = 0;
        }

        if(perInt[ind] === 100) {
          maxLen = 3;
        }
      }
    });

    opts.data.ys.forEach((item, ind) => {
      if(opts.state[`e_${ind}`]) {
        const percentageWidth = (maxLen * 8 + 17); // with right padding
        this.labels[ind].$label.style.transform = 'translateX(' + percentageWidth + 'px)';
        this.labels[ind].$label.style.webkitTransform = 'translateX(' + percentageWidth + 'px)';
        this.labels[ind].$perText.nodeValue = (perInt[ind]) + '%';
        this.labels[ind].$per.style.width = (percentageWidth - 7) + 'px';
        if(percentageWidth > this.maxPercentageWidth) {
          this.maxPercentageWidth = percentageWidth;
        }
      }
    });
  }
}

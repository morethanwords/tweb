import {getFormatter, yTickFormatter} from './utils';
import {TChartAnimationProperty, TChartState, TChartUnitOptions} from './types';

export type TChartAxisYItem = {
  animated?: boolean,
  numLeft?: number,
  strLeft: string,
  numRight?: number,
  strRight: string,
  newTo?: number,
  oProp?: `${'oyt' | 'oy'}_${number}`,
  yProp?: `${'yyt' | 'yy'}_${number}`,
  y?: number,
  state?: {
    id: string | number,
    numLeft?: number,
    strLeft?: string,
    numRight?: number,
    strRight?: string
  } & {[key in TChartAxisYItem['oProp'] | TChartAxisYItem['yProp']]: number}
};

export default class TAxisY {
  private opts: TChartUnitOptions;
  private ctx: CanvasRenderingContext2D;
  private uuid: number;
  private items: {[id: string]: TChartAxisYItem};
  private isDarkMode: boolean;
  private noAnimation: boolean;
  private forceUpdate: boolean;
  private animationInProgress: boolean;
  private animationEndTimeout: number;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.ctx = opts.ctx;
    this.uuid = 1;
    this.items = {};

    this.setAnimation(false);
    this.setForceUpdate(false);
  }

  onResize() {
    this.setAnimation(false);
    this.setForceUpdate(false);
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
  }

  setAnimation(enabled: boolean) {
    this.noAnimation = !enabled;
  }

  setForceUpdate(enabled: boolean) {
    this.forceUpdate = enabled;
  }

  deleteItem = (state: TChartState) => {
    delete this.items[state.id];
  };

  render(opacity: number) {
    let calcDataLeft: ReturnType<TAxisY['calcAxisData']>, calcDataRight: ReturnType<TAxisY['calcAxisData']>;
    if(this.opts.pairY) {
      calcDataLeft = this.calcAxisData('y1_0', 'y2_0');
      calcDataRight = this.calcAxisData('y1_1', 'y2_1');

      // left axis is main, if both need animation priority goes to left
      if((calcDataRight.needAnimation && !calcDataLeft.needAnimation) || this.opts.state['o_0'] < 1) {
        this.updateAxisState('y1_1', 'y2_1', 'numRight', calcDataRight, calcDataLeft, calcDataRight);
      } else {
        this.updateAxisState('y1_0', 'y2_0', 'numLeft', calcDataLeft, calcDataLeft, calcDataRight);
      }
    } else {
      calcDataLeft = this.calcAxisData('y1', 'y2');
      this.updateAxisState('y1', 'y2', 'numLeft', calcDataLeft, calcDataLeft, calcDataLeft);
    }

    this.renderState(opacity);
  }

  calcAxisData(y1Name: 'y1' | `y1_${number}`, y2Name: 'y2' | `y2_${number}`) {
    const state = this.opts.state;
    const pTop = this.opts.settings.PADD[0];
    const pBottom = this.opts.settings.PADD[2];
    const linesCount = Math.floor(this.opts.settings.Y_AXIS_RANGE);
    let withAnimation = false;

    const y1AnimItem = this.opts.animator.get(y1Name);
    const y2AnimItem = this.opts.animator.get(y2Name);
    const y1 = y1AnimItem ? y1AnimItem.end : state[y1Name];
    const y2 = y2AnimItem ? y2AnimItem.end : state[y2Name];

    const yRealStep = Math.round((y2 - y1) / this.opts.settings.Y_AXIS_RANGE);
    const yRealStart = y1;

    const yCurRange = state[y2Name] - state[y1Name];
    const changeSpeedFirst = state[y1Name] > y1 ? state[y1Name] / y1 : y1 / state[y1Name];
    const changeSpeedLast = state[y2Name] > y2 ? state[y2Name] / y2 : y2 / state[y2Name];

    const yEndRange = y2 - y1;
    const yScaleCur = (this.opts.state.dims.axisYLines.h - pTop - pBottom) / yCurRange;
    const yScaleEnd = (this.opts.state.dims.axisYLines.h - pTop - pBottom) / yEndRange;

    if(changeSpeedFirst > 1.05 || changeSpeedLast > 1.05 || this.forceUpdate) {
      withAnimation = true;
    }

    // this.items[0] check that items have been created
    withAnimation = this.items[0] && withAnimation && !this.noAnimation && !this.animationInProgress;

    return {
      needAnimation: withAnimation,
      y1: y1,
      y2: y2,
      yRealStep: yRealStep,
      yRealStart: yRealStart,
      yScaleCur: yScaleCur,
      yScaleEnd: yScaleEnd
    };
  }

  updateAxisState(
    y1Name: 'y1' | `y1_${number}`,
    y2Name: 'y2' | `y2_${number}`,
    numName: 'numLeft' | 'numRight',
    baseData: ReturnType<TAxisY['calcAxisData']>,
    leftData: ReturnType<TAxisY['calcAxisData']>,
    rightData: ReturnType<TAxisY['calcAxisData']>
  ) {
    const opts = this.opts;
    const settings = opts.settings;
    const dpi = opts.settings.dpi;
    const state = opts.state;
    const pTop = opts.settings.PADD[0];
    const pBottom = opts.settings.PADD[2];
    const pLeft = opts.settings.PADD[3];
    const pRight = opts.settings.PADD[1];
    const animator = opts.animator;
    let item: TChartAxisYItem;
    const linesCount = Math.floor(opts.settings.Y_AXIS_RANGE);
    let startedAtLeastOne = false;
    const dims = this.opts.state.dims.axisYLines;

    if(baseData.needAnimation) {
      this.animationInProgress = true;
    }

    for(let i = 0; i <= linesCount; ++i) {
      const numReal = baseData.yRealStart + Math.round(baseData.yRealStep * i);
      const numRealLeft = leftData.yRealStart + Math.round(leftData.yRealStep * i);
      const numRealRight = rightData.yRealStart + Math.round(rightData.yRealStep * i);
      const formatter = getFormatter('yTickFormatter', opts.data, state.zoomMorph) as any as typeof yTickFormatter;

      const numDisplayLeftStr = formatter(numRealLeft, leftData.yRealStep);

      // then first graph is hidden we will show rounded range and numbers for second one
      // else we will fit second graphic exactly to same bound as first one,
      // thus loosing the ability to use rounded numvers and range for second graph (but showing it exactly as needed)
      // upd disabled let it always be fractional even then first graph is not seen
      // to avoid small 2nd graph scale on first graph is off (cause no fit to first graph is needed)
      const numDisplayRightStr = formatter(Math.max(numRealRight, 0), rightData.yRealStep, true /* , this.opts.state['e_0']*/ );

      if(baseData.needAnimation) {
        const oldFrom = dims.t + dims.h - pBottom - (numReal - baseData.y1) * baseData.yScaleEnd;
        const oldTo = dims.t + dims.h - pBottom - (this.items[i][numName] - baseData.y1) * baseData.yScaleEnd;
        const newFrom = dims.t + dims.h - pBottom - (numReal - state[y1Name]) * baseData.yScaleCur;
        const newTo = dims.t + dims.h - pBottom - (numReal - baseData.y1) * baseData.yScaleEnd;

        // if stays on the same pos - no animation
        if(Math.abs(oldTo - newTo) < 1) {
          this.items[i] = {
            numLeft: numRealLeft,
            strLeft: numDisplayLeftStr,
            numRight: numRealRight,
            strRight: numDisplayRightStr,
            y: newTo
          };
        } else {
          startedAtLeastOne = true;

          // hide previous one static
          this.uuid++;
          item = {
            animated: true,
            strLeft: this.items[i].strLeft,
            strRight: this.items[i].strRight,
            oProp: `oyt_${this.uuid}`,
            yProp: `yyt_${this.uuid}`,
            state: {
              id: `t_${this.uuid}`
            }
          };
          item.state[item.oProp] = 1;
          item.state[item.yProp] = oldFrom;
          this.items[item.state.id] = item;

          animator.add([{
            prop: item.oProp,
            state: item.state,
            end: 0,
            duration: this.noAnimation ? 0 : 200,
            tween: 'linear',
            group: {top: true}
          }, {
            prop: item.yProp,
            state: item.state,
            end: oldTo,
            duration: this.noAnimation ? 0 : (!this.forceUpdate ? 500 : 333),
            fixed: !this.forceUpdate,
            tween: !this.forceUpdate ? 'exp' : null,
            speed: 0.18,
            group: {top: true},
            cbEnd: this.deleteItem
          }]);

          delete this.items[i];

          // show new which one will became static after animation end
          this.uuid++;
          item = {
            animated: true,
            strLeft: numDisplayLeftStr,
            strRight: numDisplayRightStr,
            oProp: `oy_${i}`,
            yProp: `yy_${i}`,
            state: {
              id: i,
              numLeft: numRealLeft,
              strLeft: numDisplayLeftStr,
              numRight: numRealRight,
              strRight: numDisplayRightStr
            }
          }
          item.state[item.oProp] = 0;
          item.state[item.yProp] = newFrom;
          this.items[item.state.id] = item;

          const props: TChartAnimationProperty<typeof item['state']>[] = [{
            prop: item.oProp,
            state: item.state,
            end: 1,
            duration: this.noAnimation ? 0 : 200,
            tween: 'linear',
            group: {top: true}
          }, {
            prop: item.yProp,
            state: item.state,
            end: newTo,
            duration: this.noAnimation ? 0 : (!this.forceUpdate ? 500 : 333),
            fixed: !this.forceUpdate,
            tween: !this.forceUpdate ? 'exp' : null,
            speed: 0.18,
            group: {top: true},
            cbEnd: (state) => {
              this.items[state.id] = {
                numLeft: state.numLeft,
                strLeft: state.strLeft,
                numRight: state.numRight,
                strRight: state.strRight,
                y: state[`yy_${state.id as number}`]
              }

              clearTimeout(this.animationEndTimeout);
              this.animationEndTimeout = window.setTimeout(() => {
                this.animationInProgress = false;
              }, 30);
            }
          }];

          animator.add(props);
        }
      } else {
        if(this.items[i] && this.items[i].animated) {
          this.items[i].numLeft = numRealLeft;
          this.items[i].strLeft = numDisplayLeftStr;
          this.items[i].numRight = numRealRight;
          this.items[i].strRight = numDisplayRightStr;
          this.items[i].state.numLeft = numRealLeft;
          this.items[i].state.strLeft = numDisplayLeftStr;
          this.items[i].state.numRight = numRealRight;
          this.items[i].state.strRight = numDisplayRightStr;
        } else {
          this.items[i] = {
            numLeft: numRealLeft,
            strLeft: numDisplayLeftStr,
            numRight: numRealRight,
            strRight: numDisplayRightStr,
            y: dims.t + dims.h - pBottom - (numReal - baseData.y1) * baseData.yScaleEnd
          };
        }
      }
    }

    if(baseData.needAnimation && !startedAtLeastOne) {
      this.animationInProgress = false;
    }

    this.forceUpdate = false;
  }

  renderState(opacity: number) {
    const dpi = this.opts.settings.dpi;
    const dimsLeft = this.opts.state.dims.axisYLeft;
    const dimsRight = this.opts.state.dims.axisYRight;
    const dimsLines = this.opts.state.dims.axisYLines;
    const ys = this.opts.data.ys;

    this.ctx.font = `${this.opts.settings.FONT.normal} ${11 * dpi}px ${this.opts.settings.FONT.family}`;
    this.ctx.strokeStyle = this.opts.settings.COLORS.grid;
    this.ctx.lineWidth = 1 * dpi;
    this.ctx.lineCap = 'square';
    // @ts-ignore
    this.ctx.lineJoin = 'square';

    for(const i in this.items) {
      const item = this.items[i];

      let o: number, y: number;
      if(item.animated) {
        y = item.state[item.yProp];
        o = item.state[item.oProp];
      } else {
        y = item.y;
        o = 1;
      }

      if((y - 6) >= 0 && (y - 16) <= dimsLeft.h) {
        this.ctx.globalAlpha = o  * (this.opts.pairY ? this.opts.state['o_0'] : 1) * opacity;
        this.ctx.textAlign = 'left';

        if(this.opts.pairY) {
          this.ctx.fillStyle = this.isDarkMode ? ys[0].colors_n[1] : ys[0].colors_d[1];
        } else {
          this.ctx.fillStyle = this.opts.settings.COLORS.axis.y;
        }

        this.ctx.fillText(item.strLeft, dimsLeft.l * dpi, (y - 7) * dpi);

        if(this.opts.pairY) {
          this.ctx.globalAlpha = o * this.opts.state['o_1'] * opacity;
          this.ctx.textAlign = 'right';
          this.ctx.fillStyle = this.isDarkMode ? ys[1].colors_n[1] : ys[1].colors_d[1];

          this.ctx.fillText(item.strRight, (dimsRight.l + dimsRight.w) * dpi, (y - 7) * dpi);
        }
      }

      y = (y << 0) - 0.5;
      if(y >= 0 && y <= dimsLeft.h) {
        this.ctx.beginPath();
        this.ctx.globalAlpha = o * opacity;
        this.ctx.moveTo(dimsLines.l * dpi, (y) * dpi);
        this.ctx.lineTo((dimsLines.l + dimsLines.w) * dpi, (y) * dpi);
        this.ctx.stroke();
      }
    }

    this.ctx.globalAlpha = 1;
  }
}

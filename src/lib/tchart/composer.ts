import {drawRoundedRect, drawRoundedRect2} from './utils';
import {TChartAnimationProperty, TChartUnitOptions} from './types';

export default class TComposer {
  private opts: TChartUnitOptions;
  public $canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private deviceSpeed: number;
  private isDarkMode: boolean;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.$canvas = document.createElement('canvas');
    this.$canvas.className = 'tchart--graph-canvas';
    this.ctx = this.$canvas.getContext('2d')!;
    opts.$parent.appendChild(this.$canvas);
    this.deviceSpeed = undefined;
  }

  onResize() {
    const dpi = this.opts.settings.dpi;
    const dims = this.opts.state.dims.composer;
    this.$canvas.width = dims.w * dpi;
    this.$canvas.height = dims.h * dpi;
    this.render({top: true, bottom: true});
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
    // full reset canvas due to clearing areas optimizations
    this.onResize();
  }

  render(groups: TChartAnimationProperty['group']) {
    if(this.deviceSpeed === undefined) {
      const t1 = performance.now();
      const prevX = this.opts.state.x1;
      this.opts.state.x1 = this.opts.state.xMainMin;
      this.renderInner(groups);
      const t2 = performance.now();
      this.opts.state.x1 = prevX;
      this.deviceSpeed = (t2 - t1) / (this.opts.graphStyle === 'line' || this.opts.graphStyle === 'step' ? 1.5 : 2) / (this.opts.data.x.length * this.opts.data.ys.length);
      this.opts.state.deviceSpeed = this.deviceSpeed;
    }
    this.renderInner(groups);
  }

  renderInner(groups: TChartAnimationProperty['group']) {
    const dims = this.opts.state.dims;
    const state = this.opts.state;
    const ctx = this.ctx;
    const dpi = this.opts.settings.dpi;
    const settings = this.opts.settings;
    const padd = settings.PADD;
    const zoomMorph = state.zoomMorph === undefined ? 0 : state.zoomMorph;
    const pieChartAnimating = this.opts.graphStyle === 'area' && state.zoomMode && zoomMorph < 1;
    const pieChartAnimated = this.opts.graphStyle === 'area' && state.zoomMode && zoomMorph === 1;

    if(this.opts.data.master) {
      this.$canvas.style.opacity = '' + state.masterVisibility;
    }

    if(this.opts.data.slave) {
      this.$canvas.style.opacity = '' + state.slaveVisibility;
      this.opts.chart.$el.style.visibility = state.slaveVisibility > 0 ? 'visible' : 'hidden';
    }

    if(groups.top) {
      ctx.clearRect(dims.dates.l * dpi, dims.dates.t * dpi, dims.dates.w * dpi, dims.dates.h * dpi);

      if(this.opts.graphStyle === 'line' || this.opts.graphStyle === 'step' || (this.opts.graphStyle === 'area' && zoomMorph > 0) || (this.opts.data.slave && state.slaveVisibility < 1) || (this.opts.data.master && state.masterVisibility < 1)) {
        if(pieChartAnimated) {
          // for pie chart, need a little bit more region to clear, cause of outboard labels
          ctx.clearRect(dims.graph.l * dpi, (dims.graph.t - 18) * dpi, dims.graph.w * dpi, (dims.graph.h + 30) * dpi);
        } else {
          ctx.clearRect(dims.graph.l * dpi, dims.graph.t * dpi, dims.graph.w * dpi, dims.graph.h * dpi);
        }
      }

      // hack, clear only edges
      if((this.opts.graphStyle === 'area' && zoomMorph === 0) || (this.opts.graphStyle === 'bar')) {
        ctx.clearRect(dims.graph.l * dpi, dims.graph.t * dpi, dims.graph.w * dpi, (settings.PADD[0] + 4) * dpi);
        ctx.clearRect(dims.graph.l * dpi, (dims.graph.t + padd[0]) * dpi, padd[3] * dpi, (dims.graph.h - padd[0] - padd[2]) * dpi);
        ctx.clearRect(dims.graph.l * dpi, (dims.graph.t + dims.graph.h - padd[2]) * dpi, dims.graph.w * dpi, (padd[2]) * dpi);
        ctx.clearRect((dims.graph.l + dims.graph.w - padd[1] - 1) * dpi, (dims.graph.t + padd[0]) * dpi, (padd[1] + 1) * dpi, (dims.graph.h - padd[0] - padd[2]) * dpi);
      }

      if(!pieChartAnimating && !pieChartAnimated) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dims.graph.l * dpi, dims.graph.t * dpi, dims.graph.w * dpi, dims.graph.h * dpi);
        ctx.clip();
      }

      if(this.opts.data.master && state.masterVisibility < 1) {
        ctx.save();
        const scale = (1 - state.masterVisibility) * 5 + 1;
        ctx.translate(dims.graph.w * state.zoomSpecialOrigin * (1 - scale), 0);
        ctx.scale(scale, 1);
      }

      if(this.opts.data.slave && state.slaveVisibility < 1) {
        ctx.save();
        const scale = state.slaveVisibility;
        ctx.translate(dims.graph.w * state.zoomSpecialOrigin * (1 - scale), 0);
        ctx.scale(scale, 1);
      }

      let opacity = 1;
      if(this.opts.graphStyle === 'area' && state.zoomMode) {
        opacity = 1 - zoomMorph;
      }

      if(pieChartAnimating) {
        ctx.save();
        const r = settings.PIE_RADIUS;
        const cw = dims.graph.w + zoomMorph * (r * 2 - dims.graph.w);
        const ch = dims.graph.h - 42 + zoomMorph * (r * 2 - dims.graph.h + 42);

        drawRoundedRect2(
          ctx,
          dpi,
          cw,
          ch,
          (dims.graph.w - cw) / 2 + dims.graph.l,
          (dims.graph.h - 42 - ch) / 2 + dims.graph.t + 23,
          zoomMorph * r
        );

        ctx.clip();
      }

      this.opts.chart.graph.render();

      if(pieChartAnimating) {
        ctx.restore();
      }

      if(this.opts.data.master && state.masterVisibility < 1) {
        ctx.restore();
      }

      if(this.opts.data.slave && state.slaveVisibility < 1) {
        ctx.restore();
      }

      this.opts.chart.axisY.render(opacity);
      this.opts.chart.fade.render();

      if(!pieChartAnimating && !pieChartAnimated) {
        ctx.restore();
      }

      this.opts.chart.axisX.render(opacity);
    }

    if(groups.bottom) {
      ctx.clearRect((dims.graph.l) * dpi, (dims.handle.t - 1) * dpi, (dims.graph.w) * dpi, (dims.handle.h + 2) * dpi);

      let subchartShown = this.opts.data.subchart.show;
      const isNotSpecialAndChangedSubchart = !this.opts.data.master && !this.opts.data.slave && this.opts.data.details && this.opts.data.subchart.show !== this.opts.data.details.subchart.show;

      if(isNotSpecialAndChangedSubchart) {
        if(subchartShown) {
          subchartShown = zoomMorph < 1;
        } else {
          subchartShown = zoomMorph > 0;
        }
      }

      if(subchartShown) {
        ctx.save();
        drawRoundedRect(ctx, dpi, dims.mini.w, dims.mini.h, dims.mini.l, dims.mini.t, 7);
        ctx.clip();
        this.opts.chart.mini.render();
        ctx.restore();
        this.opts.chart.handle.render();
      }

      if(isNotSpecialAndChangedSubchart) {
        if(zoomMorph > 0 && zoomMorph < 1) {
          ctx.fillStyle = this.opts.settings.COLORS.background;
          ctx.globalAlpha = this.opts.data.subchart.show ? zoomMorph : 1 - zoomMorph;
          ctx.fillRect((dims.graph.l) * dpi, (dims.handle.t - 1) * dpi, (dims.graph.w) * dpi, (dims.handle.h + 2) * dpi);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}

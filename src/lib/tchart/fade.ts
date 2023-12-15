import {TChartUnitOptions} from './types';

export default class TFade {
  private opts: TChartUnitOptions;
  private ctx: CanvasRenderingContext2D;
  private $fadeTop: HTMLCanvasElement;
  private ctxFadeTop: CanvasRenderingContext2D;
  private $fadeBottom: HTMLCanvasElement;
  private ctxFadeBottom: CanvasRenderingContext2D;
  private isDarkMode: boolean;

  constructor(opts: TChartUnitOptions) {
    this.opts = opts;
    this.ctx = opts.ctx;

    if(this.opts.graphStyle !== 'area') {
      this.$fadeTop = document.createElement('canvas');
      this.ctxFadeTop = this.$fadeTop.getContext('2d');

      if(this.opts.graphStyle !== 'bar') {
        this.$fadeBottom = document.createElement('canvas');
        this.ctxFadeBottom = this.$fadeBottom.getContext('2d');
      }
    }
  }

  onResize() {
    const dpi = this.opts.settings.dpi;
    const dimsTop = this.opts.state.dims.fadeTop;
    const dimsBottom = this.opts.state.dims.fadeBottom;
    const backgroundRgbJoined = this.opts.settings.COLORS.backgroundRgb.join(', ');

    if(this.opts.graphStyle !== 'area') {
      const gradientTop = this.ctxFadeTop.createLinearGradient(0, 0, 0, dimsTop.h * dpi);
      gradientTop.addColorStop(0, `rgba(${backgroundRgbJoined}, 1)`);
      gradientTop.addColorStop(1, `rgba(${backgroundRgbJoined}, 0)`);
      this.$fadeTop.width = dimsTop.w * dpi;
      this.$fadeTop.height = dimsTop.h * dpi;
      this.ctxFadeTop.fillStyle = gradientTop;
      this.ctxFadeTop.fillRect(0, 0, dimsTop.w * dpi, dimsTop.h * dpi);

      if(this.opts.graphStyle !== 'bar') {
        const gradientBottom = this.ctxFadeBottom!.createLinearGradient(0, 0, 0, dimsBottom.h * dpi);
        gradientBottom.addColorStop(0, `rgba(${backgroundRgbJoined}, 0)`);
        gradientBottom.addColorStop(1, `rgba(${backgroundRgbJoined}, 1)`);
        this.$fadeBottom.width = dimsBottom.w * dpi;
        this.$fadeBottom.height = dimsBottom.h * dpi;
        this.ctxFadeBottom.fillStyle = gradientBottom;
        this.ctxFadeBottom.fillRect(0, 0, dimsBottom.w * dpi, dimsBottom.h * dpi);
      }
    }
  }

  setDarkMode(enabled: boolean) {
    this.isDarkMode = enabled;
    this.onResize();
  }

  render() {
    const dpi = this.opts.settings.dpi;
    const dimsTop = this.opts.state.dims.fadeTop;
    const dimsBottom = this.opts.state.dims.fadeBottom;

    this.$fadeTop && this.ctx.drawImage(this.$fadeTop, dimsTop.l * dpi, dimsTop.t * dpi);
    this.$fadeBottom && this.ctx.drawImage(this.$fadeBottom, dimsBottom.l * dpi, dimsBottom.t * dpi);
  }
}

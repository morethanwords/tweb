import customProperties from '../dom/customProperties';
import clamp from '../number/clamp';

export default class Shimmer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private font = '30pt Helvetica';
  private currTime = Date.now();
  private diffTime = 0;
  private spread = 0;
  private paused = false;
  private pausedTime = 0;
  private pauseInterval = 850;
  private lightSource = 0;
  private inc = 0.032;
  private lightSpread = 0.55;
  private animations = ['slide', 'slide', 'slide', 'slide'];
  private currentAnimationIndex = 0;
  private text: string;
  private fillStyle: CanvasRenderingContext2D['fillStyle'];

  public night: boolean;

  private keepTime() {
    this.diffTime = Date.now() - this.currTime;
    this.currTime = Date.now();
  }

  private cycleAnimation() {
    ++this.currentAnimationIndex;
    if(this.currentAnimationIndex >= this.animations.length) {
      this.currentAnimationIndex = 0;
    }
  }

  private animate() {
    const currentAnimation = this.animations[this.currentAnimationIndex];
    if(currentAnimation === 'glow') {
      return this.animateGlow(); // return glow style
    } else if(currentAnimation === 'slide') {
      return this.animateSlide(); // return slide gradient
    } else {
      console.log('unknown animation type: ' + String(currentAnimation));
    }
  }

  private animateGlow() {
    var glowEnd = 255,
      rgbStart = 68,
      r = rgbStart,
      g = r,
      b = r,
      increment = 10,
      interval = 800;

    return () => {
      var smartInc = increment * (this.diffTime / (1000 / 60));
      if(this.paused) {
        if((Date.now() - this.pausedTime) > interval) {
          r = rgbStart;
          this.cycleAnimation()
          this.paused = false;
        }
      } else {
        r = parseInt('' + (r + smartInc));
        if(r >= glowEnd) {
          this.paused = true;
          this.pausedTime = Date.now()
        }
      }
      return 'rgb('+ r + ',' + r + ',' + r + ')';
    };
  }

  private animateSlide(): CanvasGradient {
    var gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0),
      smartInc = this.inc * (this.diffTime / (1000 / 60)),
      lightLeft,
      lightRight,
      lightCenter;
    if(this.paused) {
      if((Date.now() - this.pausedTime) > this.pauseInterval) {
        this.lightSource = -0.6;
        this.cycleAnimation()
        this.paused = false;
        return this.animateSlide();
      }
    } else {
      this.lightSource += smartInc;
      if(this.lightSource > (1 + this.lightSpread)) {
        this.paused = true;
        this.pausedTime = Date.now();
      }
    }
    // lighting positions:
    lightCenter = clamp(this.lightSource, 0, 1);
    lightLeft = clamp(this.lightSource - this.lightSpread, 0, 1);
    lightRight = clamp(this.lightSource + this.lightSpread, 0, 1);

    const backgroundColor = customProperties.getProperty('background-color-true', this.night);
    const shimmerColor = customProperties.getProperty('surface-color', this.night);
    gradient.addColorStop(lightLeft, backgroundColor);
    gradient.addColorStop(lightCenter, shimmerColor);
    gradient.addColorStop(lightRight, backgroundColor);

    return gradient;
  }

  public settings(dict: Partial<{
    canvas: Shimmer['canvas'],
    fillStyle: Shimmer['fillStyle'],
    font: Shimmer['font'],
    lightSpread: Shimmer['lightSpread'],
    inc: Shimmer['inc'],
    animations: Shimmer['animations'],
    text: Shimmer['text']
  }> = {}) {
    this.canvas = dict.canvas ?? document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.font = dict.font ?? this.font;
    this.lightSpread = dict.lightSpread ?? this.lightSpread;
    this.inc = dict.inc ?? this.inc;
    this.animations = dict.animations ?? this.animations;
    this.text = dict.text ?? this.text;
    this.fillStyle = dict.fillStyle;

    this.canvas.classList.add('shimmer-canvas');
  }

  public on() {
    const {width, height} = this.canvas;
    // record the time we ran:
    this.keepTime();
    // clear and fill the canvas:
    this.ctx.clearRect(0, 0, width, height);

    if(this.font) {
      this.ctx.font = this.font;
    }

    this.ctx.fillStyle = this.animate() as any;
    this.ctx.fillRect(0, 0, width, height);

    if(this.fillStyle) {
      this.ctx.fillStyle = this.fillStyle;
      this.ctx.fillRect(0, 0, width, height);
    }

    if(this.text) {
      this.ctx.fillText(this.text, 50, 50);
    }
  }
}

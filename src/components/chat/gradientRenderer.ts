/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko, Artem Kolnogorov and unknown creator of the script taken from http://useless.altervista.org/gradient.html
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { animate } from "../../helpers/animation";
import { hexToRgb } from "../../helpers/color";

const WIDTH = 50;
const HEIGHT = WIDTH;

export default class ChatBackgroundGradientRenderer {
  private readonly _width = WIDTH;
  private readonly _height = HEIGHT;
  private _phase: number;
  private _tail: number;
  private readonly _tails = 90;
  private readonly _scrollTails = 50;
  private _frames: ImageData[];
  private _colors: {r: number, g: number, b: number}[];
  /* private readonly _curve = [ 
    0, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 
    1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1830, 1860, 1890, 1920, 
    1950, 1980, 2010, 2040, 2070, 2100, 2130, 2160, 2190, 2220, 2250, 2280, 2310, 
    2340, 2370, 2400, 2430, 2460, 2490, 2520, 2550, 2580, 2610, 2630, 2640, 2650, 
    2660, 2670, 2680, 2690, 2700
  ]; */
  private readonly _curve = [
    0 , 0.25 , 0.50 , 0.75 , 1 , 1.5 , 2 , 2.5 , 3 , 3.5 , 4 , 5 , 6 , 7 , 8 , 9 , 10 , 11 , 12 ,
    13 , 14 , 15 , 16 , 17 , 18 , 18.3 , 18.6 , 18.9 , 19.2 , 19.5 , 19.8 , 20.1 , 20.4 , 20.7 ,
    21.0 , 21.3 , 21.6 , 21.9 , 22.2 , 22.5 , 22.8 , 23.1 , 23.4 , 23.7 , 24.0 , 24.3 , 24.6 ,
    24.9 , 25.2 , 25.5 , 25.8 , 26.1 , 26.3 , 26.4 , 26.5 , 26.6 , 26.7 , 26.8 , 26.9 , 27 ,
  ];
  private readonly _incrementalCurve: number[];
  private readonly _positions = [
    { x: 0.80, y: 0.10 },
    { x: 0.60, y: 0.20 },
    { x: 0.35, y: 0.25 },
    { x: 0.25, y: 0.60 },
    { x: 0.20, y: 0.90 },
    { x: 0.40, y: 0.80 },
    { x: 0.65, y: 0.75 },
    { x: 0.75, y: 0.40 }
  ];
  private readonly _phases = this._positions.length;
  private _onWheelRAF: number;
  private _scrollDelta: number;

  // private _ts = 0;
  // private _fps = 15;
  // private _frametime = 1000 / this._fps;
  // private _raf: number;

  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _hc: HTMLCanvasElement;
  private _hctx: CanvasRenderingContext2D;

  private _addedScrollListener: boolean;
  private _animatingToNextPosition: boolean;

  constructor() {
    const diff = this._tails / this._curve[this._curve.length - 1];

    for(let i = 0, length = this._curve.length; i < length; ++i) {
      this._curve[i] = this._curve[i] * diff;
    }

    this._incrementalCurve = this._curve.map((v, i, arr) => {
      return v - (arr[i - 1] ?? 0);
    });
  }

  private hexToRgb(hex: string) {
    const result = hexToRgb(hex);
    return {r: result[0], g: result[1], b: result[2]};
  }

  private getPositions(shift: number) {
    const positions = this._positions.slice();
    while(shift > 0) {
      positions.push(positions.shift());
      --shift;
    }

    const result: typeof positions = [];
    for(let i = 0; i < positions.length; i += 2) {
      result.push(positions[i]);
    }
    return result;
  }

  private getNextPositions(phase: number, curveMax: number, curve: number[]) {
    const pos = this.getPositions(phase);
    if(!curve[0] && curve.length === 1) {
      return [pos];
    }
    
    const nextPos = this.getPositions(++phase % this._phases);
    const distances = nextPos.map((nextPos, idx) => {
      return {
        x: (nextPos.x - pos[idx].x) / curveMax,
        y: (nextPos.y - pos[idx].y) / curveMax,
      };
    });

    const positions = curve.map((value) => {
      return distances.map((distance, idx) => {
        return {
          x: pos[idx].x + distance.x * value,
          y: pos[idx].y + distance.y * value
        };
      });
    });

    return positions;
  }
 
  private curPosition(phase: number, tail: number) {
    const positions = this.getNextPositions(phase, this._tails, [tail]);
    return positions[0];
  }

  private changeTail(diff: number) {
    this._tail += diff;

    while(this._tail >= this._tails) {
      this._tail -= this._tails;
      if(++this._phase >= this._phases) {
        this._phase -= this._phases;
      }
    }

    while(this._tail < 0) {
      this._tail += this._tails;
      if(--this._phase < 0) {
        this._phase += this._phases;
      }
    }
  }
  
  private onWheel = (e: {deltaY: number}) => {
    if(this._animatingToNextPosition) {
      return;
    }

    this._scrollDelta += e.deltaY;
    if(this._onWheelRAF === undefined) {
      this._onWheelRAF = requestAnimationFrame(this.drawOnWheel);
    }
  };

  private drawOnWheel = () => {
    let diff = this._scrollDelta / this._scrollTails;
    this._scrollDelta %= this._scrollTails;
    diff = diff > 0 ? Math.floor(diff) : Math.ceil(diff);
    if(diff) {
      this.changeTail(diff);
      const curPos = this.curPosition(this._phase, this._tail);
      this.drawGradient(curPos);
    }
    this._onWheelRAF = undefined;
  };

  private drawNextPositionAnimated = () => {
    const frames = this._frames;
    const id = frames.shift();
    if(id) {
      this.drawImageData(id);
    }
    
    const leftLength = frames.length;
    if(!leftLength) {
      this._animatingToNextPosition = undefined;
    }

    return !!leftLength;
  };

  private getGradientImageData(positions: {x: number, y: number}[]) {
    const id = this._hctx.createImageData(this._width, this._height);
    const pixels = id.data;

    let offset = 0;
    for(let y = 0; y < this._height; ++y) {
      const directPixelY = y / this._height;
      const centerDistanceY = directPixelY - 0.5;
      const centerDistanceY2 = centerDistanceY * centerDistanceY;

      for(let x = 0; x < this._width; ++x) {
        const directPixelX = x / this._width;

        const centerDistanceX = directPixelX - 0.5;
        const centerDistance = Math.sqrt(centerDistanceX * centerDistanceX + centerDistanceY2);

        const swirlFactor = 0.35 * centerDistance;
        const theta = swirlFactor * swirlFactor * 0.8 * 8.0;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const pixelX = Math.max(0.0, Math.min(1.0, 0.5 + centerDistanceX * cosTheta - centerDistanceY * sinTheta));
        const pixelY = Math.max(0.0, Math.min(1.0, 0.5 + centerDistanceX * sinTheta + centerDistanceY * cosTheta));

        let distanceSum = 0.0;

        let r = 0.0;
        let g = 0.0;
        let b = 0.0;

        for(let i = 0; i < this._colors.length; i++) {
          const colorX = positions[i].x;
          const colorY = positions[i].y;

          const distanceX = pixelX - colorX;
          const distanceY = pixelY - colorY;

          let distance = Math.max(0.0, 0.9 - Math.sqrt(distanceX * distanceX + distanceY * distanceY));
          distance = distance * distance * distance * distance;
          distanceSum += distance;

          r += distance * this._colors[i].r / 255;
          g += distance * this._colors[i].g / 255;
          b += distance * this._colors[i].b / 255;
        }

        pixels[offset++] = r / distanceSum * 255.0;
        pixels[offset++] = g / distanceSum * 255.0;
        pixels[offset++] = b / distanceSum * 255.0;
        pixels[offset++] = 0xFF;
      }
    }
    return id;
  }

  private drawImageData(id: ImageData) {
    this._hctx.putImageData(id, 0, 0);
    this._ctx.drawImage(this._hc, 0, 0, this._width, this._height);
  }

  private drawGradient(positions: {x: number, y: number}[]) {
    this.drawImageData(this.getGradientImageData(positions));
  }

  // private doAnimate = () => {
  //   const now = +Date.now();
  //   if(!document.hasFocus() || (now - this._ts) < this._frametime) {
  //     this._raf = requestAnimationFrame(this.doAnimate);
  //     return;
  //   }

  //   this._ts = now;
  //   this.changeTail(1);
  //   const cur_pos = this.curPosition(this._phase, this._tail);
  //   this.drawGradient(cur_pos);
  //   this._raf = requestAnimationFrame(this.doAnimate);
  // };

  // public animate(start?: boolean) {
  //   if(!start) {
  //     cancelAnimationFrame(this._raf);
  //     return;
  //   }
  //   this.doAnimate();
  // }

  public init(el: HTMLCanvasElement) {
    this._frames = [];
    this._phase = 0;
    this._tail = 0;
    this._scrollDelta = 0;
    if(this._onWheelRAF !== undefined) {
      cancelAnimationFrame(this._onWheelRAF);
      this._onWheelRAF = undefined;
    }

    const colors = el.getAttribute('data-colors').split(',').reverse();
    this._colors = colors.map((color) => {
      return this.hexToRgb(color);
    });

    if(!this._hc) {
      this._hc = document.createElement('canvas');
      this._hc.width = this._width;
      this._hc.height = this._height;
      this._hctx = this._hc.getContext('2d', {alpha: false});
    }

    this._canvas = el;
    this._ctx = this._canvas.getContext('2d', {alpha: false});
    this.update();
  }

  public update() {
    if(this._colors.length < 2) {
      const color = this._colors[0];
      this._ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      this._ctx.fillRect(0, 0, this._width, this._height);
      return;
    }
    
    const pos = this.curPosition(this._phase, this._tail);
    this.drawGradient(pos);
  }

  public toNextPosition() {
    if(this._colors.length < 2) {
      return;
    }

    const tail = this._tail;
    const tails = this._tails;

    let nextPhaseOnIdx: number;

    const curve: number[] = [];
    for(let i = 0, length = this._incrementalCurve.length; i < length; ++i) {
      const inc = this._incrementalCurve[i];
      let value = (curve[i - 1] ?? tail) + inc;

      if(+value.toFixed(2) > tails && nextPhaseOnIdx === undefined) {
        nextPhaseOnIdx = i;
        value %= tails;
      }
      
      curve.push(value);
    }

    const currentPhaseCurve = curve.slice(0, nextPhaseOnIdx);
    const nextPhaseCurve = nextPhaseOnIdx !== undefined ? curve.slice(nextPhaseOnIdx) : [];

    [currentPhaseCurve, nextPhaseCurve].forEach((curve, idx, curves) => {
      const last = curve[curve.length - 1];
      if(last !== undefined && last > tails) {
        curve[curve.length - 1] = +last.toFixed(2);
      }
      
      this._tail = last ?? 0;

      if(!curve.length) {
        return;
      }

      const positions = this.getNextPositions(this._phase, tails, curve);
      if(idx !== (curves.length - 1)) {
        if(++this._phase >= this._phases) {
          this._phase -= this._phases;
        }
      }

      const ids = positions.map((pos) => {
        return this.getGradientImageData(pos);
      });
  
      this._frames.push(...ids);
    });

    this._animatingToNextPosition = true;
    animate(this.drawNextPositionAnimated);
  }

  public scrollAnimate(start?: boolean) {
    if(this._colors.length < 2 && start) {
      return;
    }

    if(start && !this._addedScrollListener) {
      document.addEventListener('wheel', this.onWheel);
      this._addedScrollListener = true;
    } else if(!start && this._addedScrollListener) {
      document.removeEventListener('wheel', this.onWheel);
      this._addedScrollListener = false;
    }
  }

  public cleanup() {
    this.scrollAnimate(false);
    // this.animate(false);
  }

  public static createCanvas(colors?: string) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    if(colors !== undefined) {
      canvas.dataset.colors = colors;
    }

    return canvas;
  }

  public static create(colors?: string) {
    const canvas = this.createCanvas(colors);
    const gradientRenderer = new ChatBackgroundGradientRenderer();
    gradientRenderer.init(canvas);

    return {gradientRenderer, canvas};
  }
}

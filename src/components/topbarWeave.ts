/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/evgeny-nadymov/telegram-react
 * Copyright (C) 2018 Evgeny Nadymov
 * https://github.com/evgeny-nadymov/telegram-react/blob/master/LICENSE
 */

import CALL_STATE from '../lib/calls/callState';
import GROUP_CALL_STATE from '../lib/calls/groupCallState';
import RTMP_STATE from '../lib/calls/rtmpState';
import LineBlobDrawable from './lineBlobDrawable';

type WeavingCallType = 'group' | 'call' | 'rtmp';
type WeavingCallState = GROUP_CALL_STATE | CALL_STATE | RTMP_STATE;

export class WeavingState {
  public shader: (ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number) => void;

  constructor(public type: WeavingCallType, public state: WeavingCallState) {
    this.createGradient();
  }

  private createGradient() {
    this.shader = (ctx, left, top, right, bottom) => {
      ctx.fillStyle = WeavingState.getGradientFromType(ctx, this.type, this.state, left, top, right, bottom);
    };
  }

  update(height: number, width: number, dt: number, amplitude: number) {
    // TODO: move gradient here
  }

  public static createStates(type: WeavingCallType, states: WeavingCallState[]) {
    return states.map((state) => [state, new WeavingState(type, state)] as const);
  }

  public static getGradientFromType(ctx: CanvasRenderingContext2D, type: WeavingCallType, state: WeavingCallState, x0: number, y0: number, x1: number, y1: number) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    type ColorStop = [offset: number, color: string];
    type ColorStops = ColorStop[];

    const MUTED_BY_ADMIN_STOPS: ColorStops = [[0, '#F05459'], [.4, '#766EE9'], [1, '#57A4FE']];
    const UNMUTED_STOPS: ColorStops = [[0, '#52CE5D'], [1, '#00B1C0']];
    const MUTED_STOPS: ColorStops = [[0, '#0976E3'], [1, '#2BCEFF']];
    const CONNECTING_STOPS: ColorStops = [[0, '#8599aa'], [1, '#8599aa']];
    const RTMP_STOPS: ColorStops = [[0, '#4588E3'], [.5, '#976FFF'], [1, '#E46ACE']];

    const map: {[key in WeavingCallType]?: [states: WeavingCallState[], stops: ColorStops][]} = {
      group: [
        [[GROUP_CALL_STATE.MUTED_BY_ADMIN], MUTED_BY_ADMIN_STOPS],
        [[GROUP_CALL_STATE.UNMUTED], UNMUTED_STOPS],
        [[GROUP_CALL_STATE.MUTED], MUTED_STOPS],
        [[GROUP_CALL_STATE.CONNECTING], CONNECTING_STOPS]
      ],
      rtmp: [
        [[RTMP_STATE.PLAYING], RTMP_STOPS],
        [[RTMP_STATE.BUFFERING, RTMP_STATE.CONNECTING], CONNECTING_STOPS]
      ]
    };

    const a = map[type];
    for(const [states, colors] of a) {
      if(states.includes(state)) {
        for(const [offset, color] of colors) {
          gradient.addColorStop(offset, color);
        }
        return gradient;
      }
    }
  }
}

export default class TopbarWeave {
  private focused: boolean;
  private resizing: boolean;
  private lastUpdateTime: number;
  private amplitude: number;
  private amplitude2: number;

  private allStates: Map<WeavingCallType, Map<WeavingCallState, WeavingState>>;
  private type: WeavingCallType;
  private previousState: WeavingState;
  private currentState: WeavingState;
  private progressToState: number;

  private scale: number;
  private left: number;
  private top: number;
  private right: number;
  private bottom: number;

  private mounted: boolean;
  private media: MediaQueryList;

  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;

  private resizeHandler: number;
  private raf: number;

  private lbd: LineBlobDrawable;
  private lbd1: LineBlobDrawable;
  private lbd2: LineBlobDrawable;

  private animateToAmplitude: number;
  private animateAmplitudeDiff: number;
  private animateAmplitudeDiff2: number;

  constructor() {
    this.focused = true;
    this.resizing = false;
    this.lastUpdateTime = Date.now();
    this.amplitude = 0.0;
    this.amplitude2 = 0.0;

    const s: [WeavingCallType, WeavingCallState[]][] = [
      ['group', [
        GROUP_CALL_STATE.UNMUTED,
        GROUP_CALL_STATE.MUTED,
        GROUP_CALL_STATE.MUTED_BY_ADMIN,
        GROUP_CALL_STATE.CONNECTING
      ]],
      ['rtmp', [
        RTMP_STATE.PLAYING,
        RTMP_STATE.BUFFERING,
        RTMP_STATE.CONNECTING
      ]]
    ];

    this.allStates = new Map(s.map(([type, states]) => [type, new Map(WeavingState.createStates(type, states))]));

    this.type = 'group';
    this.previousState = null;
    this.currentState = this.states.get(GROUP_CALL_STATE.CONNECTING);
    this.progressToState = 1.0;
  }

  private get states() {
    return this.allStates.get(this.type);
  }

  public componentDidMount() {
    if(this.mounted) {
      return;
    }

    this.mounted = true;
    // window.addEventListener('blur', this.handleBlur);
    // window.addEventListener('focus', this.handleFocus);
    window.addEventListener('resize', this.handleResize);
    this.media = window.matchMedia('screen and (min-resolution: 2dppx)');
    this.media.addEventListener('change', this.handleDevicePixelRatioChanged);

    this.setSize();
    this.forceUpdate();

    this.lbd = new LineBlobDrawable(3);
    this.lbd1 = new LineBlobDrawable(7);
    this.lbd2 = new LineBlobDrawable(8);
    this.setAmplitude(this.amplitude);

    this.draw();
  }

  public componentWillUnmount() {
    this.mounted = false;
    // window.removeEventListener('blur', this.handleBlur);
    // window.removeEventListener('focus', this.handleFocus);
    window.removeEventListener('resize', this.handleResize);
    this.media.removeEventListener('change', this.handleDevicePixelRatioChanged);

    const {canvas} = this;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private setSize() {
    this.scale = window.devicePixelRatio;
    this.top = 20 * this.scale;
    this.right = (this.mounted ? this.container.offsetWidth : 1261) * this.scale;
    this.bottom = (this.mounted ? this.container.offsetHeight : 68) * this.scale;
    this.left = 0 * this.scale;
    this.setCanvasSize();
  }

  private setCanvasSize() {
    this.canvas.width = this.right;
    this.canvas.height = this.bottom;
  }

  private handleDevicePixelRatioChanged = (e: Event) => {
    this.setSize();
    this.forceUpdate();
  }

  private handleResize = () => {
    if(this.resizeHandler) {
      clearTimeout(this.resizeHandler);
      this.resizeHandler = null;
    }

    this.resizing = true;
    this.resizeCanvas();
    this.resizeHandler = window.setTimeout(() => {
      this.resizing = false;
      this.invokeDraw();
    }, 250);
  }

  private resizeCanvas() {
    this.scale = window.devicePixelRatio;
    this.right = this.container.offsetWidth * this.scale;

    this.forceUpdate();
    this.invokeDraw();
  }

  public handleFocus = () => {
    this.focused = true;
    this.invokeDraw();
  }

  public handleBlur = () => {
    this.focused = false;
  }

  private invokeDraw = () => {
    if(this.raf) return;

    this.draw();
  }

  private draw = (force = false) => {
    this.raf = null;
    if(!this.mounted) {
      return;
    }
    const {lbd, lbd1, lbd2, scale, left, top, right, bottom, currentState, previousState, focused, resizing, canvas} = this;
    if(!focused && !resizing && this.progressToState >= 1.0) {
      return;
    }

    // console.log('[top] draw', [focused, resizing, this.mounted]);

    const newTime = Date.now();
    let dt = (newTime - this.lastUpdateTime);
    if(dt > 20) {
      dt = 17;
    }

    // console.log('draw start', this.amplitude, this.animateToAmplitude);
    if(this.animateToAmplitude !== this.amplitude) {
      this.amplitude += this.animateAmplitudeDiff * dt;
      if(this.animateAmplitudeDiff > 0) {
        if(this.amplitude > this.animateToAmplitude) {
          this.amplitude = this.animateToAmplitude;
        }
      } else {
        if(this.amplitude < this.animateToAmplitude) {
          this.amplitude = this.animateToAmplitude;
        }
      }
    }

    if(this.animateToAmplitude !== this.amplitude2) {
      this.amplitude2 += this.animateAmplitudeDiff2 * dt;
      if(this.animateAmplitudeDiff2 > 0) {
        if(this.amplitude2 > this.animateToAmplitude) {
          this.amplitude2 = this.animateToAmplitude;
        }
      } else {
        if(this.amplitude2 < this.animateToAmplitude) {
          this.amplitude2 = this.animateToAmplitude;
        }
      }
    }

    if(previousState) {
      this.progressToState += dt / 250;
      if(this.progressToState > 1) {
        this.progressToState = 1;
        this.previousState = null;
      }
    }

    const {amplitude, amplitude2, progressToState} = this;

    const top1 = 6 * amplitude2 * scale;
    const top2 = 6 * amplitude2 * scale;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    lbd.minRadius = 0;
    lbd.maxRadius = (2 + 2 * amplitude) * scale;
    lbd1.minRadius = 0;
    lbd1.maxRadius = (3 + 9 * amplitude) * scale;
    lbd2.minRadius = 0;
    lbd2.maxRadius = (3 + 9 * amplitude) * scale;

    lbd.update(amplitude, 0.3);
    lbd1.update(amplitude, 0.7);
    lbd2.update(amplitude, 0.7);

    for(let i = 0; i < 2; i++) {
      if(i === 0 && !previousState) {
        continue;
      }

      let alpha = 1;
      let state: WeavingState;
      if(i === 0) {
        alpha = 1 - progressToState;
        state = previousState;
        // previousState.setToPaint(paint);
      } else {
        alpha = previousState ? progressToState : 1;
        currentState.update(bottom - top, right - left, dt, amplitude);
        state = currentState;
        // currentState.setToPaint(paint);
      }

      const paint1 = (ctx: CanvasRenderingContext2D) => {
        ctx.globalAlpha = 0.3 * alpha;
        state.shader(ctx, left, top, right, bottom);
      };
      const paint = (ctx: CanvasRenderingContext2D) => {
        ctx.globalAlpha = i === 0 ? 1 : alpha;
        state.shader(ctx, left, top, right, bottom);
      };

      lbd1.draw(left, top - top1, right, bottom, canvas, paint1, top, 1.0);
      lbd2.draw(left, top - top2, right, bottom, canvas, paint1, top, 1.0);
      lbd.draw(left, top, right, bottom, canvas, paint, top, 1.0);
    }

    if(!force) {
      this.raf = requestAnimationFrame(() => this.draw());
    }
  };

  public setCurrentState = (type: WeavingCallType, state: WeavingCallState, animated: boolean) => {
    const {currentState} = this;

    if(currentState?.state === state && currentState.type === type) {
      return;
    }

    this.type = type;
    this.previousState = animated ? currentState : null;
    this.currentState = this.states.get(state);
    this.progressToState = this.previousState ? 0.0 : 1.0;
  };

  public setAmplitude(value: number) {
    const {amplitude} = this;
    this.animateToAmplitude = value;
    this.animateAmplitudeDiff = (value - amplitude) / 250;
    this.animateAmplitudeDiff2 = (value - amplitude) / 120;
  }

  private forceUpdate() {
    this.setCanvasSize();
  }

  public render(className: string) {
    const container = this.container = document.createElement('div');
    container.classList.add(className);

    const canvas = this.canvas = document.createElement('canvas');
    canvas.classList.add(className + '-canvas');

    container.append(canvas);

    return container;
  }
}

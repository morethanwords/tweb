/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * thanks https://github.com/dkaraush/particles for webgl version

import {IS_MOBILE} from '../environment/userAgent';
import {animate} from '../helpers/animation';
import callbackify from '../helpers/callbackify';
import callbackifyAll from '../helpers/callbackifyAll';
import {Middleware} from '../helpers/middleware';
import clamp from '../helpers/number/clamp';
import animationIntersector, {AnimationItemGroup, AnimationItemWrapper} from './animationIntersector';

// type DotRendererDot = {
//   x: number,
//   y: number,
//   opacity: number,
//   radius: number
//   mOpacity: number,
//   adding: boolean,
//   counter: number,
//   path: Path2D
// };
export default class DotRenderer implements AnimationItemWrapper {
  private static shaderTexts: {[url: string]: string | Promise<string>} = {};
  private static createdIndex = -1;

  public canvas: HTMLCanvasElement;
  private context: WebGL2RenderingContext;
  // private dots: DotRendererDot[];

  private reset = true;
  private buffer: WebGLBuffer[];
  private bufferParticlesCount: number;
  private program: WebGLProgram;
  private timeHandle: WebGLUniformLocation;
  private deltaTimeHandle: WebGLUniformLocation;
  private sizeHandle: WebGLUniformLocation;
  private resetHandle: WebGLUniformLocation;
  private radiusHandle: WebGLUniformLocation;
  private seedHandle: WebGLUniformLocation;
  private noiseScaleHandle: WebGLUniformLocation;
  private noiseSpeedHandle: WebGLUniformLocation;
  private dampingMultHandle: WebGLUniformLocation;
  private velocityMultHandle: WebGLUniformLocation;
  private forceMultHandle: WebGLUniformLocation;
  private longevityHandle: WebGLUniformLocation;
  private maxVelocityHandle: WebGLUniformLocation;
  private noiseMovementHandle: WebGLUniformLocation;
  private lastDrawTime: number;
  private time: number;
  private bufferIndex: number;
  private inited: boolean;

  private config: {
    particlesCount: number,
    radius: number,
    seed: number,
    noiseScale: number,
    noiseSpeed: number,
    forceMult: number,
    velocityMult: number,
    dampingMult: number,
    maxVelocity: number,
    longevity: number,
    noiseMovement: number,
    timeScale: number
  };

  public paused: boolean;
  public autoplay: boolean;
  public tempId: number;

  private dpr: number;
  private width: number;
  private height: number;
  private multiply: number;

  public loop: boolean = true;

  constructor() {
    const canvas = this.canvas = document.createElement('canvas');
    this.dpr = window.devicePixelRatio;
    canvas.classList.add('canvas-thumbnail', 'canvas-dots');

    this.paused = true;
    this.autoplay = true;
    this.tempId = 0;
    this.time = 0;
    this.bufferIndex = 0;
    // this.context = canvas.getContext('2d');
    this.context = canvas.getContext('webgl2');
  }

  public resize(width: number, height: number, multiply?: number) {
    this.width = width;
    this.height = height;
    this.multiply = multiply;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.config = {
      particlesCount: clamp(width * height / (500 * 500) * 1000 * (IS_MOBILE ? 5 : 10), 500, 10000),
      radius: this.dpr * 1.6,
      seed: Math.random() * 10,
      noiseScale: 6,
      noiseSpeed: .6,
      forceMult: .6,
      velocityMult: 1.,
      dampingMult: .9999,
      maxVelocity: 6.,
      longevity: 1.4,
      noiseMovement: 4,
      timeScale: .65
    };

    if(this.inited) {
      this.draw();
    }
  }

  private genBuffer() {
    if(this.buffer) {
      this.context.deleteBuffer(this.buffer[0]);
      this.context.deleteBuffer(this.buffer[1]);
    }

    this.buffer = [];
    for(let i = 0; i < 2; ++i) {
      this.buffer[i] = this.context.createBuffer();
      this.context.bindBuffer(this.context.ARRAY_BUFFER, this.buffer[i]);
      this.context.bufferData(this.context.ARRAY_BUFFER, (this.bufferParticlesCount = Math.ceil(this.config.particlesCount)) * 6 * 4, this.context.DYNAMIC_DRAW);
    }
  }

  private compileShader(type: number, path: string) {
    const shader = this.context.createShader(type);
    const shaderTextResult = DotRenderer.shaderTexts[path] ??=
      fetch(path)
      .then((response) => response.text())
      .then((text) => DotRenderer.shaderTexts[path] = text + '\n//' + Math.random());
    return callbackify(shaderTextResult, (shaderText) => {
      this.context.shaderSource(shader, shaderText);
      this.context.compileShader(shader);
      if(!this.context.getShaderParameter(shader, this.context.COMPILE_STATUS)) {
        throw 'compile shader error:\n' + this.context.getShaderInfoLog(shader);
      }
      return shader;
    });
  }

  public compileShaders() {
    return callbackifyAll([
      this.compileShader(this.context.VERTEX_SHADER, 'assets/img/spoiler_vertex.glsl'),
      this.compileShader(this.context.FRAGMENT_SHADER, 'assets/img/spoiler_fragment.glsl')
    ], (result) => result);
  }

  // private prepare() {
  //   let count = Math.round(this.width * this.height / (35 * (IS_MOBILE ? 2 : 1)));
  //   count *= this.multiply || 1;
  //   count = Math.min(!liteMode.isAvailable('chat_spoilers') ? 400 : IS_MOBILE ? 1000 : 2200, count);
  //   count = Math.round(count);
  //   const dots: DotRendererDot[] = this.dots = new Array(count);

  //   for(let i = 0; i < count; ++i) {
  //     dots[i] = this.generateDot();
  //   }
  // }

  // private generateDot(adding?: boolean): DotRendererDot {
  //   const x = Math.floor(Math.random() * this.canvas.width);
  //   const y = Math.floor(Math.random() * this.canvas.height);
  //   const opacity = adding ? 0 : Math.random();
  //   const radius = (Math.random() >= .8 ? 1 : 0.5) * this.dpr;
  //   const path = new Path2D();
  //   path.arc(x, y, radius, 0, 2 * Math.PI, false);
  //   return {
  //     x,
  //     y,
  //     opacity,
  //     radius,
  //     mOpacity: opacity,
  //     adding: adding ?? Math.random() >= .5,
  //     counter: 0,
  //     path
  //   };
  // }

  // private draw() {
  //   const {context, canvas, dots} = this;
  //   context.clearRect(0, 0, canvas.width, canvas.height);
  //   context.fillStyle = '#fff';

  //   const add = 0.02;
  //   for(let i = 0, length = dots.length; i < length; ++i) {
  //     const dot = dots[i];
  //     const addOpacity = dot.adding ? add : -add;

  //     dot.mOpacity += addOpacity;
  //     // if(dot.mOpacity <= 0) dot.mOpacity = dot.opacity;

  //     // const easedOpacity = easing(dot.mOpacity);
  //     const easedOpacity = clamp(dot.mOpacity, 0, 1);
  //     context.globalAlpha = easedOpacity;
  //     context.fill(dot.path);

  //     if(dot.mOpacity <= 0) {
  //       dot.adding = true;

  //       if(++dot.counter >= 1) {
  //         dots[i] = this.generateDot(dot.adding);
  //       }
  //     } else if(dot.mOpacity >= 1) {
  //       dot.adding = false;
  //     }
  //   }
  // }

  private draw() {
    if(!this.inited) {
      return;
    }

    const gl = this.context;
    const config = this.config;
    const now = Date.now();
    const dt = Math.min((now - this.lastDrawTime) / 1_000, 1) * config.timeScale;
    this.lastDrawTime = now;

    this.time += dt;

    if(this.bufferParticlesCount < config.particlesCount) {
      this.genBuffer();
      this.reset = true;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform1f(this.resetHandle, this.reset ? 1 : 0);
    if(this.reset) {
      this.time = 0
      this.reset = false;
    }
    gl.uniform1f(this.timeHandle, this.time);
    gl.uniform1f(this.deltaTimeHandle, dt);
    gl.uniform2f(this.sizeHandle, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.seedHandle, config.seed);
    gl.uniform1f(this.radiusHandle, config.radius);
    gl.uniform1f(this.noiseScaleHandle, config.noiseScale);
    gl.uniform1f(this.noiseSpeedHandle, config.noiseSpeed);
    gl.uniform1f(this.dampingMultHandle, config.dampingMult);
    gl.uniform1f(this.velocityMultHandle, config.velocityMult);
    gl.uniform1f(this.forceMultHandle, config.forceMult);
    gl.uniform1f(this.longevityHandle, config.longevity);
    gl.uniform1f(this.maxVelocityHandle, config.maxVelocity);
    gl.uniform1f(this.noiseMovementHandle, config.noiseMovement);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer[this.bufferIndex]);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
    gl.enableVertexAttribArray(3);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.buffer[1 - this.bufferIndex]);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20);
    gl.enableVertexAttribArray(3);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, config.particlesCount);
    gl.endTransformFeedback();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

    this.bufferIndex = 1 - this.bufferIndex;
  }

  public remove() {
    this.pause();
    this.destroy();
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;
    ++this.tempId;
  }

  // public renderFirstFrame() {
  //   if(!this.dots) {
  //     this.prepare();
  //   }

  //   this.draw();
  // }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;
    const tempId = ++this.tempId;
    this.lastDrawTime = Date.now();

    // if(!this.dots) {
    //   this.prepare();
    // }

    animate(() => {
      if(this.tempId !== tempId || this.paused) {
        return false;
      }

      this.draw();
      return true;
    });
  }

  public _init(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    this.genBuffer();

    const gl = this.context;

    const program = this.program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.transformFeedbackVaryings(program, ['outPosition', 'outVelocity', 'outTime', 'outDuration'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw 'program link error:\n' + gl.getProgramInfoLog(program);
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    this.timeHandle = gl.getUniformLocation(program, 'time');
    this.deltaTimeHandle = gl.getUniformLocation(program, 'deltaTime');
    this.sizeHandle = gl.getUniformLocation(program, 'size');
    this.resetHandle = gl.getUniformLocation(program, 'reset');
    this.radiusHandle = gl.getUniformLocation(program, 'r');
    this.seedHandle = gl.getUniformLocation(program, 'seed');
    this.noiseScaleHandle = gl.getUniformLocation(program, 'noiseScale');
    this.noiseSpeedHandle = gl.getUniformLocation(program, 'noiseSpeed');
    this.dampingMultHandle = gl.getUniformLocation(program, 'dampingMult');
    this.velocityMultHandle = gl.getUniformLocation(program, 'velocityMult');
    this.forceMultHandle = gl.getUniformLocation(program, 'forceMult');
    this.longevityHandle = gl.getUniformLocation(program, 'longevity');
    this.maxVelocityHandle = gl.getUniformLocation(program, 'maxVelocity');
    this.noiseMovementHandle = gl.getUniformLocation(program, 'noiseMovement');

    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.inited = true;
    this.lastDrawTime = Date.now();
  }

  public init() {
    return callbackify(this.compileShaders(), (shaders) => {
      this._init(...shaders);
      this.draw();
    });
  }

  public destroy() {
    if(this.buffer) {
      this.context.deleteBuffer(this.buffer[0]);
      this.context.deleteBuffer(this.buffer[1]);
    }

    this.buffer = null;
    this.context.deleteProgram(this.program);
    this.program = null;
  }

  public static create({
    width,
    height,
    middleware,
    animationGroup,
    multiply
  }: {
    width?: number,
    height?: number,
    middleware: Middleware,
    animationGroup: AnimationItemGroup,
    multiply?: number
  }) {
    const index = ++this.createdIndex;
    const dotRenderer = new DotRenderer();
    // dotRenderer.renderFirstFrame();

    const {canvas} = dotRenderer;
    const rotate = (index % 4) === 1;
    const flipX = (index % 4) === 2;
    const flipY = (index % 4) === 3;

    const transforms: string[] = [
      rotate && 'rotate(180deg)',
      flipX && 'scaleX(-1)',
      flipY && 'scaleY(-1)'
    ].filter(Boolean);
    if(transforms.length) {
      canvas.style.transform = transforms.join(' ');
    }

    animationIntersector.addAnimation({
      animation: dotRenderer,
      group: animationGroup,
      observeElement: dotRenderer.canvas,
      controlled: middleware,
      type: 'dots'
    });

    return {
      dotRenderer,
      readyResult: width && (dotRenderer.resize(width, height, multiply), dotRenderer.init())
    };
  }
}

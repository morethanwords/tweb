// * thanks https://github.com/dkaraush/particles for webgl version

import {IS_MOBILE} from '@environment/userAgent';
import callbackify from '@helpers/callbackify';
import callbackifyAll from '@helpers/callbackifyAll';
import clamp from '@helpers/number/clamp';

export type DotRendererConfig = {
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
  timeScale: number,
  color: number
};

export type DotRendererShaderURLs = {
  vertex: string,
  fragment: string
};

export function getDefaultParticlesCount(width: number, height: number) {
  return clamp(width * height / (500 * 500) * 1000 * (IS_MOBILE ? 5 : 10), 500, 10000);
}

export function buildDotRendererConfig(width: number, height: number, dpr: number, config: Partial<DotRendererConfig> = {}): DotRendererConfig {
  return {
    particlesCount: getDefaultParticlesCount(width, height),
    radius: dpr * 1.6,
    seed: Math.random() * 10,
    noiseScale: 6,
    noiseSpeed: .6,
    forceMult: .6,
    velocityMult: 1.,
    dampingMult: .9999,
    maxVelocity: 6.,
    longevity: 1.4,
    noiseMovement: 4,
    timeScale: .65,
    color: 0xffffff,
    ...config
  };
}

/**
 * The WebGL particles simulation, decoupled from the DOM — works both on the main
 * thread (HTMLCanvasElement) and inside a worker (OffscreenCanvas)
 */
export default class DotRendererCore {
  private static shaderTexts: {[url: string]: string | Promise<string>} = {};

  public canvas: HTMLCanvasElement | OffscreenCanvas;
  public inited: boolean;
  public lastDrawTime: number;
  public dpr: number;
  public config: DotRendererConfig;

  private context: WebGL2RenderingContext;
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
  private colorHandle: WebGLUniformLocation;
  private time: number;
  private bufferIndex: number;
  private initPromise: MaybePromise<boolean>;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, private shaderURLs: DotRendererShaderURLs) {
    this.canvas = canvas;
    this.time = 0;
    this.bufferIndex = 0;
    this.context = canvas.getContext('webgl2'/* , {preserveDrawingBuffer: true} */) as WebGL2RenderingContext;
  }

  public resize(width: number, height: number, dpr: number, config: DotRendererConfig) {
    this.dpr = dpr;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.config = config;

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

  private compileShader(type: number, url: string) {
    const shader = this.context.createShader(type);
    const shaderTextResult = DotRendererCore.shaderTexts[url] ??=
      fetch(url)
      .then((response) => response.text())
      .then((text) => DotRendererCore.shaderTexts[url] = text + '\n//' + Math.random());
    return callbackify(shaderTextResult, (shaderText) => {
      this.context.shaderSource(shader, shaderText);
      this.context.compileShader(shader);
      if(!this.context.getShaderParameter(shader, this.context.COMPILE_STATUS)) {
        throw 'compile shader error:\n' + this.context.getShaderInfoLog(shader);
      }
      return shader;
    });
  }

  private compileShaders() {
    return callbackifyAll([
      this.compileShader(this.context.VERTEX_SHADER, this.shaderURLs.vertex),
      this.compileShader(this.context.FRAGMENT_SHADER, this.shaderURLs.fragment)
    ], (result) => result);
  }

  public draw() {
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
      this.time = 0;
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
    gl.uniform3f(this.colorHandle,
      ((config.color >> 16) & 0xff) / 0xff,
      ((config.color >> 8) & 0xff) / 0xff,
      (config.color & 0xff) / 0xff
    );
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

  private _init(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
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
    this.colorHandle = gl.getUniformLocation(program, 'color');

    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.inited = true;
    this.lastDrawTime = Date.now();
  }

  public init() {
    return this.initPromise ??= callbackify(this.compileShaders(), (shaders) => {
      this._init(...shaders);
      return true;
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
}

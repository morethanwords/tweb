// One WebGL2 context draws every gem on the page — offscreen — and each gem's
// frame is copied into its own 2D canvas. The gem shader is heavy: this way it
// is compiled once, and a new gem (a flying one, one in a row) is only its
// state, with no frame hitch on compilation.
//
// GemView is one gem: canvas, style, motion, bursts. A port of
// LuxDiamondRenderer + LuxDiamondStyle.
//
// Usage — what a screen calls (see the amount screen of the design):
//
//   const gem = new GemView(canvas, {appearance: Appearance.blue, rotationSpeed: 2 * Math.PI / 26,
//     widthPoints: 32, lightBackground: true, starEmission: 0.28, burstSize: 0.25, starZoom: 0.55});
//     // Throws when WebGL2 is unavailable: catch it and show the flat (SVG) gem instead.
//   gem.setSize(220, pixelRatio());        // square canvas: side in CSS px, pixels per px
//   canvas.style.width = canvas.style.height = '220px';
//
//   // Every frame of the screen's loop (now = clock.now(), seconds):
//   gem.style.widthPoints = ...;           // style fields are live: widthPoints, rotationSpeed,
//   gem.render(now);                       // swayScale, starOpacity, backgroundStars, hideStone…
//
//   gem.kick(velocity, decay);             // a spin push per typed glyph / swap (rad/s, seconds)
//   gem.burst();                           // star burst (needs style.backgroundStars = true)
//   gem.beginDrag(t); gem.drag(dx, dy, t); gem.endDrag(velocityX, t, cancelled);  // finger
//   gem.resetClock();                      // the screen reopens: no dt jump on the next frame
//   gem.bursts = [];                       // drop the bursts in flight
//   other.adopt(gem);                      // hand the pose over to another gem (the flight)
//
//   // The amount seen through the grown gem: glyphs drawn into a canvas the size of the gem
//   // canvas, plus the gem's hull from gemHull(gemAssets().outline, gem.pose.yaw, gem.pose.pitch,
//   // gem.style.widthPoints / 2 * 0.96) shifted to the canvas centre:
//   gem.setText(glyphCanvas);
//   gem.setLens({hull, center: [110, 110], strength, spin: gem.pose.yaw, textScale: 1, textShift: 0, opacity: 0.55});
//   gem.setLens(null);
//
//   gem.destroy();                         // the shared context goes away with the last gem

import {
  gemAssets,
  projection,
  starProjection,
  rotation,
  cameraPoint,
  REFERENCE_PITCH,
  VERTEX_FLOATS,
  GemAssets
} from '@components/wallet/visual/gem/geometry';
import {GemMotion, lightState, sparkleState, mainPlacement} from '@components/wallet/visual/gem/animation';
import {
  DIAMOND_VERTEX,
  DIAMOND_FRAGMENT,
  SPARKLE_VERTEX,
  SPARKLE_FRAGMENT,
  LENS_VERTEX,
  LENS_FRAGMENT
} from '@components/wallet/visual/gem/shaders';
import {STAR_VERTEX, STAR_FRAGMENT, STEADY_STAR_COUNT, BURST_STAR_COUNT, BURST_LIFETIME} from '@components/wallet/visual/gem/stars';
import {mat4, Vec2, Vec4} from '@components/wallet/visual/math';
import {createProgram, uniformLocations, getWebGL2Context, loseContext, UniformMap} from '@components/wallet/visual/gl';

export const Appearance = {blue: 0, white: 1, cool: 2} as const;
export type Appearance = typeof Appearance[keyof typeof Appearance];

export interface GemStyle {
  appearance: Appearance,
  /** Own rotation, rad/s. */
  rotationSpeed: number,
  sparkles: boolean,
  refraction: number,
  brightness: number,
  /** Gem width in canvas points. */
  widthPoints: number,
  /** Growth under the finger. */
  dragGrow: number,
  growDamping: number,
  /** Inertia after a finger throw. */
  releaseDecay: number,
  swayScale: number,
  /** Tilt from outside. */
  tilt: number,
  /** Turn from outside. */
  lean: number,
  leanFrequency: number,
  leanDamping: number,
  /** Star bursts around. */
  backgroundStars: boolean,
  starOpacity: number,
  starZoom: number,
  starEmission: number,
  burstSize: number,
  /** The gem flew away — only the stars play out. */
  hideStone: boolean,
  lightBackground: boolean
}

export function defaultStyle(): GemStyle {
  return {
    appearance: Appearance.blue,
    rotationSpeed: 0,
    sparkles: true,
    refraction: 0.72,
    brightness: 1,
    widthPoints: 20,
    dragGrow: 1,
    growDamping: 0.42,
    releaseDecay: 0,
    swayScale: 1,
    tilt: 0,
    lean: 0,
    leanFrequency: 10.5,
    leanDamping: 0.55,
    backgroundStars: false,
    starOpacity: 1,
    starZoom: 1,
    starEmission: 1,
    burstSize: 1,
    hideStone: false,
    lightBackground: false
  };
}

export class GemPose {
  public yaw = 0;
  public pitch = REFERENCE_PITCH;
  public grow = 1;
  public time = 0;
}

export interface GemBurst {
  start: number,
  seed: number
}

/** The amount seen through the grown gem, in points of the gem canvas. */
export interface GemLens {
  hull: Vec2[],
  center: Vec2,
  strength: number,
  spin: number,
  /** The canvas has grown — the glyphs go back to their size. */
  textScale: number,
  /** The canvas moved right — the glyphs stay in place. */
  textShift: number,
  /** 0.65 when omitted. */
  opacity?: number
}

interface SparkleMesh {
  vao: WebGLVertexArrayObject,
  count: number
}

let stageInstance: GemStage = null;
let stageUsers = 0;

/** The shared context. Created with the first gem, released with the last one. */
function acquireGemStage(): GemStage {
  if(!stageInstance) stageInstance = new GemStage();
  ++stageUsers;
  return stageInstance;
}

function releaseGemStage() {
  if(--stageUsers > 0 || !stageInstance) return;
  stageUsers = 0;
  stageInstance.destroy();
  stageInstance = null;
}

class GemStage {
  public canvas: HTMLCanvasElement;
  public gl: WebGL2RenderingContext;
  private assets: GemAssets;
  private facetProjection: Vec4;
  private diamond: WebGLProgram;
  private sparkle: WebGLProgram;
  private lens: WebGLProgram;
  private star: WebGLProgram;
  private du: UniformMap;
  private su: UniformMap;
  private lu: UniformMap;
  private tu: UniformMap;
  private vertexCount: number;
  private stoneVAO: WebGLVertexArrayObject;
  private mainSparkle: SparkleMesh;
  private smallSparkle: SparkleMesh;
  private emptyVAO: WebGLVertexArrayObject;
  private planes: Float32Array;
  private anchorPositions: Float32Array;
  private anchorNormals: Float32Array;
  private hull: Float32Array;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const gl = getWebGL2Context(canvas, {alpha: true, premultipliedAlpha: true, antialias: true, depth: true,
      preserveDrawingBuffer: false, powerPreference: 'high-performance'});
    this.canvas = canvas;
    this.gl = gl;
    try {
      this.setup();
    } catch(error) {
      loseContext(gl);
      throw error;
    }
  }

  private setup() {
    const gl = this.gl;
    const assets = gemAssets();
    this.assets = assets;
    const reference = rotation(REFERENCE_PITCH, 0);
    let width = 0, top = -Infinity;
    const v = assets.vertices;
    for(let i = 0; i < v.length; i += VERTEX_FLOATS) {
      const p = cameraPoint(mat4.transformPoint(reference, [v[i], v[i + 1], v[i + 2]]));
      width = Math.max(width, Math.abs(p[0]));
      top = Math.max(top, p[1]);
    }
    this.facetProjection = [Math.cos(REFERENCE_PITCH), Math.sin(REFERENCE_PITCH), 223.95 / width, top];

    this.diamond = createProgram(gl, DIAMOND_VERTEX, DIAMOND_FRAGMENT);
    this.sparkle = createProgram(gl, SPARKLE_VERTEX, SPARKLE_FRAGMENT);
    this.lens = createProgram(gl, LENS_VERTEX, LENS_FRAGMENT);
    this.star = createProgram(gl, STAR_VERTEX, STAR_FRAGMENT);
    this.du = uniformLocations(gl, this.diamond);
    this.su = uniformLocations(gl, this.sparkle);
    this.lu = uniformLocations(gl, this.lens);
    this.tu = uniformLocations(gl, this.star);

    this.vertexCount = v.length / VERTEX_FLOATS;
    this.stoneVAO = gl.createVertexArray();
    gl.bindVertexArray(this.stoneVAO);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
    const sparkleVAO = (data: Float32Array): SparkleMesh => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
      return {vao, count: data.length / 5};
    };
    this.mainSparkle = sparkleVAO(assets.sparkles.main);
    this.smallSparkle = sparkleVAO(assets.sparkles.small);
    this.emptyVAO = gl.createVertexArray();
    gl.bindVertexArray(null);

    this.planes = new Float32Array(assets.planes.flat());
    this.anchorPositions = new Float32Array(assets.anchors.flatMap((a) => [...a.position, 1]));
    this.anchorNormals = new Float32Array(assets.anchors.flatMap((a) => [...a.normal, 0]));
    this.hull = new Float32Array(96);
  }

  public texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** Draw the gem into the shared context and copy it into its canvas. */
  public draw(view: GemView) {
    const gl = this.gl;
    const W = view.canvas.width, H = view.canvas.height;
    if(W < 1 || H < 1) return;
    // The shared canvas grows to the largest gem and stays that size.
    if(this.canvas.width < W || this.canvas.height < H) {
      this.canvas.width = Math.max(this.canvas.width, W);
      this.canvas.height = Math.max(this.canvas.height, H);
    }
    const CH = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const s = view.style, m = view.motion;
    const t = view.elapsed;
    const model = rotation(m.pitch, m.yaw + view.lean);
    const proj = projection(W / H, Math.min(2.4, Math.max(0.05, m.zoom * view.zoom() * view.grow)));
    const sparkle = sparkleState(t);
    const ahead = 1 / 120;
    const next = m.clone();
    next.step(ahead, s.rotationSpeed, t + ahead);
    const dy = Math.atan2(Math.sin(next.yaw - m.yaw), Math.cos(next.yaw - m.yaw));
    const main = mainPlacement(model, Math.hypot(dy, next.pitch - m.pitch) / ahead);
    const light = lightState(t);

    // The stars are behind the gem.
    if(s.backgroundStars && s.starOpacity > 0.001 && view.bursts.length) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.useProgram(this.star);
      const tu = this.tu;
      gl.uniformMatrix4fv(tu.u_projection, false, starProjection(W / H, Math.max(0.2, s.starZoom)));
      gl.uniform4f(tu.u_appearance, s.appearance, 0, 0, 0);
      gl.uniform4f(tu.u_tint, 0, Math.min(1, Math.max(0, s.starOpacity)), Math.max(0.05, s.starEmission), 0);
      gl.uniform1i(tu.u_baseInstance, STEADY_STAR_COUNT);
      gl.bindVertexArray(this.emptyVAO);
      const count = Math.max(1, Math.round(BURST_STAR_COUNT * Math.min(1, Math.max(0, s.burstSize))));
      for(const b of view.bursts) {
        const age = t - b.start;
        if(age < 0 || age >= BURST_LIFETIME) continue;
        gl.uniform4f(tu.u_animation, age, t, 1, s.lightBackground ? 1 : 0);
        gl.uniform4f(tu.u_layout, W, H, STEADY_STAR_COUNT, b.seed);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      }
      gl.depthMask(true);
    }

    const setCommon = (u: UniformMap) => {
      gl.uniformMatrix4fv(u.u_model, false, model);
      gl.uniformMatrix4fv(u.u_projection, false, proj);
      if(u.u_inverseModel) gl.uniformMatrix4fv(u.u_inverseModel, false, mat4.transpose(model));
      gl.uniform4f(u.u_parameters, t, s.refraction, s.brightness, s.sparkles ? 1 : 0);
      if(u.u_viewport) gl.uniform4f(u.u_viewport, W, H, 17, 0);
      if(u.u_sparkleShape) gl.uniform4fv(u.u_sparkleShape, sparkle.shape);
      if(u.u_sparkleHalo) gl.uniform4f(u.u_sparkleHalo, sparkle.haloScale, main.faceRotation, 1, main.visibility);
      if(u.u_appearance) gl.uniform4f(u.u_appearance, s.appearance, 0, 0, 0);
    };

    if(!s.hideStone) {
      gl.useProgram(this.diamond);
      const du = this.du;
      setCommon(du);
      gl.uniform4fv(du.u_crownGradient, light.crown);
      gl.uniform4fv(du.u_pavilionGradient, light.pavilion);
      gl.uniform4fv(du.u_lightSweep, light.sweep);
      gl.uniform4fv(du.u_facetProjection, this.facetProjection);
      gl.uniform4fv(du.u_crownSweep, light.crownSweep);
      gl.uniform4fv(du.u_rightCrownSweep, light.rightCrownSweep);
      gl.uniform4fv(du.u_leftCrownSweep, light.leftCrownSweep);
      gl.uniform4fv(du.u_pavilionSweep, light.pavilionSweep);
      gl.uniform4fv(du.u_rightPavilionSweep, light.rightPavilionSweep);
      gl.uniform4fv(du.u_leftPavilionSweep, light.leftPavilionSweep);
      gl.uniform4fv(du['u_planes[0]'], this.planes);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.bindVertexArray(this.stoneVAO);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

      if(s.sparkles) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.sparkle);
        const su = this.su;
        setCommon(su);
        gl.uniform4fv(su['u_anchorPosition[0]'], this.anchorPositions);
        gl.uniform4fv(su['u_anchorNormal[0]'], this.anchorNormals);
        gl.uniform1i(su.u_baseInstance, 0);
        gl.bindVertexArray(this.mainSparkle.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.mainSparkle.count);
        gl.uniform1i(su.u_baseInstance, 1);
        gl.bindVertexArray(this.smallSparkle.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.smallSparkle.count, 7);
      }

      // The amount through the grown gem.
      const lens = view.lensState;
      if(lens && view.textTexture && lens.hull.length > 2 && lens.strength > 0.002) {
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.useProgram(this.lens);
        const lu = this.lu;
        // The shader takes up to 48 points — a long silhouette is thinned evenly.
        const src = lens.hull, count = Math.min(48, src.length);
        this.hull.fill(0);
        for(let i = 0; i < count; i++) {
          const p = src[Math.floor(i * src.length / count)];
          this.hull[i * 2] = p[0];
          this.hull[i * 2 + 1] = p[1];
        }
        gl.uniform2fv(lu['u_hull[0]'], this.hull);
        gl.uniform1i(lu.u_count, count);
        gl.uniform2f(lu.u_center, lens.center[0], lens.center[1]);
        gl.uniform2f(lu.u_canvas, view.cssSize, view.cssSize);
        gl.uniform1f(lu.u_pixelRatio, W / view.cssSize);
        gl.uniform1f(lu.u_strength, Math.min(1, lens.strength));
        gl.uniform1f(lu.u_spin, lens.spin);
        gl.uniform1f(lu.u_textScale, lens.textScale);
        gl.uniform1f(lu.u_textShift, lens.textShift);
        gl.uniform1f(lu.u_opacity, (lens.opacity ?? 0.65) * Math.min(1, lens.strength));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, view.textTexture);
        gl.uniform1i(lu.u_text, 0);
        gl.bindVertexArray(this.emptyVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.bindVertexArray(null);

    // The frame goes into the gem's canvas: from the bottom-left corner of the shared one.
    const ctx = view.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.canvas, 0, CH - H, W, H, 0, 0, W, H);
  }

  public destroy() {
    loseContext(this.gl);
    this.gl = null;
    this.assets = null;
  }
}

/** One gem on the page. */
export class GemView {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public style: GemStyle;
  public motion: GemMotion;
  public pose: GemPose;
  public grow: number;
  public growVelocity: number;
  public lean: number;
  public leanVelocity: number;
  public elapsed: number;
  /** null until the first frame after a (re)start. */
  public lastTime: number;
  public cssSize: number;
  public bursts: GemBurst[];
  public nextSeed: number;
  public lensState: GemLens;
  public textTexture: WebGLTexture;
  /** Drag sensitivity in points; the canvas size when unset. */
  public dragScale: number;
  private stage: GemStage;
  private destroyed = false;
  private tapStreak = 0;
  private lastTapTime: number;

  /** Throws when WebGL2 is unavailable. */
  constructor(canvas: HTMLCanvasElement, style: Partial<GemStyle> = {}) {
    this.stage = acquireGemStage();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.style = {...defaultStyle(), ...style};
    this.motion = new GemMotion();
    this.pose = new GemPose();
    this.grow = 1;
    this.growVelocity = 0;
    this.lean = 0;
    this.leanVelocity = 0;
    this.elapsed = 0;
    this.lastTime = null;
    this.cssSize = 1;
    this.bursts = [];
    this.nextSeed = 1;
    this.lensState = null;
    this.textTexture = null;
  }

  /** The canvas is square: `size` — side in points, `pixelRatio` — pixels per point. */
  public setSize(size: number, pixelRatio: number) {
    this.cssSize = size;
    const px = Math.max(1, Math.round(size * pixelRatio));
    // Both sides are checked: a new canvas is 300×150, and the width may already match.
    if(this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  public zoom(): number {
    // The projection keeps the height; the canvas is square — the gem is exactly the given width.
    return this.style.widthPoints * 1.52 / Math.max(this.cssSize, 1);
  }

  /** The amount's glyphs on the gem canvas — for their copy seen through it. */
  public setText(source: TexImageSource) {
    if(this.destroyed) return;
    const gl = this.stage.gl;
    if(!this.textTexture) this.textTexture = this.stage.texture();
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  public setLens(lens: GemLens) {
    this.lensState = lens;
  }

  public get isDragging(): boolean {
    return this.motion.isDragging;
  }

  public beginDrag(time: number) {
    this.updateMotion(time);
    this.motion.begin(time);
  }

  public drag(dx: number, dy: number, time: number) {
    this.updateMotion(time);
    this.motion.drag(dx, dy, this.dragScale || this.cssSize, time);
  }

  /**
   * Released. A fast throw spins the gem up; a tap (`tapDirection`: −1 the left half, 1 the right one) spins it
   * towards the tapped side.
   */
  public endDrag(velocityX: number, time: number, cancelled = false, tapDirection?: number) {
    this.updateMotion(time);
    this.motion.step(0, this.style.rotationSpeed, this.elapsed);
    this.motion.end(time, cancelled);
    if(cancelled) return;
    if(tapDirection) {
      this.tapSpin(tapDirection, time);
    } else if(Math.abs(velocityX) > 600) {
      this.motion.fling(velocityX < 0 ? -1 : 1);
      this.burst();
    }
  }

  /**
   * A tap spins the gem (iOS InteractiveDiamondLayer.tapSpin): the way it already went, or towards the tapped
   * side; taps in a row speed it up, the fourth reaches the top speed with a burst of stars and a long fall-off.
   */
  public tapSpin(direction: number, time: number) {
    const current = this.motion.spinAtPress;
    const sign = Math.abs(current) > 0.5 ? Math.sign(current) : direction;
    const top = 16;
    this.tapStreak = this.lastTapTime !== undefined && time - this.lastTapTime < 1 ? this.tapStreak + 1 : 1;
    this.lastTapTime = time;
    const speed = Math.min(top, Math.max(Math.abs(current) + 5, top * this.tapStreak / 4));
    const reachedTop = speed >= top * 0.95;
    if(reachedTop) this.tapStreak = 0;
    this.motion.setSpin(sign * speed, reachedTop ? 2.5 : Math.max(this.style.releaseDecay, 0.05));
    if(reachedTop) this.burst();
  }

  /** A spin push: rad/s and the time it takes to fall off by e. Pushes add up. */
  public kick(velocity: number, decay = 0.7) {
    this.motion.spin(velocity, decay);
  }

  /** A new star burst. */
  public burst() {
    if(this.bursts.length >= 3) this.bursts.shift();
    this.bursts.push({start: this.elapsed, seed: this.nextSeed});
    this.nextSeed = (this.nextSeed + 1) % 65536;
  }

  /**
   * Take another gem's pose — with no jump of the facets. Its motion, springs
   * and sparkle clock too: the gem continues instead of starting over.
   */
  public adopt(other: GemView) {
    this.motion = other.motion.clone();
    this.elapsed = other.elapsed;
    this.lean = other.lean;
    this.leanVelocity = other.leanVelocity;
    this.lastTime = other.lastTime;
  }

  public resetClock() {
    this.lastTime = null;
  }

  public updateMotion(time: number) {
    const s = this.style;
    if(this.lastTime === null && this.elapsed === 0) {
      this.lean = s.lean;
      this.leanVelocity = 0;
    }
    const dt = this.lastTime === null ? 0 : Math.min(Math.max(0, time - this.lastTime), 0.05);
    this.lastTime = time;
    this.elapsed += dt;
    const m = this.motion;
    m.swayScale = s.swayScale;
    m.tilt = s.tilt;
    m.releaseDecay = s.releaseDecay;
    const growTarget = m.isDragging ? s.dragGrow : 1;
    let rest = dt;
    while(rest > 0) {
      const h = Math.min(rest, 1 / 240);
      this.growVelocity += ((growTarget - this.grow) * 196 - 2 * s.growDamping * 14 * this.growVelocity) * h;
      this.grow += this.growVelocity * h;
      const w = s.leanFrequency;
      if(w > 0) {
        this.leanVelocity += ((s.lean - this.lean) * w * w - 2 * s.leanDamping * w * this.leanVelocity) * h;
        this.lean += this.leanVelocity * h;
      } else {
        this.lean = s.lean;
        this.leanVelocity = 0;
      }
      rest -= h;
    }
    this.bursts = this.bursts.filter((b) => this.elapsed - b.start < BURST_LIFETIME);
    m.step(dt, s.rotationSpeed, this.elapsed);
    this.pose.yaw = m.yaw + this.lean;
    this.pose.pitch = m.pitch;
    this.pose.grow = this.grow;
    this.pose.time = this.elapsed;
  }

  public render(time: number) {
    if(this.destroyed) return;
    this.updateMotion(time);
    this.stage.draw(this);
  }

  /** Frees the gem's texture and its share of the common context. */
  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    if(this.textTexture) this.stage.gl.deleteTexture(this.textTexture);
    this.textTexture = null;
    this.lensState = null;
    this.bursts = [];
    this.stage = null;
    releaseGemStage();
  }
}

// The card background in WebGL2. The layer itself is not tilted: the shader
// draws the card straight from its projected corners, with the perspective
// divide — the highlight and the brushing lie on it as on a real surface.
// Between the face and the back there is a stack of slices: they make up the
// edge seen under a tilt.
//
// The face is the gradient from the Figma design (conic #3390EC ↔ #49A4FF with
// stars in soft light), only its highlight is alive: it turns with the tilt,
// like the studio reflection of the iOS card.

import {createProgram, uniformLocations, getWebGL2Context, loseContext, UniformMap} from '@components/wallet/visual/gl';
import {starsCanvas, noiseData, qrCanvas} from '@components/wallet/visual/card/textures';
import {DESIGN} from '@components/wallet/visual/card/layout';
import {Vec2, Vec4} from '@components/wallet/visual/math';

const VERTEX = /* glsl */`#version 300 es
precision highp float;
uniform vec4 u_front[4];   // face corners: bottom-left, bottom-right, top-left, top-right
uniform vec4 u_back[4];
uniform int u_slices;
uniform vec4 u_aa;         // layer pixels, card pixels
out vec2 v_uv;
out float v_layer;
void main() {
  int slices = max(u_slices, 0);
  bool face = gl_InstanceID >= slices;
  float depth = face ? 1.0 : float(gl_InstanceID) / float(max(slices - 1, 1));
  int id = gl_VertexID;
  vec4 p = mix(u_back[id], u_front[id], depth);
  vec2 uvs[4] = vec2[4](vec2(0, 1), vec2(1, 1), vec2(0, 0), vec2(1, 0));
  vec2 dirs[4] = vec2[4](vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1));
  // A quad slightly wider than the card — the shader antialiases the edge itself.
  const float inset = 2.0;
  vec2 ndc = p.xy / p.w + dirs[id] * inset * 2.0 / max(u_aa.xy, vec2(1));
  gl_Position = vec4(ndc * p.w, 0, p.w);
  v_uv = uvs[id] + vec2(dirs[id].x, -dirs[id].y) * inset / max(u_aa.zw, vec2(1));
  v_layer = face ? 2.0 : depth;
}`;

const FRAGMENT = /* glsl */`#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_highlightTilt;  // nod, turn — with the gyroscope and the idle sway
uniform vec2 u_surfaceTilt;    // nod, turn — without the idle sway
uniform vec2 u_size;           // the card in design points
uniform sampler2D u_stars;
uniform sampler2D u_noise;
uniform sampler2D u_qr;
uniform vec2 u_lensCenter;
uniform float u_lensStrength;
uniform float u_lensSpin;
uniform int u_lensCount;
uniform vec2 u_chip;       // the QR chip's alpha and blur: it fades with the card's details as the card folds
uniform float u_chipX;     // the chip's left edge: at the inline end, mirrored right to left with the card's text
uniform vec2 u_hull[48];
in vec2 v_uv;
in float v_layer;
out vec4 fragColor;

#define PI 3.14159265358979
const float RADIUS = 20.0;

float roundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - (halfSize - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec2 roundRectNormal(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - (halfSize - r);
  vec2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1, 0) : vec2(0, 1));
  return n * vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
}
float hash(float v) { return fract(sin(v * 127.1) * 43758.5453); }
vec3 linearToSrgb(vec3 v) {
  v = max(v, vec3(0));
  return mix(1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, v * 12.92, lessThanEqual(v, vec3(0.0031308)));
}

// The lens of the grown gem: inside its silhouette the metal is magnified and broken
// into facets that run with the gem's rotation. Maps a card point.
vec2 lensPoint(vec2 position) {
  int n = u_lensCount;
  if (n < 3 || u_lensStrength <= 0.001) return position;
  bool inside = false;
  float best = 1e9;
  float radius = 0.0;
  for (int i = 0, j = n - 1; i < 48; j = i++) {
    if (i >= n) break;
    vec2 a = u_hull[i], b = u_hull[j];
    if (((a.y > position.y) != (b.y > position.y)) &&
        (position.x < (b.x - a.x) * (position.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    vec2 e = b - a;
    float h = clamp(dot(position - a, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
    best = min(best, distance(position, a + e * h));
    radius = max(radius, distance(a, u_lensCenter));
  }
  if (!inside) return position;
  float edge = smoothstep(0.0, 4.0, best) * u_lensStrength;
  vec2 d = position - u_lensCenter;
  vec2 q = d / max(radius, 1.0);
  float u = (asin(clamp(q.x, -0.999, 0.999)) - u_lensSpin) / (PI / 4.0);
  float wave = sin(PI * u);
  float prism = sign(wave) * pow(abs(wave), 0.6);
  float crown = 1.0 - smoothstep(-0.25, 0.05, q.y);
  vec2 bend = vec2(prism * 0.12, mix(-0.08 * q.y, 0.09, crown)) * radius;
  float zoom = mix(0.84, 0.72, crown * (1.0 - smoothstep(0.2, 0.6, abs(q.x))));
  return u_lensCenter + d * mix(1.0, zoom, edge) + bend * edge;
}

// The conic gradient from the design: «from 90deg», transitions every quarter,
// with its own skew (matrix 6.95 -11.05 18.111 11.391). 0 — shade, 1 — highlight.
float lobe(vec2 p, float turn) {
  vec2 d = p - u_size * 0.5;
  float c = cos(turn), s = sin(turn);
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  mat2 m = inverse(mat2(6.95, -11.05, 18.111, 11.391));
  vec2 local = m * d;
  float t = atan(local.y, local.x) / (2.0 * PI);
  float f = 1.0 - abs(fract(2.0 * t) * 2.0 - 1.0);
  // In the middle the conic gradient converges to a point; in the design the
  // background blur smears it.
  return mix(0.5, f, smoothstep(0.0, 22.0, length(d)));
}

vec3 softLightWhite(vec3 b) {
  return mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, lessThanEqual(b, vec3(0.25)));
}

void main() {
  vec2 size = u_size;
  vec2 halfSize = size * 0.5;
  vec2 surface = clamp(vec2(u_surfaceTilt.y / 0.30, u_surfaceTilt.x / 0.20), vec2(-1), vec2(1));

  // The edge. A slice is filled whole, but only the ring outside the face shows —
  // the middle is not shaded at all.
  if (v_layer < 1.5) {
    float t = v_layer;
    vec2 p = v_uv * size - halfSize;
    float d = roundRect(p, halfSize, RADIUS);
    if (d < -9.0) discard;
    float aa = max(0.5 * fwidth(d), 0.001);
    float cover = 1.0 - smoothstep(-aa, aa, d);
    vec2 n = roundRectNormal(p, halfSize, RADIUS);
    // Light from above and slightly left: the top edge is lighter than the bottom.
    float diffuse = 0.5 + 0.5 * dot(n, normalize(vec2(-0.35, -1.0)));
    // The rim is a flat cut of blue metal, darker than the face.
    float lines = 1.0 + (hash(floor(t * 9.0) + 3.1) - 0.5) * 0.05;
    vec3 edge = vec3(0.016, 0.11, 0.46) * (0.62 + 0.62 * diffuse) * lines;
    vec2 along = vec2(-n.y, n.x);
    float run = dot(p, along) / max(halfSize.x, 1.0);
    float streak = exp(-pow((run - (surface.x * 0.9 - surface.y * 0.7)) / 0.38, 2.0));
    edge += vec3(0.30, 0.62, 1.0) * streak * 0.18 * (0.35 + 0.65 * diffuse);
    edge += vec3(0.30, 0.62, 1.0) * step(0.88, t) * (0.18 + 0.40 * diffuse);
    vec3 color = linearToSrgb(edge);
    fragColor = vec4(color * cover, cover);
    return;
  }

  // The card's edge follows the real point, the material — the point through the lens.
  vec2 edgePoint = v_uv * size;
  vec2 P = lensPoint(edgePoint);
  vec2 uv = P / size;

  // The highlight turns with the tilt — like the key light of the iOS card.
  vec2 nt = clamp(vec2(u_highlightTilt.y / 0.24, u_highlightTilt.x / 0.17), vec2(-1), vec2(1));
  float turn = -(nt.x * size.y / size.x + nt.y) * PI * 0.5;
  float f = lobe(P, turn);
  vec3 color = mix(vec3(51, 144, 236) / 255.0, vec3(73, 164, 255) / 255.0, f);

  // Brushed metal: thin rings from the centre and fibres — barely visible.
  vec2 cardPosition = vec2((uv.x - 0.5) * 2.0, (0.5 - uv.y) * 2.0 * size.y / size.x);
  float radius = length(cardPosition);
  float ringIndex = floor(radius * 117.0);
  float footprint = length(vec2(dFdx(radius), dFdy(radius))) * 0.65;
  float ringFilter = 1.0 - smoothstep(0.35, 1.10, footprint * 180.0);
  float waveFilter = 1.0 - smoothstep(1.15, 3.10, footprint * 560.0);
  float fine = mix(0.5, hash(ringIndex), ringFilter) + 0.35 * sin(radius * 364.0 + hash(ringIndex * 0.37) * 6.2831853) * waveFilter;
  float radialFinish = (fine - 0.5) * 0.05 * smoothstep(0.018, 0.090, radius);
  float brushed = texture(u_noise, uv * vec2(1.4, 8.0)).r;
  float medium = texture(u_noise, uv * vec2(4.0, 3.0)).r;
  float grain = texture(u_noise, uv * vec2(19.0, 13.0)).r;
  float variation = radialFinish * 0.22 * (0.6 + 0.8 * f) + (brushed - 0.5) * 0.020 + (medium - 0.5) * 0.020 + (grain - 0.5) * 0.010;
  color *= 1.0 + variation;

  // Stars — white in soft light, only inside the highlight, and slightly deeper than the face.
  vec2 parallax = vec2(clamp(u_surfaceTilt.y / 0.24, -1.0, 1.0), -clamp(u_surfaceTilt.x / 0.17, -1.0, 1.0)) * 4.0 / size;
  vec4 star = texture(u_stars, uv + parallax);
  float twinkle = 0.75 + 0.25 * sin(u_time * 1.7 + star.g * 6.2831853);
  float starAlpha = 0.5 * star.a * lobe(P + parallax * size, turn) * twinkle;
  color = mix(color, softLightWhite(color), starAlpha);

  vec2 pc = edgePoint - halfSize;
  float d = roundRect(pc, halfSize, RADIUS);
  // Inner shadow at the bottom: inset 0 -1px 1px rgba(0,0,0,.14).
  float lower = smoothstep(-1.0, 1.0, roundRect(pc + vec2(0, 1), halfSize, RADIUS));
  color *= 1.0 - 0.14 * lower;
  // The face's rim catches light — only while the card is being tilted.
  {
    float band = smoothstep(-1.1, -0.35, d);
    vec2 n = roundRectNormal(pc, halfSize, RADIUS);
    vec2 light = normalize(vec2(-0.45 - 0.9 * surface.x, -0.9 + 0.7 * surface.y));
    float lit = max(dot(n, light), 0.0);
    color += vec3(0.22, 0.42, 0.70) * band * lit * 0.35 * clamp(length(surface) * 1.6, 0.0, 1.0);
  }

  // The QR chip — as in the design: light 48×36 metal in a thin dark border.
  // Its gradient and glint follow the tilt.
  {
    vec2 origin = vec2(u_chipX - 1.0, 73);     // chip canvas 50×38
    vec2 center = vec2(u_chipX + 24.0, 92);
    const vec2 chipHalf = vec2(24, 18);
    vec2 local = P - center;
    float cd = roundRect(local, chipHalf, 8.0);
    float aa = max(0.6 * fwidth(cd), 0.001) + u_chip.y;
    float ring = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, cd)) * smoothstep(-aa, aa, cd);
    color = mix(color, vec3(0), 0.16 * ring * u_chip.x);
    if (cd < 1.0 + u_chip.y && u_chip.x > 0.0) {
      vec2 s = P - origin;
      vec2 a = vec2(5.2, 3.4), b = vec2(45.4, 34.0);
      float g = dot(s - a, b - a) / dot(b - a, b - a);
      g += -0.45 * surface.x + 0.35 * surface.y;
      vec3 metal = mix(vec3(253, 254, 255) / 255.0, vec3(187, 189, 192) / 255.0, clamp(g, 0.0, 1.0));
      vec3 chip = mix(color, metal, 0.88);
      // Conic glint: light on the left, shade on the right.
      vec2 l = s - vec2(25, 19);
      float t = fract(atan(-l.x / 0.024, l.y / 0.018) / (2.0 * PI) + 0.10 * surface.x - 0.06 * surface.y);
      float white = t < 0.06 ? 0.0 : (t < 0.25 ? (t - 0.06) / 0.19 : (t < 0.44 ? (0.44 - t) / 0.19 : 0.0));
      float black = t < 0.56 ? 0.0 : (t < 0.75 ? (t - 0.56) / 0.19 : (t < 0.94 ? (0.94 - t) / 0.19 : 0.0));
      chip = mix(chip, vec3(1), white * 0.36);
      chip = mix(chip, vec3(0), black * 0.12);
      // A sharp glint — while the card is being tilted.
      vec2 q = local / chipHalf;
      float across = dot(q, normalize(vec2(1.0, -0.45)));
      float slide = 0.10 + 0.95 * surface.x - 0.55 * surface.y;
      float sharp = exp(-pow((across - slide) / 0.12, 2.0));
      float soft = exp(-pow((across - slide) / 0.5, 2.0));
      float amount = clamp(length(surface) * 1.4, 0.0, 1.0);
      chip = mix(chip, vec3(1), (sharp * 0.30 + soft * 0.10) * amount);
      // The icon is pressed in: a light imprint one point lower, the icon itself on top.
      vec2 qrUV = s / vec2(50, 38);
      float ink = texture(u_qr, qrUV).a;
      float lip = texture(u_qr, qrUV - vec2(0, 1.0 / 38.0)).a;
      chip = mix(chip, vec3(1), 0.5 * lip * (1.0 - ink));
      chip = mix(chip, vec3(26) / 255.0, 0.5 * ink);
      float cover = (1.0 - smoothstep(-aa, aa, cd)) * u_chip.x;
      color = mix(color, chip, cover);
    }
  }

  float aa = max(0.5 * fwidth(d), 0.001);
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  fragColor = vec4(clamp(color, 0.0, 1.0) * coverage, coverage);
}`;

/** The lens under the grown gem, in card design units. */
export interface CardLens {
  center: Vec2,
  hull: Vec2[],
  strength: number,
  spin: number
}

/** The face and the back of the card in clip space: bottom-left, bottom-right, top-left, top-right. */
export interface CardSlab {
  front: Vec4[],
  back: Vec4[]
}

export interface CardBackgroundFrame {
  time: number,
  /** Nod, turn — with the gyroscope and the idle sway. */
  highlightTilt: Vec2,
  /** Nod, turn — without the idle sway. */
  surfaceTilt: Vec2,
  slab: CardSlab,
  lens: CardLens,
  /** the QR chip's alpha and blur (design points); fully there when not given */
  chip?: Vec2,
  /** the QR chip's left edge, design points (layout.ts cardChipX) */
  chipX: number
}

export class CardBackground {
  public static padding = 56;
  public static maxSlices = 24;

  public canvas: HTMLCanvasElement;
  public gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private u: UniformMap;
  private vao: WebGLVertexArrayObject;
  private stars: WebGLTexture;
  private noise: WebGLTexture;
  private qr: WebGLTexture;
  private hull: Float32Array;
  private cardWidth: number;
  private cardHeight: number;
  private pixelRatio: number;

  /** Throws when WebGL2 is unavailable. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = getWebGL2Context(canvas, {alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
      powerPreference: 'high-performance'});
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
    this.program = createProgram(gl, VERTEX, FRAGMENT);
    this.u = uniformLocations(gl, this.program);
    this.vao = gl.createVertexArray();

    const texture = (unit: number, upload: () => void, wrap: number) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      upload();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.stars = texture(0, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, starsCanvas()), gl.CLAMP_TO_EDGE);
    const noise = noiseData();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.noise = texture(1, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, noise.size, noise.size, 0, gl.RED, gl.UNSIGNED_BYTE, noise.data), gl.REPEAT);
    this.qr = texture(2, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, qrCanvas()), gl.CLAMP_TO_EDGE);
    this.hull = new Float32Array(96);
  }

  /** A card of `width`×`height` screen points; the layer is wider by the padding. */
  public setSize(width: number, height: number, pixelRatio: number) {
    const pad = CardBackground.padding;
    this.cardWidth = width;
    this.cardHeight = height;
    this.pixelRatio = pixelRatio;
    const w = Math.round((width + pad * 2) * pixelRatio), h = Math.round((height + pad * 2) * pixelRatio);
    if(this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * How many slices make the edge solid: one per pixel of the largest shift of
   * the back from the face.
   */
  public slices(slab: CardSlab): number {
    let shift = 0;
    for(let i = 0; i < 4; i++) {
      const a = slab.front[i], b = slab.back[i];
      const dx = (a[0] / a[3] - b[0] / b[3]) * 0.5 * this.canvas.width;
      const dy = (a[1] / a[3] - b[1] / b[3]) * 0.5 * this.canvas.height;
      shift = Math.max(shift, Math.hypot(dx, dy));
    }
    if(shift <= 0.35) return 0;
    return Math.min(CardBackground.maxSlices, Math.ceil(shift) + 1);
  }

  public render({time, highlightTilt, surfaceTilt, slab, lens, chip, chipX}: CardBackgroundFrame) {
    const gl = this.gl, u = this.u;
    if(!gl) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const slices = this.slices(slab);
    gl.uniform4fv(u['u_front[0]'], slab.front.flat());
    gl.uniform4fv(u['u_back[0]'], slab.back.flat());
    gl.uniform1i(u.u_slices, slices);
    gl.uniform4f(u.u_aa, this.canvas.width, this.canvas.height,
      this.cardWidth * this.pixelRatio, this.cardHeight * this.pixelRatio);
    gl.uniform1f(u.u_time, time);
    gl.uniform2f(u.u_highlightTilt, highlightTilt[0], highlightTilt[1]);
    gl.uniform2f(u.u_surfaceTilt, surfaceTilt[0], surfaceTilt[1]);
    gl.uniform2f(u.u_size, DESIGN.width, DESIGN.height);
    gl.uniform2f(u.u_chip, chip ? chip[0] : 1, chip ? chip[1] : 0);
    gl.uniform1f(u.u_chipX, chipX);
    gl.uniform1i(u.u_stars, 0);
    gl.uniform1i(u.u_noise, 1);
    gl.uniform1i(u.u_qr, 2);
    if(lens && lens.hull.length > 2 && lens.strength > 0.001) {
      const src = lens.hull, count = Math.min(48, src.length);
      for(let i = 0; i < count; i++) {
        const p = src[Math.floor(i * src.length / count)];
        this.hull[i * 2] = p[0];
        this.hull[i * 2 + 1] = p[1];
      }
      gl.uniform2fv(u['u_hull[0]'], this.hull);
      gl.uniform1i(u.u_lensCount, count);
      gl.uniform2f(u.u_lensCenter, lens.center[0], lens.center[1]);
      gl.uniform1f(u.u_lensStrength, Math.min(1, lens.strength));
      gl.uniform1f(u.u_lensSpin, lens.spin);
    } else {
      gl.uniform1i(u.u_lensCount, 0);
      gl.uniform1f(u.u_lensStrength, 0);
    }
    gl.bindVertexArray(this.vao);
    // Edge slices from the back to the face; the face goes last, on top.
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, slices + 1);
    gl.bindVertexArray(null);
  }

  /** Loses the context: the canvas cannot be drawn into with WebGL again. */
  public destroy() {
    if(!this.gl) return;
    loseContext(this.gl);
    this.gl = null;
  }
}

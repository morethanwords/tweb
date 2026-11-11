// Telegram for Android's Icon3D and GLIconRenderer (org.telegram.ui.Components.Premium.GLIcon) in WebGL 1, as its
// dialogs draw the star on a plain page.
import { mixHex, parseColor } from './color.js';
import type { Mesh } from './mesh.js';
import { clamp, shineAt, smoothstep } from './motion.js';
import type { StarKind, StarTheme } from './options.js';
import { FRAGMENT, VERTEX } from './shaders.js';

export interface Textures {
  /** start_texture.svg drawn white at 240 x 240. */
  star: TexImageSource;
  flecks: TexImageSource;
}

/** Degrees: GLIconRenderer's angles, plus yaw and pitch for a tilt; dt in seconds. */
export interface Frame {
  angleX: number;
  angleY: number;
  angleX2: number;
  yaw: number;
  pitch: number;
  dt: number;
}

export interface Renderer {
  /** The last frame was mid fade-in or showed the turn light's moving part: more frames finish it. */
  readonly settling: boolean;
  setLook(kind: StarKind, theme: StarTheme, background: string): void;
  /** `still` skips the fade-in and parks the shine; `glints` sweeps the shine band. */
  draw(frame: Frame, still: boolean, glints: boolean): void;
  /** Deletes every GL object it made. */
  release(): void;
}

/** color1 and color2 of PremiumPreviewBottomSheet and StarsIntroActivity. */
const GRADIENT: Readonly<Record<StarKind, string>> = { premium: '#a767ff #55a5ff', stars: '#fec846 #ec920a' };

/** The Premium star on a light page: Premium's violet over most of the star with blue for an accent near its corner
 *  of the gradient, a rest light that barely whitens it, and mostly violet refracted, `behind` mixed with the page by
 *  `page`. The turn light lights the star only while it turns: `turn` is its strength toward `glint`, a pale blue whose
 *  core burns toward white. Dark pages keep GRADIENT, a 0.9 rest light and no turn light. */
const LIGHT_PREMIUM = { gradient: '#3d8bff #6b4dff', rest: 0.1, turn: 2.2, glint: '#bfdeff', behind: '#5c48ff', page: 0.1 } as const;

/** The turn rate in degrees a second, smoothed over MOVE_S seconds, opens the turn light's moving part from MOVE_FROM
 *  to MOVE_TO: a turn, a flip or a drag lights it, a hand's tremor does not. */
const MOVE_S = 0.15;
const MOVE_FROM = 10;
const MOVE_TO = 60;
/** Degrees the short way round: a run that ends at 360 starts again from 0, which is no turn. */
const around = (d: number): number => (((d % 360) + 540) % 360) - 180;

const rgb = (hex: string): number[] => parseColor(hex)!.map((v) => v / 255);

function multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  for (let i = 0; i < 16; i++) {
    out[i] = 0;
    for (let k = 0; k < 4; k++) out[i] = out[i]! + a[k * 4 + (i % 4)]! * b[(i & ~3) + k]!;
  }
  return out;
}

/** Null when the context is lost, the program does not link, or a 32-bit index buffer has no extension. */
export function createRenderer(gl: WebGLRenderingContext, mesh: Mesh, textures: Textures): Renderer | null {
  // A lost context creates no objects, and WebGL throws on the nulls.
  if (gl.isContextLost()) return null;
  const wide = mesh.indices instanceof Uint32Array;
  if (wide && !gl.getExtension('OES_element_index_uint')) return null;
  const program = gl.createProgram()!;
  const shaders = ([[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const).map(([type, source]) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  const buffers: Array<WebGLBuffer | null> = [];
  const made: Array<WebGLTexture | null> = [];
  const release = () => {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const texture of made) gl.deleteTexture(texture);
    for (const shader of shaders) gl.deleteShader(shader);
    gl.deleteProgram(program);
    buffers.length = made.length = 0;
  };
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (!gl.isContextLost()) console.warn('telegram-3d-star:', gl.getProgramInfoLog(program));
    release();
    return null;
  }
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  const at: Record<string, WebGLUniformLocation | null> = {};
  const u = (name: string) => (name in at ? at[name]! : (at[name] = gl.getUniformLocation(program, name)));
  const attributes = ['a_TexCoordinate', 'a_Normal', 'vPosition'].map((name) => gl.getAttribLocation(program, name));
  const indices = gl.createBuffer();
  buffers.push(indices);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  [mesh.uvs, mesh.normals, mesh.positions].forEach((data, k) => {
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attributes[k]!);
    gl.vertexAttribPointer(attributes[k]!, k ? 3 : 2, gl.FLOAT, false, 0, 0);
  });

  // As GLUtils.texImage2D uploads Android's premultiplied bitmaps.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const texture = (unit: number, clampToEdge: boolean) => {
    const t = gl.createTexture();
    made.push(t);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    // WebGL 1 cannot repeat a texture whose size is not a power of two.
    if (clampToEdge) for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, wrap, gl.CLAMP_TO_EDGE);
  };
  texture(0, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures.star);
  texture(1, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textures.flecks);
  // The page colour the glass refracts: one texel, which samples as GLIconRenderer's filled 50 x 50 bitmap does.
  texture(2, true);
  // Icon3D.draw sets these every frame, unchanged; white and gradientPosition stay 0.
  ['u_Texture', 'u_NormalMap', 'u_BackgroundTexture'].forEach((name, i) => gl.uniform1i(u(name), i));
  gl.uniform1f(u('u_diffuse'), 1);
  gl.uniform1f(u('normalSpec'), 0.2);
  gl.uniform3f(u('normalSpecColor'), 1, 1, 1);
  gl.uniform1f(u('spec2'), 0.3);
  gl.uniform3fv(u('u_glint'), rgb(LIGHT_PREMIUM.glint));

  // perspectiveM(53.13°, w / h, 1, 200) × setLookAtM(eye 0 0 100), which is a translation; filled in place each
  // frame, so the loop allocates nothing.
  const p = 1 / Math.tan((53.13 * Math.PI) / 360);
  const pv = new Float32Array([0, 0, 0, 0, 0, p, 0, 0, 0, 0, -201 / 199, -1, 0, 0, (201 * 100 - 400) / 199, 100]);
  const [world, mvp] = [new Float32Array(16), new Float32Array(16)];
  world[15] = 1;
  const pixel = new Uint8Array([0, 0, 0, 255]);
  let enterAlpha = 0;
  let xOffset = 0;
  let time = 0;
  let turnRate = 0;
  let [lastX, lastY] = [0, 0];
  let [shownAlpha, shownMove] = [0, 0];

  return {
    get settling() {
      return shownAlpha < 1 || shownMove > 0;
    },
    setLook(kind, theme, background) {
      const dark = theme === 'dark';
      const light = !dark && kind === 'premium';
      pixel.set(parseColor(light ? mixHex(LIGHT_PREMIUM.behind, background, LIGHT_PREMIUM.page) : mixHex('#a767ff', background, 0.5))!);
      gl.activeTexture(gl.TEXTURE2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.uniform1f(u('golden'), kind === 'stars' ? 1 : 0);
      (light ? LIGHT_PREMIUM.gradient : GRADIENT[kind]).split(' ').forEach((c, i) => gl.uniform3fv(u(`gradientColor${i + 1}`), rgb(c)));
      gl.uniform1f(u('u_rest'), light ? LIGHT_PREMIUM.rest : 0.9);
      gl.uniform1f(u('u_turn'), light ? LIGHT_PREMIUM.turn : 0);
      // GLIconRenderer.isDarkBackground; the front lobe, raised from upstream's 0.2, is the light at rest.
      gl.uniform1f(u('spec1'), dark ? 1 : 2);
    },
    draw(f, still, glints) {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      pv[0] = p / (w / h);
      // translateM(0, angleX2, 0) × rotateM(-angleY - pitch, x) × rotateM(-angleX - yaw, y).
      const a = (-(f.angleY + f.pitch) * Math.PI) / 180;
      const b = (-(f.angleX + f.yaw) * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      world[0] = cb;
      world[1] = sa * sb;
      world[2] = -ca * sb;
      world[5] = ca;
      world[6] = sa;
      world[8] = sb;
      world[9] = -sa * cb;
      world[10] = ca * cb;
      world[13] = f.angleX2;
      if (still) enterAlpha = 1;
      time += f.dt;
      const [x, y] = [f.angleX + f.yaw, f.angleY + f.pitch];
      if (f.dt > 0) turnRate += (Math.hypot(around(x - lastX), around(y - lastY)) / f.dt - turnRate) * (1 - Math.exp(-f.dt / MOVE_S));
      [lastX, lastY] = [x, y];
      gl.uniformMatrix4fv(u('uMVPMatrix'), false, multiply(mvp, pv, world));
      gl.uniformMatrix4fv(u('world'), false, world);
      gl.uniform1f(u('f_xOffset'), xOffset);
      gl.uniform1f(u('f_alpha'), (shownAlpha = enterAlpha));
      gl.uniform2f(u('resolution'), w, h);
      gl.uniform1f(u('u_shine'), still || !glints ? shineAt(0) : shineAt(time));
      shownMove = still ? 0 : smoothstep(clamp((turnRate - MOVE_FROM) / (MOVE_TO - MOVE_FROM), 0, 1));
      gl.uniform1f(u('u_move'), shownMove);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      // Per frame, as in Icon3D.draw, at most 60 a second.
      enterAlpha = Math.min(1, enterAlpha + 16 / 220);
      xOffset = (xOffset + 0.0005) % 1;
    },
    release,
  };
}

import {observeResize} from '@components/resizeObserver';
import createAppWindowIntersectionObserver from '@helpers/dom/createAppWindowIntersectionObserver';
import {createProgram, getWebGL2Context, loseContext, uniformLocations, type UniformMap} from '@components/wallet/visual/gl';

/**
 * The light of the AI editor's rewrite on send, drawn by a shader as Telegram for iOS draws it (its dictation glow):
 * through the field's glass, sheens of light with a lighter, cooler front and a wake going into violet, glittering
 * where they are brightest; round the field, a glow that the edge catches as a sheen crosses it. Two canvases in the
 * field, one in its glass under all it holds and one under it round it, on one clock with the sheens lighting the
 * letters.
 */

export type GlowSheen = {delay: number, strength: number};
export type GlowTiming = {period: number, crossing: number, ahead: number, wake: number, lean: number, sheens: GlowSheen[]};

// * how far round the field its glow reaches, in pixels
export const GLOW_MARGIN = 24;

const VERTEX = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0., 1.);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 color;

uniform vec2 size;       // the canvas, in pixels of the page
uniform vec4 capsule;    // the field in the canvas: x, y, width, height (its glass is what the sheens cross)
uniform float radius;    // its corners
uniform float scale;     // device pixels in a pixel
uniform float time;      // on the sheens' clock, milliseconds
uniform float direction; // 1, or -1 right to left
uniform float interior;  // 1 in the glass, 0 round it
uniform float dark;
uniform vec3 accent;
uniform vec4 timing;     // period, crossing, ahead, wake
uniform float lean;
uniform vec2 sheens[4];  // delay, strength
uniform int sheenCount;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// * how lit a point is so far ahead of a front (negative: in its wake)
float intensity(float ahead) {
  if(ahead >= 0.) return exp(-ahead * ahead / (2. * 11. * 11.));
  return .6 * exp(ahead / 55.) + .4 * exp(-ahead * ahead / (2. * 7. * 7.));
}

// * the rounded rectangle's distance, outside positive
float capsuleDistance(vec2 p) {
  vec2 halfSize = capsule.zw * .5;
  vec2 q = abs(p - capsule.xy - halfSize) - halfSize + radius;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
}

// * tiny four-pointed stars in a grid, each twinkling at its own time
float glitter(vec2 p) {
  vec2 cell = floor(p / 7.);
  if(hash(cell) < .62) return 0.;
  vec2 local = fract(p / 7.) - .5 - (vec2(hash(cell + 1.3), hash(cell + 2.7)) - .5) * .5;
  float twinkle = pow(max(0., sin(time * .009 + hash(cell + 5.1) * 6.283)), 6.);
  float star = max(0., 1. - length(local * vec2(1., 7.)) * 3.2) + max(0., 1. - length(local * vec2(7., 1.)) * 3.2);
  return (star * .7 + exp(-dot(local, local) * 140.)) * twinkle;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, size.y * scale - gl_FragCoord.y) / scale;
  float along = p.x - capsule.x;
  if(direction < 0.) along = capsule.z - along;
  float centerY = capsule.y + capsule.w * .5;

  vec3 lead = mix(accent, vec3(.84, .97, 1.), .6);
  vec3 wake = mix(accent, vec3(.58, .38, 1.), .35);
  vec3 light = vec3(0.);
  float sheen = 0.;
  for(int i = 0; i < 4; ++i) {
    if(i >= sheenCount) break;
    float t = time - sheens[i].x;
    if(t < 0.) continue;
    t = mod(t, timing.x);
    if(t > timing.y) continue;
    float progress = t / timing.y;
    float eased = progress * .55 + progress * progress * (3. - 2. * progress) * .45;
    float front = -timing.z - 20. + (capsule.z + timing.w + timing.z + 20.) * eased;
    float ahead = along - front + lean * (p.y - centerY);
    float lit = intensity(ahead) * sheens[i].y;
    float chroma = clamp(ahead / 22., -1., 1.);
    light += (chroma >= 0. ? mix(accent, lead, chroma) : mix(accent, wake, -chroma)) * lit;
    sheen += lit;
  }

  float edge = capsuleDistance(p);
  if(interior > .5) {
    float inside = clamp(.5 - edge, 0., 1.);
    float strength = dark > .5 ? .5 : .42;
    vec3 rgb = light * strength;
    float alpha = sheen * strength;
    if(sheen > .08) {
      float sparkle = glitter(p) * smoothstep(.08, .48, sheen) * .9;
      rgb += mix(vec3(1.), lead, .3) * sparkle;
      alpha += sparkle;
    }
    color = vec4(rgb, min(alpha, 1.)) * inside;
  } else {
    float outside = max(edge, 0.);
    // * the field's own glow, a thin bright line on its edge, and the light a sheen throws off it
    float halo = exp(-outside / 7.) * .32;
    float rim = exp(-abs(edge) / 1.1) * .4;
    float caught = exp(-outside / 5.) * .95;
    vec3 rgb = accent * (halo + rim) + light * caught;
    float alpha = halo + rim + sheen * caught;
    color = vec4(rgb, min(alpha, 1.)) * smoothstep(-1.5, .5, edge);
  }
}`;

type Surface = {
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  uniforms: UniformMap
};

export default class AiRewriteGlow {
  public readonly exterior: HTMLCanvasElement;
  public readonly interior: HTMLCanvasElement;
  private surfaces: Surface[] = [];
  private radius: number;
  private frame: number;
  private drawing = false;
  private unobserve: () => void;
  private visibility: ReturnType<typeof createAppWindowIntersectionObserver>;

  /**
   * `field` is the capsule, `clock` the sheens' time, `rtl` the way the draft runs (the letters' sheen goes that way
   * too, whatever the interface's direction); it throws when the shader cannot be had, for the light to be drawn the
   * plain way
   */
  constructor(private field: HTMLElement, private timing: GlowTiming, private clock: () => number, rtl: boolean) {
    const fieldStyle = getComputedStyle(field);
    this.radius = parseFloat(fieldStyle.borderTopLeftRadius) || Infinity;
    const reflect = rtl ? -1 : 1;
    const dark = document.documentElement.classList.contains('night');

    const make = (interior: boolean) => {
      const canvas = document.createElement('canvas');
      const margin = interior ? 0 : GLOW_MARGIN;
      // * as big as what it is in and the glow round it, as that changes: the field grows round a longer text
      Object.assign(canvas.style, {
        position: 'absolute',
        left: -margin + 'px',
        top: -margin + 'px',
        width: `calc(100% + ${margin * 2}px)`,
        height: `calc(100% + ${margin * 2}px)`,
        pointerEvents: 'none',
        zIndex: interior ? '' : '-1',
        color: 'var(--primary-color)'
      });
      const gl = getWebGL2Context(canvas, {premultipliedAlpha: true, alpha: true, antialias: false});
      let program: WebGLProgram;
      try {
        // * drawn by the processor, every frame of it would be the page's main thread's own: the plain light then
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer: string = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '';
        if(/swiftshader|llvmpipe|softpipe|software/i.test(renderer)) throw new Error('WebGL is drawn in software');
        program = createProgram(gl, VERTEX, FRAGMENT);
      } catch(err) {
        loseContext(gl);
        throw err;
      }

      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      // * the glass is under what the field holds, painted before it (its rows let it through), the glow under the field
      if(interior) field.prepend(canvas);
      else field.append(canvas);

      const uniforms = uniformLocations(gl, program);
      // * the theme's color as computed: rgb() in 0-255, or color(srgb ...) in 0-1 where it is mixed
      const computed = getComputedStyle(canvas).color;
      const accent = (computed.match(/[\d.]+/g) || ['51', '144', '236']).slice(0, 3).map((value) => +value / (computed.startsWith('color(') ? 1 : 255));
      gl.uniform1f(uniforms.direction, reflect);
      gl.uniform1f(uniforms.interior, interior ? 1 : 0);
      gl.uniform1f(uniforms.dark, dark ? 1 : 0);
      gl.uniform3f(uniforms.accent, accent[0], accent[1], accent[2]);
      gl.uniform4f(uniforms.timing, timing.period, timing.crossing, timing.ahead, timing.wake);
      gl.uniform1f(uniforms.lean, Math.tan(timing.lean * Math.PI / 180));
      gl.uniform2fv(uniforms.sheens, timing.sheens.flatMap(({delay, strength}) => [delay, strength]));
      gl.uniform1i(uniforms.sheenCount, timing.sheens.length);

      this.surfaces.push({canvas, gl, uniforms});
      return canvas;
    };

    try {
      this.exterior = make(false);
      this.interior = make(true);
    } catch(err) {
      this.destroy();
      throw err;
    }

    this.layout();
    this.unobserve = observeResize(field, this.onResize);
    // * drawn while it is seen: a chat another one covers goes on with its send, its light out of sight
    this.visibility = createAppWindowIntersectionObserver((entries) => {
      this.setDrawing(entries[entries.length - 1].isIntersecting);
    });
    this.visibility.observe(field);
    this.setDrawing(true);
  }

  // * each canvas at the device's pixels of its size now, and where the field is in it
  private layout() {
    const fieldRect = this.field.getBoundingClientRect();
    const rects = this.surfaces.map(({canvas}) => canvas.getBoundingClientRect());
    const scale = window.devicePixelRatio || 1;
    this.surfaces.forEach(({canvas, gl, uniforms}, index) => {
      const rect = rects[index];
      const width = Math.round(rect.width * scale), height = Math.round(rect.height * scale);
      if(canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      gl.uniform2f(uniforms.size, width / scale, height / scale);
      gl.uniform1f(uniforms.scale, scale);
      gl.uniform4f(uniforms.capsule, fieldRect.left - rect.left, fieldRect.top - rect.top, fieldRect.width, fieldRect.height);
      gl.uniform1f(uniforms.radius, Math.min(this.radius, fieldRect.height / 2));
    });
  }

  // * a canvas given another size is cleared: drawn again before the frame is painted
  private onResize = () => {
    this.layout();
    this.render();
  };

  private render() {
    const time = this.clock();
    for(const {gl, uniforms} of this.surfaces) {
      gl.uniform1f(uniforms.time, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private draw = () => {
    this.render();
    this.frame = requestAnimationFrame(this.draw);
  };

  private setDrawing(drawing: boolean) {
    if(this.drawing === drawing) return;
    this.drawing = drawing;
    if(drawing) this.draw();
    else cancelAnimationFrame(this.frame);
  }

  /** the canvases go, and their GPU side with them */
  public destroy() {
    this.setDrawing(false);
    this.visibility?.disconnect();
    this.visibility = undefined;
    this.unobserve?.();
    this.unobserve = undefined;
    for(const {canvas, gl} of this.surfaces) {
      loseContext(gl);
      canvas.remove();
    }
    this.surfaces = [];
  }
}

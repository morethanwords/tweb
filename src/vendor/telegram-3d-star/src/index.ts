import { loadAssets } from './assets.js';
import { starMotion } from './motion.js';
import { resolveKind, resolveLook, resolveOptions, type StarAssets, type StarKind, type StarOptions, type StarTheme } from './options.js';
import { createField } from './particles.js';
import { createRenderer, type Frame } from './renderer.js';

export { PAGE_COLORS } from './options.js';
export type { StarAssets, StarKind, StarOptions, StarTheme };

export interface Star {
  readonly canvas: HTMLCanvasElement;
  /** `background` defaults to PAGE_COLORS[theme]. */
  setTheme(theme: StarTheme, background?: string): void;
  setKind(kind: StarKind): void;
  /** Holds the current frame until resume(). */
  pause(): void;
  resume(): void;
  /** Stops, removes its listeners, deletes its GL objects and loses the WebGL context. */
  destroy(): void;
}

// A software renderer fails the caveat check: the poster looks better than a slow star.
const ATTRIBUTES: WebGLContextAttributes = { powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
const context = (canvas: HTMLCanvasElement): WebGLRenderingContext | null => canvas.getContext('webgl', ATTRIBUTES);
const lose = (gl: WebGLRenderingContext) => gl.getExtension('WEBGL_lose_context')?.loseContext();

let supported: boolean | undefined;

/** Whether this browser can draw the star. Without it, show a poster. */
export function isSupported(): boolean {
  if (supported === undefined) {
    const gl = typeof document === 'undefined' ? null : context(document.createElement('canvas'));
    supported = !!gl && !gl.isContextLost();
    if (gl) lose(gl);
  }
  return supported;
}

/** Starts loading the assets, so that a later createStar draws sooner. */
export function preload(assets?: string | URL | StarAssets): Promise<void> {
  return loadAssets(assets).then((): void => undefined);
}

/** At most 60 frames a second at any display rate, on the display's own ticks. */
function frameGate(): (now: number) => boolean {
  const step = 1000 / 60;
  let next = 0;
  return (now) => {
    if (now < next - 2) return false;
    next = (now - next > step ? now : next) + step;
    return true;
  };
}

/** Draws the star into `canvas` at its CSS size times devicePixelRatio, capped by maxPixelRatio. Rejects when WebGL cannot draw it. */
export async function createStar(canvas: HTMLCanvasElement, options?: StarOptions): Promise<Star> {
  if (typeof canvas?.getContext !== 'function') throw new TypeError('createStar needs a canvas');
  const o = resolveOptions(options);
  // The canvas's own document and window (a Document Picture-in-Picture window is not the module's `window`).
  const doc = canvas.ownerDocument;
  const win = doc.defaultView ?? window;
  if (o.particles === canvas) throw new TypeError('particles needs a canvas of its own');
  const assets = await loadAssets(o.assets);
  const gl = context(canvas);
  if (!gl) throw new Error('WebGL is not available');
  let renderer = createRenderer(gl, assets.mesh, assets.textures);
  if (!renderer) {
    lose(gl);
    throw new Error('WebGL cannot draw the star');
  }
  let { kind, theme, background } = o;
  renderer.setLook(kind, theme, background);
  const particles = o.particles;
  const field = particles && createField(particles, kind);

  let dead = false;
  let paused = false;
  let seen = typeof win.IntersectionObserver !== 'function';
  let raf = 0;
  let last = 0;
  // Runs only while frames do.
  let clock = 0;
  let [width, height, ratio] = [0, 0, 0];
  // The field canvas's CSS size.
  let [fw, fh] = [0, 0];
  // A finger's spin speeds the field up until this clock time.
  let spunUntil = -Infinity;
  let angle = 0;
  const gate = frameGate();
  const motion = starMotion(0, o.autoplay);
  const frame: Frame = { angleX: 0, angleY: 0, angleX2: 0, yaw: 0, pitch: 0, dt: 0 };
  const reduce = o.reducedMotion === undefined && typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const still = () => o.reducedMotion ?? !!reduce?.matches;
  const fieldStill = () => still() || !o.autoplay;
  let press: { id: number; x: number; y: number; t: number } | null = null;
  let dragging = false;
  let [lx, ly] = [0, 0];

  const live = () => !dead && !paused && seen && doc.visibilityState !== 'hidden' && !still() && !!renderer && width > 0 && height > 0;
  // Without autoplay the loop runs only for the fade-in, a press and its spring back.
  const wanted = () => live() && (o.autoplay || renderer!.settling || motion.moving || !!press);

  const size = () => {
    ratio = Math.min(win.devicePixelRatio || 1, o.maxPixelRatio);
    const [w, h] = [Math.round(width * ratio), Math.round(height * ratio)];
    if (w && h && (canvas.width !== w || canvas.height !== h)) [canvas.width, canvas.height] = [w, h];
  };
  // Client rects place the star in the field; a transformed ancestor scales both alike, so the field's own scale
  // turns them back into its CSS px.
  const placeField = () => {
    if (!field || !fw || !fh || !width || !height) return;
    const a = particles!.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    const k = a.width / fw || 1;
    field.layout(fw, fh, (b.left + b.width / 2 - a.left) / k, (b.top + b.height / 2 - a.top) / k, Math.min(width, height) / 1.5, ratio);
    if (fieldStill()) field.still();
    else field.frame(0, 0);
  };
  const draw = (now: number) => {
    if (!renderer || !width || !height) return;
    if (Math.min(win.devicePixelRatio || 1, o.maxPixelRatio) !== ratio) {
      size();
      placeField();
    }
    const s = still();
    const dt = raf ? Math.min(Math.max(now - last, 0), 100) : 0;
    last = now;
    if (!s) motion.tick((clock += dt));
    if (field && !fieldStill()) field.frame(dt, clock < spunUntil && dt > 0 ? ((motion.angleX - angle) * 1000) / dt : 0);
    angle = motion.angleX;
    frame.angleX = s ? 0 : motion.angleX;
    frame.angleY = s ? 0 : motion.angleY;
    frame.angleX2 = s ? 0 : motion.angleX2;
    frame.dt = s ? 0 : dt / 1000;
    renderer.draw(frame, s, o.autoplay);
  };
  const stop = () => {
    win.cancelAnimationFrame(raf);
    raf = 0;
  };
  const loop = (now: number) => {
    raf = win.requestAnimationFrame(loop);
    if (gate(now)) draw(now);
    if (!wanted()) stop();
  };
  const update = () => {
    if (!wanted()) stop();
    else if (!raf) {
      last = win.performance.now();
      raf = win.requestAnimationFrame(loop);
    }
  };
  const redraw = () => {
    if (!raf) draw(win.performance.now());
  };
  const relook = () => {
    renderer?.setLook(kind, theme, background);
    redraw();
  };

  // GLIconTextureView.onTouchEvent: past an 8 px slop a drag spins by device pixels; a release within 400 ms that
  // never dragged is a tap, which pushes the side it lands on.
  const onDown = (e: PointerEvent) => {
    if (!o.interactive || press || !e.isPrimary || e.button !== 0 || !live()) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    [dragging, lx, ly] = [false, e.clientX, e.clientY];
    motion.down();
    spunUntil = Infinity;
    update();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== press?.id || !(dragging ||= Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8)) return;
    const px = win.devicePixelRatio || 1;
    motion.drag((lx - e.clientX) * px, (ly - e.clientY) * px);
    [lx, ly] = [e.clientX, e.clientY];
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== press?.id) return;
    motion.up(clock);
    spunUntil = clock + 1500;
    const r = canvas.getBoundingClientRect();
    const [hx, hy] = [r.width / 2, r.height / 2];
    if (e.type === 'pointerup' && !dragging && hx > 0 && hy > 0 && e.timeStamp - press.t < 400)
      motion.tap(clock, (hx - e.clientX + r.left) / hx, (hy - e.clientY + r.top) / hy);
    press = null;
    update();
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    renderer = null;
    stop();
  };
  const onRestored = () => {
    renderer = createRenderer(gl, assets.mesh, assets.textures);
    relook();
    update();
  };
  const onMotion = () => {
    update();
    redraw();
    placeField();
  };
  const listeners: Array<[string, (e: never) => void]> = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onUp],
    ['webglcontextlost', onLost],
    ['webglcontextrestored', onRestored],
  ];
  for (const [type, fn] of listeners) canvas.addEventListener(type, fn as EventListener);
  doc.addEventListener('visibilitychange', update);
  reduce?.addEventListener?.('change', onMotion);
  // Horizontal drags spin the star; vertical ones still scroll the page.
  const style = [canvas.style.touchAction, canvas.style.getPropertyValue('-webkit-tap-highlight-color')];
  if (o.interactive) {
    canvas.style.touchAction = 'pan-y';
    canvas.style.setProperty('-webkit-tap-highlight-color', 'transparent');
  }
  // The field never takes input: a drag that starts on it still reaches the page, or the star where they overlap.
  const fieldEvents = particles?.style.pointerEvents ?? '';
  if (particles) particles.style.pointerEvents = 'none';
  if (field && !fieldStill()) field.intro();

  const resize = new win.ResizeObserver((entries) => {
    for (const { target, contentRect: box } of entries) {
      if (target === canvas) [width, height] = [box.width, box.height];
      else [fw, fh] = [box.width, box.height];
    }
    size();
    placeField();
    // A new size clears the canvas after this frame's draw, so draw again now, running or not.
    draw(win.performance.now());
    update();
  });
  resize.observe(canvas);
  if (particles) resize.observe(particles);
  const io =
    typeof win.IntersectionObserver === 'function'
      ? new win.IntersectionObserver((entries) => {
          seen = entries[entries.length - 1]!.isIntersecting;
          update();
        })
      : null;
  io?.observe(canvas);

  return {
    canvas,
    setTheme(next, color) {
      if (dead) return;
      ({ theme, background } = resolveLook(next, color));
      relook();
    },
    setKind(next) {
      if (dead) return;
      kind = resolveKind(next);
      field?.setKind(kind);
      relook();
    },
    pause() {
      paused = true;
      update();
    },
    resume() {
      paused = false;
      update();
    },
    destroy() {
      if (dead) return;
      dead = true;
      stop();
      resize.disconnect();
      io?.disconnect();
      for (const [type, fn] of listeners) canvas.removeEventListener(type, fn as EventListener);
      doc.removeEventListener('visibilitychange', update);
      reduce?.removeEventListener?.('change', onMotion);
      canvas.style.touchAction = style[0]!;
      canvas.style.setProperty('-webkit-tap-highlight-color', style[1]!);
      field?.clear();
      if (particles) particles.style.pointerEvents = fieldEvents;
      renderer?.release();
      renderer = null;
      lose(gl);
    },
  };
}

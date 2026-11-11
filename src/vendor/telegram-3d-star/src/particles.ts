// Telegram's StarParticlesView on a Canvas 2D layer: four-point stars that drift out from around the star.
// Ported from Telegram for Android, TMessagesProj/src/main/java/org/telegram/ui/Components/Premium/StarParticlesView.java;
// the colours and the entrance burst follow Telegram for iOS. The 0.6 y squash and the hole of 0.55 times the star
// draw the iOS horizontal band, so Android's useRotate is left out: turning the field would stand the band upright.
import { parseColor } from './color.js';
import { clamp, overshoot } from './motion.js';
import type { StarKind } from './options.js';

/** Each star's own gradient. */
export const PARTICLE_COLORS: Readonly<Record<StarKind, readonly string[]>> = {
  premium: ['#6a94ff', '#9472fd', '#e26bd3'],
  stars: ['#fdd219', '#f9b004', '#f09903'],
};

/** In CSS px: size1 as configure() sets it, then size2 and size3. */
export const SPRITE_SIZES = [4, 12, 10] as const;
/** The particles of the still frame shown with reduced motion or without autoplay. */
export const STILL_COUNT = 40;
/** The most particles a field draws, whatever the star's size. */
export const MAX_PARTICLES = 300;

/** 100 particles around a 120 px star, scaled by the star's area: the field keeps its look at any size. */
export const particleCount = (star: number): number => clamp(Math.round(100 * (star / 120) ** 2), 1, MAX_PARTICLES);

/** A seeded generator (Numerical Recipes' LCG): the still frame is the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export type Sprite = (color: string, size: number, ratio: number) => CanvasImageSource & { readonly width: number };

// Per document: a field draws the sprites made in its canvas's own document (a Document Picture-in-Picture window
// is not the module's `document`).
const sprites = new WeakMap<Document, Map<string, HTMLCanvasElement>>();

/** One pre-rendered four-point star, `size` CSS px at `ratio`, in `color` at alpha 200. Shared by every field of `doc`. */
export function sprite(color: string, size: number, ratio: number, doc: Document = document): HTMLCanvasElement {
  let cache = sprites.get(doc);
  if (!cache) sprites.set(doc, (cache = new Map()));
  const key = `${color} ${size} ${ratio}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const n = Math.max(2, Math.round(size * ratio));
  const c = doc.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const rgb = parseColor(color);
  if (g && rgb) {
    const half = n >> 1;
    const mid = Math.floor(half * 0.98);
    const p = [0, half, mid, mid, half, 0, n - mid, mid, n, half, n - mid, n - mid, half, n, mid, n - mid];
    // CornerPathEffect: each corner is cut back by up to 0.8 px along both sides and joined by a quad through it.
    const cut = (i: number, j: number, r: number): [number, number] => {
      const [x, y, dx, dy] = [p[2 * i]!, p[2 * i + 1]!, p[2 * j]! - p[2 * i]!, p[2 * j + 1]! - p[2 * i + 1]!];
      const f = Math.min(0.5, r / (Math.hypot(dx, dy) || 1));
      return [x + dx * f, y + dy * f];
    };
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = cut(i, (i + 7) % 8, 0.8 * ratio);
      const [bx, by] = cut(i, (i + 1) % 8, 0.8 * ratio);
      if (i) g.lineTo(ax, ay);
      else g.moveTo(ax, ay);
      g.quadraticCurveTo(p[2 * i]!, p[2 * i + 1]!, bx, by);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
    blur(g, n, Math.round(ratio), rgb);
  }
  cache.set(key, c);
  return c;
}

/** Stack blur on alpha; the colour is one, so this is what blurring premultiplied pixels gives. Alpha ends at 200. */
function blur(g: CanvasRenderingContext2D, n: number, radius: number, [r, gr, b]: [number, number, number]): void {
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  let a = new Float32Array(n * n);
  let t = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) a[i] = d[i * 4 + 3]!;
  const norm = (radius + 1) ** 2;
  for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) s += a[clamp(y + k * dy, 0, n - 1) * n + clamp(x + k * dx, 0, n - 1)]! * (radius + 1 - Math.abs(k));
        t[y * n + x] = s / norm;
      }
    }
    [a, t] = [t, a];
  }
  for (let i = 0; i < n * n; i++) d.set([r, gr, b, (a[i]! * 200) / 255], i * 4);
  g.putImageData(img, 0, 0);
}

export interface Field {
  /** The canvas's CSS size, the star's centre in it and the star's size, in CSS px. A new width, star size or ratio
   *  respawns the field. */
  layout(width: number, height: number, cx: number, cy: number, star: number, ratio: number): void;
  setKind(kind: StarKind): void;
  /** Advances dt ms and draws; `spin` is the star's turn in degrees a second while a finger spins it. */
  frame(dt: number, spin: number): void;
  /** One still frame: a seeded field at t = 2 s with STILL_COUNT particles. */
  still(): void;
  /** Speed 4 easing back to 1 over 1200 ms. */
  intro(): void;
  clear(): void;
}

const STEP = 1000 / 60;
// Per particle: x, y from the star's centre (CSS px), direction x, y, age, life (ms), alpha, sprite.
const STRIDE = 8;

/** The field in `canvas`, or null without a 2D context. Nothing draws before the first layout. */
export function createField(
  canvas: HTMLCanvasElement,
  kind: StarKind,
  makeSprite: Sprite = (color, size, ratio) => sprite(color, size, ratio, canvas.ownerDocument),
): Field | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let colors = PARTICLE_COLORS[kind];
  let images: Array<ReturnType<Sprite>> = [];
  let p = new Float32Array(0);
  let w = 0;
  let h = 0;
  let cx = 0;
  let cy = 0;
  let mark = 0;
  let ratio = 0;
  let count = 0;
  // The particles in play: STILL_COUNT of them for a still frame, `count` while the field moves.
  let n = 0;
  let rand = Math.random;
  let introAge = Infinity;
  let boost = 1;

  const paintSprites = () => {
    images = [];
    SPRITE_SIZES.forEach((s, i) => colors.forEach((color, j) => (images[i * colors.length + j] = makeSprite(color, s, ratio))));
  };
  const inside = (x: number, y: number) => cx + x > -15 && cx + x < w + 15 && cy + y > -15 && cy + y < h + 15;
  const spawn = (o: number) => {
    let x = 0;
    let y = 0;
    // A clipped canvas loses spawns past its edge: a few tries keep the count on screen.
    for (let tries = 0; tries < 4; tries++) {
      const a = rand() * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Nothing inside the star's circle once y is squashed.
      const near = (0.55 * mark) / Math.hypot(c, 0.6 * s);
      const r = near + rand() * Math.max(0, w / 2 - near);
      x = r * c;
      y = 0.6 * r * s;
      if (inside(x, y)) break;
    }
    const len = Math.hypot(x, y) || 1;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = x / len;
    p[o + 3] = y / len;
    p[o + 4] = 0;
    p[o + 5] = 2000 + Math.floor(rand() * 3000);
    p[o + 6] = (50 + Math.floor(rand() * 50)) / 100;
    p[o + 7] = Math.floor(rand() * SPRITE_SIZES.length) * colors.length + Math.floor(rand() * colors.length);
  };
  const respawn = () => {
    for (let i = 0; i < n; i++) spawn(i * STRIDE);
  };
  const step = (dt: number, spin: number) => {
    introAge += dt;
    boost = Math.max(Math.min(3.5, 1 + Math.abs(spin) * 0.02), 1 + (boost - 1) * Math.exp(-dt / 200));
    const intro = introAge < 1200 ? 4 - 3 * easeOutCubic(introAge / 1200) : 1;
    const move = (4 / 660) * dt * Math.max(intro, boost);
    for (let o = 0; o < n * STRIDE; o += STRIDE) {
      if ((p[o + 4]! += dt) > p[o + 5]!) spawn(o);
      else if (!inside((p[o]! += p[o + 2]! * move), (p[o + 1]! += p[o + 3]! * move))) spawn(o);
    }
  };
  const paint = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let o = 0; o < n * STRIDE; o += STRIDE) {
      const x = cx + p[o]!;
      const y = cy + p[o + 1]!;
      const age = p[o + 4]!;
      const rest = p[o + 5]! - age;
      const out = rest < 200 ? clamp(1 - rest / 150, 0, 1) : 0;
      const alpha = p[o + 6]! * (1 - out) * Math.min(1, y / 12, (h - y) / 12, x / 24, (w - x) / 24);
      const image = images[p[o + 7]!]!;
      const size = image.width * overshoot(Math.min(1, age / 200));
      if (alpha <= 0 || size <= 0) continue;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(image, x * ratio - size / 2, y * ratio - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  };

  return {
    layout(width, height, x, y, star, r) {
      const fresh = width !== w || star !== mark || r !== ratio;
      [w, h, cx, cy, mark] = [width, height, x, y, star];
      if (r !== ratio) {
        ratio = r;
        paintSprites();
      }
      const [bw, bh] = [Math.round(w * ratio), Math.round(h * ratio)];
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      if (count !== particleCount(mark)) {
        count = particleCount(mark);
        p = new Float32Array(count * STRIDE);
      }
      n = count;
      if (fresh && w) respawn();
    },
    setKind(next) {
      colors = PARTICLE_COLORS[next];
      if (ratio) paintSprites();
      if (w) paint();
    },
    frame(dt, spin) {
      if (!w) return;
      if (n !== count) n = count;
      step(clamp(dt, 0, 50), spin);
      paint();
    },
    still() {
      if (!w) return;
      rand = seeded(0x5eed);
      n = Math.min(STILL_COUNT, count);
      introAge = Infinity;
      boost = 1;
      respawn();
      for (let t = 0; t < 2000; t += STEP) step(STEP, 0);
      paint();
      rand = Math.random;
    },
    intro() {
      introAge = 0;
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

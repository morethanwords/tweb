// GLIconTextureView's motion (Telegram for Android), in GLIconRenderer's degrees, on the caller's clock in ms.

export type Ease = (t: number) => number;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Telegram's CubicBezierInterpolator. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const [cx, cy] = [3 * x1, 3 * y1];
  const [bx, by] = [3 * (x2 - x1) - cx, 3 * (y2 - y1) - cy];
  const [ax, ay] = [1 - cx - bx, 1 - cy - by];
  return (time) => {
    let x = time;
    for (let i = 1; i < 14; i++) {
      const z = x * (cx + x * (bx + x * ax)) - time;
      if (Math.abs(z) < 1e-3) break;
      x -= z / (cx + x * (2 * bx + 3 * ax * x));
    }
    return x * (cy + x * (by + x * ay));
  };
}

export const EASE_OUT_QUINT = cubicBezier(0.23, 1, 0.32, 1);
const EASE_DEFAULT = cubicBezier(0.25, 0.1, 0.25, 1);
export const EASE_OUT = cubicBezier(0, 0, 0.58, 1);

/** Android's OvershootInterpolator, tension 2. */
export const overshoot: Ease = (t) => (t - 1) * (t - 1) * (3 * t - 1) + 1;
const linear: Ease = (t) => t;

// The shine of Telegram for iOS (PremiumStarComponent.setupShineAnimation): a band on u + v = 2 (0.87 - x) of the
// star's texture coordinates. Every 4 s from 1 s, x eases out from 1 to -0.6 in 0.9 s, 1.1 s into the cycle, and holds.
/** The band's u + v, `seconds` after the star appeared. At 0 it rests off the star. */
export function shineAt(seconds: number): number {
  const cycle = seconds < 1 ? 0 : (seconds - 1) % 4;
  return 2 * (0.87 - 1 + 1.6 * EASE_OUT(Math.min(Math.max((cycle - 1.1) / 0.9, 0), 1)));
}

type Prop = 'angleX' | 'angleY' | 'angleX2';
/** A ValueAnimator: property, evenly spaced keyframes, duration, interpolator, start delay. */
type Track = [Prop, number[], number, Ease, number?];
/** An AnimatorSet playing its tracks together. */
interface Run {
  start: number;
  tracks: Track[];
  done?: (now: number) => void;
}

export interface StarMotion {
  angleX: number;
  angleY: number;
  angleX2: number;
  /** An idle, tap or spring-back animation is running. */
  readonly moving: boolean;
  tick(now: number): void;
  /** GestureDetector.onDown. */
  down(): void;
  /** GestureDetector.onScroll distances, in device pixels. */
  drag(distanceX: number, distanceY: number): void;
  /** ACTION_UP or ACTION_CANCEL. */
  up(now: number): void;
  /** onSingleTapUp, after up(): fx = (radius - x) / radius, fy likewise. */
  tap(now: number, fx: number, fy: number): void;
}

/** `idle` false keeps the idle turns off: the star moves only when dragged or tapped. */
export function starMotion(now: number, idle = true, random: () => number = Math.random): StarMotion {
  let set: Run | null = null;
  let back: Run | null = null;
  let idleAt: number | null = idle ? now + 2000 : null;
  let pointer = 0;
  const order = [0, 1, 2, 3, 4];
  const int = (bound: number) => Math.floor(random() * bound);
  const shuffle = () => {
    for (let i = order.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  };
  shuffle();
  const rest = (at: number) => (idle ? at + 2000 : null);
  const play = (start: number, tracks: Track[]) => {
    set = {
      start,
      tracks,
      done: (end) => {
        m.angleX = 0;
        idleAt = rest(end);
      },
    };
  };
  const startBack = (start: number) => {
    set = null;
    back = { start, tracks: (['angleX', 'angleX2', 'angleY'] as const).map((p): Track => [p, [m[p], 0], 600, overshoot]) };
    idleAt = rest(start);
  };
  // True once all tracks have ended. Like FloatKeyframeSet, overshoot extends an end segment.
  const advance = (run: Run, now: number) => {
    let ended = true;
    for (const [prop, v, duration, ease, delay = 0] of run.tracks) {
      const elapsed = now - run.start - delay;
      if (elapsed < duration) ended = false;
      if (elapsed < 0) continue;
      const f = ease(Math.min(elapsed / duration, 1));
      const n = v.length - 1;
      const i = Math.min(Math.floor(Math.min(Math.max(f, 0), 1) * n), n - 1);
      m[prop] = v[i]! + (v[i + 1]! - v[i]!) * (f * n - i);
    }
    return ended;
  };
  const startIdle = (start: number) => {
    const i = order[pointer++]!;
    if (pointer === order.length) {
      shuffle();
      pointer = 0;
    }
    const pull = int(4);
    const turn = 485 * (pull === 2 ? -1 : 1);
    const { angleX: x, angleY: y } = m;
    play(
      start,
      i === 0 && pull === 0
        ? [['angleY', [y, 48], 2300, EASE_OUT_QUINT], ['angleY', [48, 0], 500, overshoot, 2300]]
        : i === 0
          ? // Upstream's pullAnimation starts this turn from angleY, 0 at rest.
            [['angleX', [y, turn], 3000, EASE_OUT_QUINT], ['angleX', [turn, 0], 1000, overshoot, 3000]]
          : i === 1
            ? [['angleX', [x, 360], 8000, EASE_DEFAULT]]
            : i === 2
              ? [
                  ['angleX', [x, 184], 600, EASE_OUT],
                  ['angleY', [y, 50], 600, EASE_OUT],
                  ['angleX', [180, 0], 800, overshoot, 10000],
                  ['angleY', [60, 0], 800, overshoot, 10000],
                  ['angleX2', [0, 2, -3, 2, -1, 2, -3, 2, -1, 0], 10000, linear],
                ]
              : [['angleX', [x, 180], 600, EASE_DEFAULT], ['angleX', [180, 360], 600, EASE_DEFAULT, 2000]],
    );
  };
  const m: StarMotion = {
    angleX: 0,
    angleY: 0,
    angleX2: 0,
    get moving() {
      return !!(set || back);
    },
    tick(now) {
      const due = idleAt;
      if (due !== null && now >= due) {
        idleAt = null;
        if (m.moving) idleAt = due + 2000;
        else startIdle(due);
      }
      if (back && advance(back, now)) back = null;
      const run: Run | null = set;
      if (run && advance(run, now)) {
        set = null;
        run.done?.(now);
      }
    },
    down() {
      set = back = idleAt = null;
    },
    drag(distanceX, distanceY) {
      m.angleX += distanceX * 0.5;
      m.angleY += distanceY * 0.05;
    },
    up: startBack,
    // The view posts the push 16 ms after the release.
    tap(now, fx, fy) {
      set = back = null;
      if (Math.abs(m.angleX) > 10) return startBack(now);
      idleAt = null;
      const [x, y] = [(40 + int(30)) * fx, (40 + int(30)) * fy];
      play(now + 16, [
        ['angleX', [m.angleX, x], 220, EASE_OUT_QUINT],
        ['angleX', [x, 0], 600, overshoot, 220],
        ['angleY', [m.angleY, y], 220, EASE_OUT_QUINT],
        ['angleY', [y, 0], 600, overshoot, 220],
      ]);
    },
  };
  return m;
}

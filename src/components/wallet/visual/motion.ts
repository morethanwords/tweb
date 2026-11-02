// Curves and springs — the same as in the iOS demo (Rolling.swift, WalletFlow).

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Click and brake: a soft exponent, so the drum does not shoot out. */
export function ease(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 2.2);
}

function dampedSpring(raw: number, decay: number, swing: number): number {
  const t = clamp01(raw);
  const u = t * t * (3 - 2 * t);
  const fade = Math.exp(-decay * u);
  return 1 - fade * (Math.cos(swing * u) + decay / swing * Math.sin(swing * u));
}

/**
 * Pendulum with about six percent of overshoot: the line makes room for a
 * new glyph with it, and the glyph itself assembles with it.
 */
export function settle(t: number): number {
  return dampedSpring(t, 5.6, 6.2);
}

/** The drop's travel: about nine percent of overshoot. */
export function inertia(t: number): number {
  return dampedSpring(t, 4.2, 5.6);
}

/** Damped spring from 0 to 1: starts from zero, overshoots and settles. */
export function spring(t: number, damping = 7, frequency = 14): number {
  if(t <= 0) return 0;
  return 1 - Math.exp(-damping * t) * (Math.cos(frequency * t) + damping / frequency * Math.sin(frequency * t));
}

/** Response to a hit: down first, then damped. */
export function impact(t: number): number {
  if(t <= 0 || t >= 1.2) return 0;
  return Math.sin(2 * Math.PI * 2.2 * t) * Math.exp(-t / 0.2);
}

/** A CSS `linear()` easing sampled from a 0…1 curve. */
export function linearEasing(f: (t: number) => number, steps = 28): string {
  const points: number[] = [];
  for(let i = 0; i <= steps; i++) points.push(+f(i / steps).toFixed(4));
  return `linear(${points.join(', ')})`;
}

export const smooth = (k: number): number => {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
};

/** A promise delay — for storyboards. */
export const wait = (seconds: number): Promise<void> => new Promise((r) => setTimeout(r, seconds * 1000));

export const now = (): number => performance.now() / 1000;

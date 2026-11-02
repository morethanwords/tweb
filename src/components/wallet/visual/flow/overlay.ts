// What the send flow draws over the lifted history row: the running sheen
// while the transfer goes, and the star burst when it completes.

import {STAR_SPAN} from '@components/wallet/visual/flow/timing';
import {Vec2} from '@components/wallet/visual/math';

/**
 * The sheen over the lifted row: a slanted blue band from left to right,
 * starting smoothly and braking softly; a pass takes a second and a half,
 * then a pause. `t` — seconds since the lift.
 */
export function sheen(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cycle = 2.5, span = 1.5;
  const u = ((t + 0.2) % cycle) / span;
  if(u > 1) return;
  const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
  const fade = Math.sin(Math.PI * u);
  const x = (-0.25 + 1.5 * e) * w;
  const band = (width: number, peak: number, rgb: string) => {
    const grad = g.createLinearGradient(x - width, 0, x + width, width * 0.55);
    grad.addColorStop(0, `rgba(${rgb},0)`);
    grad.addColorStop(0.3, `rgba(${rgb},${peak * 0.35})`);
    grad.addColorStop(0.5, `rgba(${rgb},${peak})`);
    grad.addColorStop(0.7, `rgba(${rgb},${peak * 0.35})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    return grad;
  };
  const shape = () => {
    g.beginPath();
    g.roundRect(0, 0, w, h, 22);
  };
  g.save();
  shape();
  g.clip();
  g.fillStyle = band(150, 0.07 * fade, '92,204,255');
  g.fillRect(0, 0, w, h);
  g.fillStyle = band(60, 0.07 * fade, '48,161,245');
  g.fillRect(0, 0, w, h);
  g.restore();
  shape();
  g.lineWidth = 5;
  g.strokeStyle = band(120, 0.22 * fade, '92,204,255');
  g.stroke();
  shape();
  g.lineWidth = 1.2;
  g.strokeStyle = band(90, 0.85 * fade, '48,161,245');
  g.stroke();
}

interface BurstStar {
  angle: number,
  speed: number,
  size: number,
  life: number,
  delay: number,
  phase: number,
  tone: number
}

// The burst's stars — the same ones every time: their own seeded generator.
const STARS: BurstStar[] = (() => {
  let seed = 31;
  const rnd = (a: number, b: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return a + (b - a) * seed / 4294967296;
  };
  return Array.from({length: 34}, (_, i) => ({
    angle: i % 2 === 0 ? Math.PI + rnd(-0.75, 0.75) : rnd(0, 2 * Math.PI),
    speed: rnd(160, 760), size: rnd(2.6, 6.2), life: rnd(0.6, 1.15), delay: rnd(0, 0.09),
    phase: rnd(0, 2 * Math.PI), tone: Math.floor(rnd(0, 2.99))
  }));
})();
const TONES = ['48,161,245', '92,204,255', '33,120,247'];

/**
 * The transfer went through: four-pointed stars fly out of the gem across the
 * row — fast, then they brake viscously and fade. More along the row than
 * across it. `t` — seconds since the completion, `origin` — the gem's centre.
 */
export function starBurst(g: CanvasRenderingContext2D, w: number, h: number, t: number, origin: Vec2) {
  if(t <= 0 || t >= STAR_SPAN) return;
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, h, 22);
  g.clip();
  for(const star of STARS) {
    const age = t - star.delay;
    if(age <= 0 || age >= star.life) continue;
    const u = age / star.life;
    const k = 2.6;
    const distance = star.speed * (1 - Math.exp(-k * age)) / k;
    const px = origin[0] + Math.cos(star.angle) * distance;
    const py = origin[1] + Math.sin(star.angle) * distance * 0.45;
    const fade = Math.min(1, u / 0.12) * (1 - u * u);
    const twinkle = 0.72 + 0.28 * Math.sin(age * 19 + star.phase);
    const r = star.size * (0.55 + 0.45 * (1 - u)) * twinkle;
    const rgb = TONES[star.tone];
    const halo = g.createRadialGradient(px, py, 0, px, py, 2.4 * r);
    halo.addColorStop(0, `rgba(${rgb},${0.28 * fade})`);
    halo.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = halo;
    g.fillRect(px - 2.4 * r, py - 2.4 * r, 4.8 * r, 4.8 * r);
    const rot = star.phase + age * 2.4, R = r * 1.5;
    const point = (a: number, d: number): Vec2 => [px + Math.cos(a) * d, py + Math.sin(a) * d];
    g.beginPath();
    g.moveTo(...point(rot, R));
    for(let i = 1; i <= 4; i++) {
      const a = rot + i * Math.PI / 2;
      g.quadraticCurveTo(...point(a - Math.PI / 4, R * 0.18), ...point(a, R));
    }
    g.closePath();
    g.fillStyle = `rgba(${rgb},${fade})`;
    g.fill();
  }
  g.restore();
}

/**
 * The free pill's white fill burning down with its minute, as iOS draws it (`QrStudioBurn`, `QrStudioCodePillView`):
 * the fill pours in from the inline start, its front a liquid meniscus, then burns back with a ragged front that
 * glows at a few spots. The sparks it gives off are Android's (`QrShareView`): a bright fizz hugging the front, and a
 * trail flying on from it that the air lifts. Everything is a function of the time and a hash, so a frame needs no
 * state of the frames before. Pure: in the pill's own box, px, left to right; time in seconds.
 */
import clamp from '@helpers/number/clamp';
import smoothstep01 from '@helpers/number/smoothstep01';

/** How far past the pill's end the front starts (the ragged edge clears the round end), and how deep it is ragged */
const BAND = 10, EDGE = 4;
/** The fill pours in over this long */
export const REFILL = 0.36;
// the front gives off this many sparks a second of its fizz and of its trail, which live this long at most
const FIZZ_RATE = 110, FIZZ_LONGEST = 0.5, TRAIL_RATE = 70, TRAIL_LONGEST = 1.3;
// a spark fades with the way it has come from the front (px), and above the pill's top by this much
const FADE_DISTANCE = 44, CEILING = 48, CEILING_FADE = 16;

/**
 * When the fill last began to pour (s), from what level (0 to 1), and how long its minute runs from then; `Infinity` for
 * a code with no timer, whose fill pours in and stays
 */
export type BurnState = {issuedAt: number, pourFrom: number, lifetime: number};

/** A particle where it stands, its velocity (px/s, which it is drawn out along), and whether it is the glow under the others */
export type BurnParticle = {x: number, y: number, vx: number, vy: number, radius: number, alpha: number, halo: boolean};

const clamp01 = (x: number) => clamp(x, 0, 1);

/** iOS's `QrStudioSweep.hash`: 0 to 1 for two integers */
export function burnHash(x: number, y: number) {
  let h = (Math.imul(x, 0x8DA6B343) ^ Math.imul(y, 0xD8163841)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5BD1E995) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return (h & 0xFFFF) / 65535;
}

/** Smooth value noise over the plane, 0 to 1 */
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = burnHash(ix, iy), b = burnHash(ix + 1, iy), c = burnHash(ix, iy + 1), d = burnHash(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

const remaining = (state: BurnState, time: number) => Math.max(0, state.lifetime - (time - state.issuedAt));

/** How full the pour has got */
function pour(state: BurnState, time: number) {
  const x = clamp01((time - state.issuedAt) / REFILL);
  return state.pourFrom + (1 - state.pourFrom) * (0.55 * x + 0.45 * x * x);
}

/** How much of the pill the fill covers, 0 to 1: poured in, and burnt back by the minute */
export function burnLevel(state: BurnState, time: number) {
  return Math.min(state.lifetime === Infinity ? 1 : remaining(state, time) / state.lifetime, pour(state, time));
}

/** Where the fill's front stands, px from the pill's start; past its end by the band once full */
export function burnFront(state: BurnState, width: number, time: number) {
  return (width + BAND) * burnLevel(state, time);
}

/** 1 while the fill pours in, its front a meniscus; it hardens into the ragged burning edge over 150 ms after */
export function burnLiquid(state: BurnState, time: number) {
  return 1 - smoothstep01((time - state.issuedAt - REFILL) / 0.15);
}

/** Whether the fill pours: the front then moves every frame, and the pour's sparks fly */
export function isPouring(state: BurnState, time: number) {
  const since = time - state.issuedAt;
  return since >= -0.05 && since < REFILL + 0.5;
}

/** A state that has the fill pour again from where it stands, now, for a minute ending at `deadline` (`Infinity`: none) */
export function burnRestart(state: BurnState | undefined, time: number, deadline: number): BurnState {
  return {issuedAt: time, pourFrom: state ? clamp01(burnLevel(state, time)) : 0, lifetime: Math.max(1, deadline - time)};
}

/**
 * The minute's end has come for a fill that poured as the code was asked for (iOS's `adopt`): while it still pours the
 * minute is reckoned from the pour's start; after, the fill pours again from where it stands to the new minute
 */
export function burnAdopt(state: BurnState, time: number, deadline: number): BurnState {
  if(time - state.issuedAt < REFILL) return {...state, lifetime: Math.max(1, deadline - state.issuedAt)};
  return burnRestart(state, time, deadline);
}

const ragged = (y: number, time: number) => 0.55 * noise(y / 2.6 + 11, time * 0.7) + 0.45 * noise(y / 0.9 + 3, time * 1.6);

function meniscus(y: number, height: number, time: number) {
  const u = (y - height / 2) / (height / 2);
  return 7 * u * u + 0.9 * Math.sin(y * 0.7 + time * 16);
}

/** The pill's right edge at height y: its end is round */
function capsuleRight(y: number, width: number, height: number) {
  const r = height / 2, dy = y - r;
  return width - r + Math.sqrt(Math.max(0, r * r - dy * dy));
}

/**
 * What the fill covers, as the points of a polygon in the pill's box: `undefined` for nothing, `true` for all of it;
 * its front ragged while it burns, a meniscus while it pours
 */
export function burnCut(front: number, width: number, height: number, time: number, liquid: number): [number, number][] | true | undefined {
  if(front >= width + BAND) return true;
  if(front <= 0) return;
  const steps = 26, points: [number, number][] = [[-2, -2]];
  for(let i = 0; i <= steps; ++i) {
    const y = -2 + (height + 4) * i / steps;
    points.push([front - EDGE * ragged(y, time) * (1 - liquid) - meniscus(y, height, time) * liquid, y]);
  }

  points.push([-2, height + 2]);
  return points;
}

/** The sparks of the pour: a trail off its front as it flows, and a burst off the pill's end as it fills it */
function pourParticles(state: BurnState, width: number, height: number, time: number, into: BurnParticle[]) {
  const since = time - state.issuedAt;
  if(since < 0 || since >= REFILL + 0.5) return;
  const spark = (x: number, y: number, vx: number, vy: number, r: number, alpha: number) => {
    into.push({x, y, vx, vy, radius: r * 3.2, alpha: 0.3 * alpha, halo: true});
    into.push({x, y, vx, vy, radius: r, alpha, halo: false});
  };

  const trail = 18;
  for(let k = 0; k < trail; ++k) {
    const born = REFILL * k / trail;
    const h = (salt: number) => burnHash(k + 9000, salt);
    const life = 0.22 + 0.2 * h(3), tau = since - born;
    if(tau < 0 || tau >= life) continue;
    const y = 2 + (height - 4) * h(1);
    const bornFront = burnFront(state, width, state.issuedAt + born);
    const x0 = Math.min(bornFront - meniscus(y, height, state.issuedAt + born), capsuleRight(y, width, height));
    const k01 = tau / life, vx = -14 + 32 * h(4), vy = -(20 + 40 * h(5));
    spark(x0 + vx * tau, y + vy * tau + 18 * tau * tau, vx, vy + 36 * tau, (0.5 + 0.9 * h(8)) * (1 - 0.5 * k01), Math.pow(1 - k01, 1.2));
  }

  const s = since - REFILL;
  if(s < 0) return;
  const burst = 26;
  for(let k = 0; k < burst; ++k) {
    const h = (salt: number) => burnHash(k + 7000, salt);
    const life = 0.25 + 0.25 * h(3);
    if(s >= life) continue;
    const k01 = s / life;
    const angle = (h(1) - 0.5) * 2.5;
    const launch = 110 + 170 * h(4), distance = launch * (1 - Math.exp(-6 * s)) / 6, speed = launch * Math.exp(-6 * s);
    const y0 = height * (0.12 + 0.76 * h(2));
    const x0 = capsuleRight(y0, width, height) - 2;
    spark(
      x0 + Math.cos(angle) * distance, y0 + Math.sin(angle) * distance - 10 * s,
      Math.cos(angle) * speed, Math.sin(angle) * speed - 10,
      (0.7 + 1.4 * h(8)) * (1 - 0.6 * k01), Math.pow(1 - k01, 1.3)
    );
  }
}

/** Where the burning front stood at a height when a spark left it, and whether it had anything left there */
function frontAt(state: BurnState, width: number, height: number, y: number, born: number) {
  const front = burnFront(state, width, born);
  if(front <= 1) return;
  return Math.min(front - EDGE * ragged(y, born), capsuleRight(y, width, height));
}

/**
 * A spark of the front's (`QrShareView.chipEmitBurn` and `drawSparks`): it fades in fast and out slowly, and with
 * the way it has come; it thins as it goes, and fades away above the pill
 */
function burnSpark(into: BurnParticle[], from: {x: number, y: number}, at: {x: number, y: number, vx: number, vy: number}, size: number, k01: number, alpha: number, halo: boolean) {
  const distance = Math.hypot(at.x - from.x, at.y - from.y);
  let a = (k01 < 0.08 ? k01 / 0.08 : Math.pow(1 - (k01 - 0.08) / 0.92, 0.55)) * alpha * Math.exp(-distance / FADE_DISTANCE);
  if(at.y < -CEILING) a *= Math.max(0, 1 - (-CEILING - at.y) / CEILING_FADE);
  if(a <= 0.01) return;
  const radius = size / 2 * (1 - 0.4 * Math.min(1, distance / 70));
  into.push({...at, radius, alpha: a, halo: false});
  // a spark among them has a faint glow
  if(halo) into.push({...at, radius: radius * 2.2, alpha: a * 0.14, halo: true});
}

/**
 * The particles of a frame of a fill on its minute: the pour's sparks, a few spots glowing along the burning front,
 * its fizz and its trail. Halo particles are the soft glow under the others.
 */
export function burnParticles(state: BurnState, width: number, height: number, time: number): BurnParticle[] {
  const result: BurnParticle[] = [];
  if(state.lifetime === Infinity || !width) return result;
  pourParticles(state, width, height, time, result);

  const start = state.issuedAt + REFILL;
  if(time <= start) return result;
  const now = burnFront(state, width, time);
  if(now > 1) {
    const spots = 8;
    for(let j = 0; j < spots; ++j) {
      const y = 2 + (height - 4) * j / (spots - 1);
      const x = now - EDGE * ragged(y, time);
      if(x >= capsuleRight(y, width, height) - 0.5) continue;
      const flicker = noise(j * 3.1, time * 3.2);
      result.push({x, y, vx: 0, vy: 0, radius: 1.8 + 1.2 * flicker, alpha: 0.15 * (0.5 + 0.5 * flicker), halo: true});
    }
  }

  // the fizz: a dense bright band on the front, going a little on and up
  for(let k = Math.max(0, Math.floor((time - FIZZ_LONGEST - start) * FIZZ_RATE)), last = Math.floor((time - start) * FIZZ_RATE); k <= last; ++k) {
    const born = start + k / FIZZ_RATE, tau = time - born;
    const h = (salt: number) => burnHash(k + 50000, salt);
    const life = 0.25 + 0.25 * h(3);
    if(tau < 0 || tau >= life) continue;
    const y = height * h(1), front = frontAt(state, width, height, y, born);
    if(front === undefined) continue;
    const from = {x: front + 3 * h(2), y};
    const vx = 10 + 20 * h(4), vy = -(4 + 10 * h(5));
    burnSpark(result, from, {x: from.x + vx * tau, y: y + vy * tau, vx, vy}, 0.8 + 0.7 * h(8), tau / life, 0.9 + 0.1 * h(6), false);
  }

  // the trail, one in eight a spark: on from the front, slowing in the air, which lifts it, with a flutter
  for(let k = Math.max(0, Math.floor((time - TRAIL_LONGEST - start) * TRAIL_RATE)), last = Math.floor((time - start) * TRAIL_RATE); k <= last; ++k) {
    const born = start + k / TRAIL_RATE, tau = time - born;
    const h = (salt: number) => burnHash(k + 90000, salt);
    const life = 0.6 + 0.7 * h(3);
    if(tau < 0 || tau >= life) continue;
    const y = height * h(1), front = frontAt(state, width, height, y, born);
    if(front === undefined) continue;
    const spark = h(9) < 0.12;
    const from = {x: front + 2 + 10 * h(2), y};
    // drag 1.6/s along, 0.8/s up and down, under a lift of its own
    const vx0 = 40 + 70 * h(4), vy0 = -(10 + 30 * h(5)), lift = -(26 + 34 * h(6));
    const slowX = Math.exp(-1.6 * tau), slowY = Math.exp(-0.8 * tau), drift = lift / 0.8;
    let x = from.x + vx0 * (1 - slowX) / 1.6, py = y + drift * tau + (vy0 - drift) * (1 - slowY) / 0.8;
    const vx = vx0 * slowX, vy = drift + (vy0 - drift) * slowY;
    const speed = Math.hypot(vx, vy);
    if(speed > 1) {
      const flutter = 3 * Math.sin(tau * (4 + 3 * h(7)) + 6.283 * h(10));
      x += -vy / speed * flutter;
      py += vx / speed * flutter;
    }

    burnSpark(result, from, {x, y: py, vx, vy}, spark ? 1.4 + 0.8 * h(8) : 0.9 + 1.1 * h(8), tau / life, 1, spark);
  }

  return result;
}

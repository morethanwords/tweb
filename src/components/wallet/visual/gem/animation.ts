// The gem's motion, facet light and sparkles — a port of
// LuxDiamondAnimation.swift. On the card the gem is white (appearance white)
// and does not spin by itself: it is turned by the finger, and at rest it
// only sways and glints.

import {REFERENCE_PITCH} from '@components/wallet/visual/gem/geometry';
import {mat4, Mat4, Vec3, Vec4} from '@components/wallet/visual/math';

/** Cubic Bezier easing (ax, ay)–(bx, by), solved for x by bisection. */
export function easing(progress: number, ax: number, ay: number, bx: number, by: number): number {
  const x = Math.min(1, Math.max(0, progress));
  if(x === 0 || x === 1) return x;
  let low = 0, high = 1;
  for(let i = 0; i < 18; i++) {
    const t = (low + high) * 0.5, s = 1 - t;
    const bxv = 3 * s * s * t * ax + 3 * s * t * t * bx + t * t * t;
    if(bxv < x) low = t;
    else high = t;
  }
  const t = (low + high) * 0.5, s = 1 - t;
  return 3 * s * s * t * ay + 3 * s * t * t * by + t * t * t;
}

const SPIN_BOOST = 12.6;
const SPIN_DECAY = 0.95 / 1.4;
const PITCH_LIMIT = 1.1;
const SPRING_FREQUENCY = 3 * 2 * Math.PI;
const SPRING_DAMPING = 0.8;
const SWAY_AMPLITUDE = [0.17, 0.10];
const SWAY_PERIOD = [5.3, 8.9];

interface TapRotation {
  velocity: number,
  boost: number,
  decayTime: number,
  responseTime: number,
  isFast: boolean
}

/** The gem's yaw and pitch: springs, finger, inertia, spin-up. */
export class GemMotion {
  public yaw: number;
  public pitch: number;
  public isDragging: boolean;
  public zoom: number;
  public targetYaw: number;
  public targetPitch: number;
  public rawPitchOffset: number;
  public yawSpringVelocity: number;
  public pitchSpringVelocity: number;
  public yawVelocity: number;
  public swayPhase: number[];
  public swayScale: number;
  public tilt: number;
  public releaseDecay: number;
  public spinVelocity: number;
  public spinDecay: number;
  public lastDragTime: number;
  public timeSinceRelease: number;
  public tapRotation: TapRotation;
  /** The spin the gem had when the finger came down: a tap keeps its direction (iOS DiamondAnimation). */
  public spinAtPress: number;

  constructor() {
    this.yaw = 0;
    this.pitch = REFERENCE_PITCH;
    this.isDragging = false;
    this.zoom = 1;
    this.targetYaw = 0;
    this.targetPitch = REFERENCE_PITCH;
    this.rawPitchOffset = 0;
    this.yawSpringVelocity = 0;
    this.pitchSpringVelocity = 0;
    this.yawVelocity = 0;
    // Pitch drift: two incommensurate sines with random phases.
    this.swayPhase = [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI];
    this.swayScale = 1;
    this.tilt = 0;
    this.releaseDecay = 0;
    this.spinVelocity = 0;
    this.spinDecay = 0.7;
    this.lastDragTime = 0;
    this.timeSinceRelease = 10;
    this.tapRotation = null;
    this.spinAtPress = 0;
  }

  public clone(): GemMotion {
    const m = Object.assign(new GemMotion(), this);
    m.swayPhase = this.swayPhase;
    m.tapRotation = this.tapRotation && {...this.tapRotation};
    return m;
  }

  /**
   * A velocity push in rad/s; `decay` — in how many seconds it falls off by
   * a factor of e. Pushes add up.
   */
  public spin(velocity: number, decay: number) {
    this.spinVelocity += velocity;
    this.spinDecay = Math.max(decay, 0.05);
  }

  /** The spin set outright, not added: a tap's spin replaces what was going on. */
  public setSpin(velocity: number, decay: number) {
    if(this.isDragging) return;
    this.tapRotation = null;
    this.spinVelocity = velocity;
    this.spinDecay = Math.max(decay, 0.05);
  }

  public sway(time: number): number {
    const a = SWAY_AMPLITUDE, w0 = 2 * Math.PI / SWAY_PERIOD[0], w1 = 2 * Math.PI / SWAY_PERIOD[1];
    return this.swayScale * (a[0] * Math.sin(w0 * time + this.swayPhase[0]) + a[1] * Math.sin(w1 * time + this.swayPhase[1]));
  }

  public fling(direction: number) {
    if(this.isDragging) return;
    const velocity = this.yawSpringVelocity;
    this.targetYaw = this.yaw;
    this.yawSpringVelocity = 0;
    this.startRotation(direction, velocity, true);
  }

  public startRotation(direction: number, velocity: number, isFast: boolean) {
    this.tapRotation = {
      velocity,
      boost: direction * (isFast ? SPIN_BOOST : 3.36),
      decayTime: isFast ? SPIN_DECAY : 0.85,
      responseTime: isFast ? 0.08 : 0.16,
      isFast
    };
    this.yawVelocity = 0;
    this.timeSinceRelease = 0.75;
  }

  public begin(time: number) {
    this.spinAtPress = this.spinVelocity;
    this.isDragging = true;
    this.tapRotation = null;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    const offset = Math.min(PITCH_LIMIT - 0.001, Math.max(-PITCH_LIMIT + 0.001, this.pitch - REFERENCE_PITCH));
    this.rawPitchOffset = offset / (1 - Math.abs(offset) / PITCH_LIMIT);
    this.yawSpringVelocity = 0;
    this.pitchSpringVelocity = 0;
    this.yawVelocity = 0;
    this.spinVelocity = 0;
    this.lastDragTime = time;
  }

  public drag(dx: number, dy: number, scale: number, time: number) {
    if(!this.isDragging) return;
    const sensitivity = Math.PI / Math.max(scale, 100);
    const deltaYaw = dx * sensitivity;
    this.targetYaw += deltaYaw;
    this.rawPitchOffset += dy * sensitivity;
    this.targetPitch = REFERENCE_PITCH + this.rawPitchOffset / (1 + Math.abs(this.rawPitchOffset) / PITCH_LIMIT);
    const dt = Math.max(1 / 240, Math.min(time - this.lastDragTime, 0.1));
    this.yawVelocity = Math.min(5, Math.max(-5, deltaYaw / dt));
    this.lastDragTime = time;
  }

  public end(time: number, cancelled = false) {
    this.isDragging = false;
    this.timeSinceRelease = 0;
    this.targetPitch = REFERENCE_PITCH;
    // A released gem nods: the pitch spring gets a push.
    if(!cancelled) this.pitchSpringVelocity -= 2.6;
    // The finger's velocity turns into a spin with a long decay.
    if(this.releaseDecay > 0 && !cancelled && time - this.lastDragTime <= 0.12) {
      this.spinVelocity += this.yawVelocity;
      this.spinDecay = this.releaseDecay;
      this.yawVelocity = 0;
    }
    if(cancelled || time - this.lastDragTime > 0.12) this.yawVelocity = 0;
    if(cancelled) {
      this.targetYaw = this.yaw;
      this.yawSpringVelocity = 0;
      this.pitchSpringVelocity = 0;
    }
  }

  public step(dt: number, speed: number, time: number) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    let remaining = dt;
    while(remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      const stepTime = Math.max(0, time - remaining + step);
      if(!this.isDragging) {
        this.timeSinceRelease += step;
        const decay = Math.exp(-4.2 * step);
        this.targetYaw += this.yawVelocity * (1 - decay) / 4.2;
        this.yawVelocity *= decay;

        const spinFade = Math.exp(-step / this.spinDecay);
        const spun = this.spinVelocity * this.spinDecay * (1 - spinFade);
        this.spinVelocity *= spinFade;
        if(Math.abs(this.spinVelocity) < 0.002) this.spinVelocity = 0;
        this.targetYaw += spun;
        this.yaw += spun;

        let automatic: number;
        const r = this.tapRotation;
        if(r) {
          const previous = r.velocity;
          r.boost *= Math.exp(-step / r.decayTime);
          r.velocity += (speed + r.boost - r.velocity) * (1 - Math.exp(-step / r.responseTime));
          if(Math.abs(r.boost) < 0.001 && Math.abs(r.velocity - speed) < 0.001) {
            r.boost = 0;
            r.velocity = speed;
          }
          automatic = (previous + r.velocity) * 0.5 * step;
        } else {
          automatic = speed * step;
        }
        const travel = automatic * Math.min(this.timeSinceRelease / 0.75, 1);
        this.targetYaw += travel;
        this.yaw += travel;
      }
      if(!this.isDragging) this.targetPitch = REFERENCE_PITCH + this.sway(stepTime) + this.tilt;

      const stiffness = SPRING_FREQUENCY * SPRING_FREQUENCY;
      const damping = 2 * SPRING_DAMPING * SPRING_FREQUENCY;
      this.yawSpringVelocity += ((this.targetYaw - this.yaw) * stiffness - damping * this.yawSpringVelocity) * step;
      this.pitchSpringVelocity += ((this.targetPitch - this.pitch) * stiffness - damping * this.pitchSpringVelocity) * step;
      this.yaw += this.yawSpringVelocity * step;
      this.pitch += this.pitchSpringVelocity * step;
      remaining = Math.max(0, remaining - step);
    }
    const fullTurns = Math.trunc(this.yaw / (2 * Math.PI));
    this.yaw -= fullTurns * 2 * Math.PI;
    this.targetYaw -= fullTurns * 2 * Math.PI;
  }
}

// MARK: Facet light

function lightEasing(x: number): number {
  if(x === 0 || x === 1) return x;
  let low = 0, high = 1;
  for(let i = 0; i < 16; i++) {
    const t = (low + high) * 0.5, s = 1 - t;
    const bx = 1.5 * s * s * t + 1.5 * s * t * t + t * t * t;
    if(bx < x) low = t;
    else high = t;
  }
  const t = (low + high) * 0.5;
  return t * t * (3 - 2 * t);
}

const SWEEP_A: Vec4 = [-115.8, 40.3, -279.3, 240.6];
const SWEEP_B: Vec4 = [317, -341.9, 188, -131.9];
const mix4 = (a: Vec4, b: Vec4, t: number): Vec4 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t
];

function facetSweep(frame: number, times: number[]): Vec4 {
  for(let i = 1; i < times.length; i++) {
    if(frame < times[i]) {
      const t = easing((frame - times[i - 1]) / (times[i] - times[i - 1]), 0.333, 0, 0.667, 1);
      return i % 2 === 1 ? mix4(SWEEP_A, SWEEP_B, t) : mix4(SWEEP_B, SWEEP_A, t);
    }
  }
  return times.length % 2 === 0 ? SWEEP_B : SWEEP_A;
}

const CROWN_KEYS: Vec4[] = [[-53.8, 112.9, 50.5, -54.2], [12, 53.4, 143.3, -112.9], [-126.9, 168.8, 190.3, -192.8], [-53.8, 112.9, 50.5, -54.2]];
const PAVILION_KEYS: Vec4[] = [[-53.8, 80.7, 10.8, -165.2], [-34.2, 23.1, 104.6, -191], [-147.9, 125.5, -9.9, -106.1], [-53.8, 80.7, 10.8, -165.2]];
const SWEEP_KEYS = [-0.05, 0.84, -0.88, -0.05];

export interface LightState {
  crown: Vec4,
  pavilion: Vec4,
  /** Diagonal, studio phase, transmission. */
  sweep: Vec4,
  crownSweep: Vec4,
  rightCrownSweep: Vec4,
  leftCrownSweep: Vec4,
  pavilionSweep: Vec4,
  rightPavilionSweep: Vec4,
  leftPavilionSweep: Vec4
}

export function lightState(time: number): LightState {
  const frame = (Math.max(0, time * 60)) % 180;
  const sweepFrame = (Math.max(0, time * 60 * 0.5)) % 180;
  const times = [0, 39, 99, 179];
  const seg = frame < 39 ? 0 : (frame < 99 ? 1 : 2);
  const progress = Math.min(1, Math.max(0, (frame - times[seg]) / (times[seg + 1] - times[seg])));
  const t = lightEasing(progress);
  let transmission: number;
  if(frame < 25) transmission = 0.45 * frame / 25;
  else if(frame < 142) transmission = 0.45;
  else transmission = 0.45 * Math.max(0, (166 - frame) / 24);
  return {
    crown: mix4(CROWN_KEYS[seg], CROWN_KEYS[seg + 1], t),
    pavilion: mix4(PAVILION_KEYS[seg], PAVILION_KEYS[seg + 1], t),
    sweep: [SWEEP_KEYS[seg] + (SWEEP_KEYS[seg + 1] - SWEEP_KEYS[seg]) * t, frame / 180 * 2 * Math.PI, transmission, 0],
    crownSweep: facetSweep(sweepFrame, [11, 49, 127, 179]),
    rightCrownSweep: facetSweep(sweepFrame, [6, 44, 88]),
    leftCrownSweep: facetSweep(sweepFrame, [0, 38, 118, 167]),
    pavilionSweep: facetSweep(sweepFrame, [0, 38, 103, 163]),
    rightPavilionSweep: facetSweep(sweepFrame, [5, 43, 92]),
    leftPavilionSweep: facetSweep(sweepFrame, [0, 38, 112, 168])
  };
}

// MARK: Sparkles of the white gem (GramDiamondLight.json)

interface Keyframe {
  frame: number,
  value: number,
  ox: number,
  oy: number,
  ix: number,
  iy: number
}

const K = (frame: number, value: number, ox = 0.333, oy = 0, ix = 0.667, iy = 1): Keyframe => ({frame, value, ox, oy, ix, iy});
const WHITE_MAIN_SCALE = [K(0, 1, 0.333, 0, 0.833, 0.833), K(22.123, 0, 0.167, 0, 0.833, 1), K(83, 0, 0.41, 0, 0.12, 1), K(120, 1)];
const WHITE_MORPH = [K(0, 0, 0.167, 0.167, 0.833, 0.833), K(12, 1, 0.167, 0.167, 0.833, 0.833), K(102, 1, 0.167, 0.167, 0.4, 1), K(120, 0)];
const WHITE_CORE_SCALE = [K(0, 1), K(12.066, 1), K(23.463, 0.8), K(33.52, 1), K(43.576, 0.8), K(60.336, 1),
  K(70.391, 0.8), K(80.447, 1), K(90.502, 0.8), K(114.637, 1)];
const WHITE_HALO_SCALE = [K(5.363, 1), K(17.43, 1), K(28.826, 0.8), K(38.883, 1), K(48.939, 0.8), K(65.699, 1),
  K(75.754, 0.8), K(85.811, 1), K(95.865, 0.8), K(120, 1)];

function sampleKeys(keys: Keyframe[], frame: number): number {
  if(!(frame > keys[0].frame)) return keys[0].value;
  for(let i = 1; i < keys.length; i++) {
    if(frame < keys[i].frame) {
      const a = keys[i - 1], b = keys[i];
      const t = easing((frame - a.frame) / (b.frame - a.frame), a.ox, a.oy, a.ix, a.iy);
      return a.value + (b.value - a.value) * t;
    }
  }
  return keys[keys.length - 1].value;
}

export interface SparkleState {
  /** Main scale, morph, core, star. */
  shape: Vec4,
  haloScale: number
}

export function sparkleState(time: number): SparkleState {
  const frame = ((Math.max(0, time * 60)) % 180) * 121 / 180;
  return {
    shape: [sampleKeys(WHITE_MAIN_SCALE, frame), sampleKeys(WHITE_MORPH, frame), sampleKeys(WHITE_CORE_SCALE, frame), 1],
    haloScale: sampleKeys(WHITE_HALO_SCALE, frame)
  };
}

export interface MainPlacement {
  faceRotation: number,
  visibility: number
}

/**
 * The main sparkle sits on the broad facet that faces the camera, and fades
 * while the gem spins fast.
 */
export function mainPlacement(model: Mat4, angularSpeed: number): MainPlacement {
  const pitch = REFERENCE_PITCH;
  const front: Vec3 = [0, -Math.sin(pitch), Math.cos(pitch)];
  let best = -1, faceAngle = 0;
  for(let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const f = mat4.transformDirection(model, [Math.sin(angle), 0, Math.cos(angle)]);
    const facing = f[0] * front[0] + f[1] * front[1] + f[2] * front[2];
    if(facing > best) {
      best = facing;
      faceAngle = angle;
    }
  }
  const s = (v: number) => {
    const t = Math.min(1, Math.max(0, v));
    return t * t * (3 - 2 * t);
  };
  const limit = Math.PI * 12 / 180;
  const angle = Math.acos(Math.min(1, Math.max(-1, best)));
  const crossing = 2 * limit / Math.max(Math.abs(angularSpeed), 0.001);
  return {faceRotation: faceAngle, visibility: s(1 - angle / limit) * s((crossing - 0.06) / 0.34)};
}

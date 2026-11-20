import type {AndroidPreparedPoint} from '@components/mediaEditor/native/androidSamplePreparation';
import {androidBrushParameters, androidMovingRadius, androidStampSource, androidTapRadius} from '@components/mediaEditor/webgl/androidStampsContract';
import type {AndroidBrush, AndroidStamp} from '@components/mediaEditor/webgl/androidStampsContract';

export const androidStampPlacementVersion = 'android-render-placement-v1' as const;
export const androidStampPlacementSource = androidStampSource;

export type AndroidPlacementPath = {
  points: readonly AndroidPreparedPoint[];
  /** Native painting-space float half-extent, never CSS or normalized UI weight. */
  baseWeight: number;
  viewportScale: number;
  clear?: boolean;
  fullAlpha?: boolean;
};

export type AndroidPlacementFailureReason =
  | 'invalid-path'
  | 'non-positive-radius'
  | 'non-finite-step'
  | 'non-progressing-step'
  | 'negative-reserved-count'
  | 'invalid-buffer-position'
  | 'native-buffer-read-overflow'
  | 'record-budget'
  | 'point-budget'
  | 'attempt-budget'
  | 'allocation-failed'
  | 'reset-required';

export type AndroidPlacementResult =
  | {status: 'placed'; version: typeof androidStampPlacementVersion; stamps: readonly AndroidStamp[]; remainder: number; nativeReservedCount: number}
  | {status: 'empty'; version: typeof androidStampPlacementVersion; remainder: number; nativeReservedCount: 0}
  | {status: 'unsupported-native-buffer-state'; version: typeof androidStampPlacementVersion; reason: AndroidPlacementFailureReason; segment: number};

export type AndroidPlacementConfiguration = {
  version: typeof androidStampPlacementVersion;
  brush: AndroidBrush;
  /** Per-owner retained native record capacity and per-call output are bounded. */
  maxRecords?: number;
  maxPreparedPoints?: number;
  maxAttempts?: number;
};

/** Pure pinned Render.java/RenderState.java placement, with explicit bounded
 * divergence for unsafe/undefined native buffer states. No Input smoothing,
 * arrow construction, normalized-weight conversion, Matrix geometry or GPU work.
 *
 * Reproduces Draw's RESERVED records, not every attempted inclusive-loop write.
 * prepare/reset retain buffer capacity/content; resize discards content. State
 * remainder persists across paint calls, ignoring Path.remainder as native does.
 * Output records are fresh and never alias the retained buffer. Any unsupported
 * result poisons this instance until reset()/a path with clear=true. No partial
 * output from a failed call may be composited or described as rendered.
 *
 * Work O(points + attempted stamps + emitted records), retained storage bounded
 * by maxRecords. No full-history replay, per-point GPU work or quadratic copying.
 */
export class AndroidStampPlacementV1 {
  readonly version = androidStampPlacementVersion;
  readonly source = androidStampPlacementSource;
  private readonly brush: AndroidBrush;
  private readonly maxRecords: number;
  private readonly maxPoints: number;
  private readonly maxAttempts: number;
  private buffer: Float32Array;
  private capacity = 0;
  private count = 0;
  private position = 0;
  private remainder = 0;
  private failed = false;

  constructor(config: AndroidPlacementConfiguration) {
    const records = config.maxRecords ?? 65536;
    const points = config.maxPreparedPoints ?? 4096;
    const attempts = config.maxAttempts ?? 131072;
    if(config.version !== androidStampPlacementVersion || !Object.prototype.hasOwnProperty.call(androidBrushParameters, config.brush) ||
      !Number.isSafeInteger(records) || records < 256 || records > 1048576 ||
      !Number.isSafeInteger(points) || points < 1 || points > 1048576 ||
      !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 2097152) {
      throw new RangeError('Unsupported Android placement configuration');
    }
    this.brush = config.brush;
    this.maxRecords = records;
    this.maxPoints = points;
    this.maxAttempts = attempts;
  }

  /** Commit/clear boundary, not a preview boundary. Native capacity survives. */
  reset() {
    this.count = 0;
    this.position = 0;
    this.remainder = 0;
    this.failed = false;
  }

  place(path: AndroidPlacementPath): AndroidPlacementResult {
    const f = Math.fround;
    let segment = -1;
    const reject = (reason: AndroidPlacementFailureReason): AndroidPlacementResult => {
      this.failed = true;
      return {status: 'unsupported-native-buffer-state', version: this.version, reason, segment};
    };
    if(path.clear) this.reset();
    if(this.failed) return reject('reset-required');
    const finiteFloat = (value: number) => Number.isFinite(value) && Number.isFinite(f(value));
    if(!finiteFloat(path.baseWeight) || f(path.baseWeight) <= 0 || !finiteFloat(path.viewportScale) || f(path.viewportScale) <= 0 ||
      !Array.isArray(path.points)) return reject('invalid-path');
    if(path.points.length > this.maxPoints) return reject('point-budget');
    for(const point of path.points) {
      if(!point || !finiteFloat(point.x) || !finiteFloat(point.y) || !Number.isFinite(point.z) || point.z < 0 || typeof point.edge !== 'boolean') return reject('invalid-path');
    }
    // Empty native paths do not prepare/reset the retained buffer or remainder.
    if(!path.points.length) return {status: 'empty', version: this.version, remainder: this.remainder, nativeReservedCount: 0};
    const parameters = androidBrushParameters[this.brush];
    const weight = f(path.baseWeight), viewport = f(path.viewportScale);
    const spacing = f(parameters.spacing);
    const alpha = path.fullAlpha ? 1 : f(parameters.intensity);
    const bold = Math.min(1, f(alpha * f(1.15)));
    let fault: AndroidPlacementFailureReason;
    let attempts = 0;
    const resize = (initial = false) => {
      const next = initial ? 256 : Math.max(this.capacity * 2, 256);
      if(next > this.maxRecords) {
        fault = 'record-budget';
        return false;
      }
      try {
        this.buffer = new Float32Array(next * 5);
      } catch{
        fault = 'allocation-failed';
        return false;
      }
      this.capacity = next;
      this.position = 0;
      return true;
    };
    const append = (extra: number) => {
      const total = this.count + extra;
      if(extra < 0 || total < 0) {
        fault = 'negative-reserved-count';
        return false;
      }
      if(!Number.isSafeInteger(total) || total > this.maxRecords) {
        fault = 'record-budget';
        return false;
      }
      if(total > this.capacity && !resize()) return false;
      // Native doubles only once, even when requested count exceeds new capacity.
      this.count = total;
      return true;
    };
    const seek = (index: number) => {
      if(index < 0 || index >= this.capacity) return; // Native setPosition no-op.
      this.position = index * 5;
    };
    const add = (x: number, y: number, radius: number, angle: number, intensity: number, index = -1) => {
      if(++attempts > this.maxAttempts) {
        fault = 'attempt-budget';
        return false;
      }
      if((index !== -1 && index >= this.capacity) || this.position === this.buffer.length) {
        // Native addPoint discards prior records then signals failure to the loop.
        resize();
        return false;
      }
      if(index !== -1) this.position = index * 5;
      if(this.position < 0 || this.position + 5 > this.buffer.length) {
        fault = 'invalid-buffer-position';
        return false;
      }
      if(!finiteFloat(x) || !finiteFloat(y)) {
        fault = 'invalid-path';
        return false;
      }
      this.buffer.set([x, y, radius, angle, intensity], this.position);
      this.position += 5;
      return true;
    };
    const validRadius = (radius: number) => Number.isFinite(radius) && radius > 0;
    if(!this.buffer && !resize(true)) return reject(fault);
    this.count = 0; // RenderState.prepare does not rewind an existing buffer.
    const points = path.points;
    if(points.length === 1) {
      const radius = androidTapRadius(weight, this.brush, viewport);
      if(!validRadius(radius)) return reject('non-positive-radius');
      if(!append(1) || !add(points[0].x, points[0].y, radius, 0, alpha, 0)) return reject(fault ?? 'invalid-buffer-position');
    } else for(let i = 1; i < points.length; ++i) {
      segment = i - 1;
      const a = points[i - 1], b = points[i];
      // Point.getDistanceTo returns float, despite double x/y/z and caller type.
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = f(Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)));
      const radius = androidMovingRadius(weight, this.brush, viewport, b.z);
      if(!validRadius(radius)) return reject('non-positive-radius');
      const step = Math.max(1, f(spacing * radius));
      if(!Number.isFinite(distance) || !Number.isFinite(step) || step <= 0) return reject('non-finite-step');
      const reserved = Math.ceil((distance - this.remainder) / step);
      const priorCount = this.count;
      if(!append(reserved)) return reject(fault);
      seek(priorCount);
      const inverseDistance = 1 / distance;
      const unitX = distance > 0 ? dx * inverseDistance : 1;
      const unitY = distance > 0 ? dy * inverseDistance : 1;
      const angle = f(Math.atan2(dy, dx)); // Every pinned supported brush angle is 0.
      let x = a.x + unitX * this.remainder, y = a.y + unitY * this.remainder;
      let offset = this.remainder, success = true, head = a.edge;
      for(; offset <= distance;) {
        success = add(x, y, radius, angle, head ? bold : alpha);
        if(fault) return reject(fault);
        if(!success) break;
        x += unitX * step;
        y += unitY * step;
        head = false;
        const next = offset + step;
        if(!Number.isFinite(next) || next <= offset) return reject('non-progressing-step');
        offset = next;
      }
      if(success && b.edge) {
        if(!append(1)) return reject(fault);
        add(b.x, b.y, radius, angle, bold); // Native ignores this tail add result.
        if(fault) return reject(fault);
      }
      this.remainder = offset - distance;
      if(!Number.isFinite(this.remainder)) return reject('non-progressing-step');
    }
    if(this.count * 5 > this.buffer.length) return reject('native-buffer-read-overflow');
    const stamps: AndroidStamp[] = [];
    try {
      for(let i = 0; i < this.count; ++i) {
        const at = i * 5;
        stamps.push({x: this.buffer[at], y: this.buffer[at + 1], radius: this.buffer[at + 2], angle: this.buffer[at + 3], intensity: this.buffer[at + 4]});
      }
    } catch{
      return reject('allocation-failed');
    }
    // Draw consumes precisely count records, including native retained/zero data.
    if(this.count > 0) this.position = this.count * 5;
    return {status: 'placed', version: this.version, stamps, remainder: this.remainder, nativeReservedCount: this.count};
  }
}

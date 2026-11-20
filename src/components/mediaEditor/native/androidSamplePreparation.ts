import clamp from '@helpers/number/clamp';

/** Input.java / Point.java at Telegram-Android 21f7d109da6ab3506c9e9577f98c6a38771ab335.
 * Versioned input preparation only: NOT a renderer, CSS-width adapter or saved-stroke format.
 * Coordinates must already be inverse-mapped into Android painting space (including y flip).
 * Density is Android dp density, scale is Input.process's viewport scale, z dimensionless.
 * Java float operations intentionally round individually. Shared BezierEasing has a different
 * solver; the shared 2D distance helper omits z. Neither implements this contract.
 * Supported subset: radial/arrow, shouldDraw=true, masking=false, no helper shapes, fill,
 * ignoreOnce or stylus-button brush switching. No haptics, stamp spacing or path remainders.
 * Golden evidence is JVM-source execution, not Android-device or raster parity. Math trig
 * may differ in last double bits across runtimes; float operation ordering is preserved.
 */
export type AndroidPreparedPoint = Readonly<{x: number, y: number, z: number, edge: boolean}>;
export type AndroidPreparedCommand =
  | {kind: 'paint', points: readonly AndroidPreparedPoint[], clear: boolean, fill: false, baseWeight: number}
  | {kind: 'began'}
  | {kind: 'finished', moved: boolean}
  | {kind: 'clear'}
  | {kind: 'commit'}
  | {kind: 'arrow', angle: number, location: AndroidPreparedPoint, z: number, length: number};

export type AndroidInputSampleV1 = {
  action: 'down' | 'move' | 'up' | 'cancel';
  x: number;
  y: number;
  /** Finite normalized pressure [0,1]; out-of-contract inputs are rejected, not remapped. */
  pressure: number;
  tool: 'stylus' | 'finger';
  viewportScale: number;
  /** Native current-event-only policy: deliberately never inspected or replayed. */
  historicalSamples?: unknown;
  stylusPrimaryButton?: boolean;
};

export type AndroidSamplePreparationConfigurationV1 = {
  version: 1;
  brush: 'radial' | 'arrow';
  androidDensity: number;
  baseWeight: number;
  /** Explicitly restricted to the characterized JVM capabilities. No silent fallback. */
  shapeRecognition: 'disabled';
  longPressFill: 'disabled';
  processingClockMs: () => number;
};

const f = Math.fround;
const point = (x: number, y: number, z: number, edge = false): AndroidPreparedPoint => ({x, y, z, edge});
const midpoint = (a: AndroidPreparedPoint, b: AndroidPreparedPoint) => point((a.x + b.x) * .5, (a.y + b.y) * .5, (a.z + b.z) * .5);
const distance = (x: number, y: number, z: number, b: AndroidPreparedPoint) => f(Math.sqrt(Math.pow(x - b.x, 2) + Math.pow(y - b.y, 2) + Math.pow(z - b.z, 2)));
const finite = (value: number) => Number.isFinite(value);
const finiteFloat = (value: number) => finite(value) && finite(f(value));
const positiveFloat = (value: number) => finiteFloat(value) && f(value) > 0;

// CubicBezierInterpolator(0,.5,0,1), including its 1e-3 Newton cutoff.
function pressureWeight(pressure: number) {
  let x = pressure;
  for(let i = 1; i < 14; i++) {
    const z = f(f(x * f(x * x)) - pressure);
    if(Math.abs(z) < .001) break;
    x = f(x - f(z / f(x * f(3 * x))));
  }
  return Math.max(f(.1), f(x * f(1.5 + f(x * f(x * -.5)))));
}

/** Constant retained state, <=49 generated points per accepted event. No full-stroke replay
 * or arbitrary stroke cap: total work/output is O(n) over n raw events, caller owns outputs.
 * Rejected events allocate no points. Emitted points are never reused/mutated by this object.
 */
export class AndroidSamplePreparationV1 {
  readonly version = 1 as const;
  private velocity = 0;
  private lastVelocityUpdate = 0;
  private points: AndroidPreparedPoint[] = [];
  private realPointsCount = 0;
  private beganDrawing = false;
  private hasMoved = false;
  private first = true;
  private clearBuffer = false;
  private lastLocation: AndroidPreparedPoint;
  private lastThickLocation: AndroidPreparedPoint;
  private lastAngle = 0;
  private lastAngleSet = false;
  private arrow: Extract<AndroidPreparedCommand, {kind: 'arrow'}>;
  private lastArrowT = 0;
  private readonly density: number;
  private weight: number;
  private arrowBrush: boolean;
  private readonly clock: () => number;

  constructor(config: AndroidSamplePreparationConfigurationV1) {
    if(config.version !== 1 || !['radial', 'arrow'].includes(config.brush) ||
      config.shapeRecognition !== 'disabled' || config.longPressFill !== 'disabled' ||
      !positiveFloat(config.androidDensity) || !positiveFloat(config.baseWeight) || typeof config.processingClockMs !== 'function') {
      throw new Error('Unsupported Android sample preparation configuration');
    }
    this.density = f(config.androidDensity);
    this.weight = f(config.baseWeight);
    this.arrowBrush = config.brush === 'arrow';
    this.clock = config.processingClockMs;
  }

  /** RenderView owns one Input across strokes, while brush/weight are read anew.
   * Only configure between gestures: preserve native velocity/clock history, not
   * a half-finished path. Density/clock belong to the owner's lifetime. */
  configureStroke(config: Pick<AndroidSamplePreparationConfigurationV1, 'brush' | 'baseWeight'>) {
    if(this.beganDrawing || this.points.length || this.arrow || !['radial', 'arrow'].includes(config.brush) || !positiveFloat(config.baseWeight)) {
      throw new Error('Android input configuration requires an idle supported stroke');
    }
    this.weight = f(config.baseWeight);
    this.arrowBrush = config.brush === 'arrow';
  }

  private now() {
    const time = this.clock();
    if(!Number.isSafeInteger(time)) throw new Error('Android processing clock must supply integer milliseconds');
    return time;
  }

  private dp(value: number) {
    // Java double-to-int conversion saturates at Integer.MAX_VALUE.
    return Math.min(2147483647, Math.ceil(f(this.density * value)));
  }

  private moderationFactor() {
    const rate = this.arrowBrush ? .25 : 1;
    return f(rate + f(clamp(f(this.realPointsCount / 16), 0, 1) * f(1 - rate)));
  }

  private paint(points: readonly AndroidPreparedPoint[]): AndroidPreparedCommand {
    const command: AndroidPreparedCommand = {kind: 'paint', points, clear: this.clearBuffer, fill: false, baseWeight: this.weight};
    this.clearBuffer = false;
    return command;
  }

  private smooth() {
    const [a, b, c] = this.points;
    const start = midpoint(b, a), end = midpoint(c, b);
    const count = Math.min(48, Math.max(24, Math.floor(distance(start.x, start.y, start.z, end))));
    const output: AndroidPreparedPoint[] = [];
    const step = f(1 / count);
    const factor = this.moderationFactor();
    let t = 0;
    for(let j = 0; j < count; j++) {
      const u = f(1 - t);
      const squared = f(t * t), inverseSquared = f(u * u);
      const a1 = Math.pow(u, 2), a2 = f(f(2 * u) * t), a3 = squared;
      output.push(point(
        start.x * inverseSquared + 2 * b.x * t * u + end.x * squared,
        start.y * inverseSquared + 2 * b.y * t * u + end.y * squared,
        1 + (start.z * a1 + b.z * a2 + end.z * a3 - 1) * factor,
        this.first
      ));
      this.first = false;
      t = f(t + step);
    }
    output.push(end); // Native deliberately skips second moderation/edge on this midpoint.
    this.points[0] = b;
    this.points[1] = c;
    this.points.length = 2;
    return this.paint(output);
  }

  process(sample: AndroidInputSampleV1, emit: (command: AndroidPreparedCommand) => void) {
    if(this.arrow) return; // Native ignores input while its arrow animator owns the stroke.
    if((sample.action !== 'down' && sample.action !== 'move' && sample.action !== 'up' && sample.action !== 'cancel') ||
      (sample.tool !== 'stylus' && sample.tool !== 'finger') || sample.stylusPrimaryButton ||
      !finiteFloat(sample.x) || !finiteFloat(sample.y) || !finite(sample.pressure) ||
      !positiveFloat(sample.viewportScale) || sample.pressure < 0 || sample.pressure > 1) {
      throw new Error('Unsupported Android input sample (no stylus brush switching)');
    }
    const scale = f(sample.viewportScale);
    const dt = this.now() - this.lastVelocityUpdate;
    this.velocity = clamp(f(this.velocity - f(f(dt) / 125)), f(.6), 1);
    if(this.arrowBrush) this.velocity = f(1 - this.velocity);
    this.lastVelocityUpdate = this.now();
    const rawWeight = sample.tool === 'stylus' ? pressureWeight(f(sample.pressure)) : this.velocity;
    // location's weight is Java float; smoothPoint's z moderation is Java double.
    const factor = this.moderationFactor();
    const z = f(1 + f(f(rawWeight - 1) * factor));
    const x = f(sample.x), y = f(sample.y);

    if(sample.action === 'down' || sample.action === 'move') {
      if(!this.beganDrawing) {
        this.beganDrawing = true;
        this.hasMoved = false;
        this.first = true;
        this.lastLocation = point(x, y, z);
        this.now(); // drawingStart; long-press/shape behavior explicitly disabled.
        this.points[0] = this.lastLocation;
        this.points.length = 1;
        this.realPointsCount = 1;
        this.lastAngleSet = false;
        this.clearBuffer = true;
      } else {
        // Avoid allocating the location for rejected raw samples, without dropping z distance.
        const dist = distance(x, y, z, this.lastLocation);
        if(dist < f(this.dp(5) / scale)) return;
        if(!this.hasMoved) {
          emit({kind: 'began'});
          this.hasMoved = true;
        }
        const location = point(x, y, z);
        this.points.push(location);
        this.now(); // native elapsed drawing-time check, even with detector disabled.
        ++this.realPointsCount;
        if(this.points.length === 3) {
          const b = this.points[1];
          const angle = f(Math.atan2(location.y - b.y, location.x - b.x));
          if(!this.lastAngleSet) {
            this.lastAngle = angle;
            this.lastAngleSet = true;
          } else {
            const factor = clamp(f(dist / f(this.dp(16) / scale)), 0, 1);
            if(factor > f(.4)) {
              const inverse = f(1 - factor);
              this.lastAngle = f(Math.atan2(inverse * Math.sin(this.lastAngle) + factor * Math.sin(angle), inverse * Math.cos(this.lastAngle) + factor * Math.cos(angle)));
            }
          }
          emit(this.smooth());
        }
        this.lastLocation = location;
        if(dist > f(this.dp(8) / scale)) this.lastThickLocation = location;
        this.velocity = clamp(f(this.velocity + f(f(dt) / 75)), f(.6), 1);
      }
      return;
    }

    if(sample.action === 'cancel') {
      emit({kind: 'clear'});
    } else {
      let commit = true;
      if(!this.hasMoved) emit(this.paint([point(x, y, z, true)]));
      else if(this.points.length) {
        // Every processed triplet already retained two raw points: UP never inserts location.
        emit(this.paint(this.points.slice()));
        if(this.arrowBrush) {
          commit = false;
          const thick = this.lastThickLocation?.z ?? z;
          this.arrow = {
            kind: 'arrow', angle: this.lastAngle, location: this.points[this.points.length - 1], z: thick,
            length: f(f(this.weight * f(thick)) * 12)
          };
          this.lastArrowT = 0;
          emit(this.arrow);
        }
      }
      if(commit) emit({kind: 'commit'});
    }
    this.points.length = 0;
    this.realPointsCount = 0;
    this.lastAngleSet = false;
    this.beganDrawing = false;
    if(sample.action === 'up') emit({kind: 'finished', moved: this.hasMoved});
    // Native does NOT reset velocity, lastLocation, lastThickLocation or lastAngle.
  }

  /** Owner supplies actual animated values; no invented timer or automatic 0/.5/1 policy. */
  advanceArrow(animatedValue: number, emit: (command: AndroidPreparedCommand) => void) {
    if(!this.arrow) throw new Error('No pending Android arrow');
    if(!finite(animatedValue) || animatedValue < 0 || animatedValue > 1) throw new Error('Invalid arrow animated value');
    const t = f(animatedValue);
    if(t < this.lastArrowT) throw new Error('Invalid arrow animated value');
    const {angle, location, z, length} = this.arrow;
    for(const sign of [-1, 1]) {
      const cos = Math.cos(angle + sign * Math.PI / 4 * 3.3);
      const sin = Math.sin(angle + sign * Math.PI / 4 * 3.5);
      emit(this.paint([
        point(location.x + cos * length * this.lastArrowT, location.y + sin * length * this.lastArrowT, z),
        point(location.x + cos * length * t, location.y + sin * length * t, z, true)
      ]));
    }
    this.lastArrowT = t;
  }

  finishArrow(emit: (command: AndroidPreparedCommand) => void) {
    if(!this.arrow) throw new Error('No pending Android arrow');
    this.arrow = undefined;
    emit({kind: 'commit'});
  }

  /** Diagnostic copy only, never used per point by a renderer. */
  snapshot() {
    return {
      velocity: this.velocity, pointsCount: this.points.length, realPointsCount: this.realPointsCount,
      beganDrawing: this.beganDrawing, lastAngle: this.lastAngle,
      lastThickLocation: this.lastThickLocation ?? null, lastLocation: this.lastLocation ?? null
    };
  }
}

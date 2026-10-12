/*
 * Waves of soft radial blobs that swell with an audio level and keep wobbling gently while it is
 * quiet: the microphone button's (microphoneBlobs.ts) and a speaking participant's avatar's
 * (avatarBlobs.ts).
 *
 * tdesktop's model — Ui::Paint::RadialBlob / Blobs (lib_ui/ui/paint/blob.cpp, blobs.cpp) and the
 * BlobsWidget in ui/controls/call_mute_button.cpp — drawn with the curve math of telegram-react's
 * BlobDrawable.js, which is the blob Android draws too. Unlike those two, every step is scaled by
 * the frame time, so a 120 Hz screen does not run the waves twice as fast.
 */

import {ColorRgb, mixColors} from '@helpers/color';
import liteMode from '@helpers/liteMode';
import {MAX_SPEED, MIN_SPEED, getBlobSpeed} from '@components/lineBlobDrawable';

const FRAME_DURATION = 1000 / 60;
// a level reaches what the analyser reported in this long (kLevelDuration)
const LEVEL_DURATION = 100 + 500 * 0.33;
// the blobs grow in and shrink away in this long (kBlobsScaleEnterDuration)
const ENTER_DURATION = 400;
// a state's colours cross-fade into the next one's (kSwitchStateDuration)
const SWITCH_DURATION = 120;
// how often the level is asked for; it eases between readings anyway
const LEVEL_READ_INTERVAL = 50;
// An audio level spans a quiet room (-50 dBFS) to someone close and loud (-10 dBFS); the waves
// take that range, in decibels, as 0..1.
const LEVEL_FLOOR_DB = -50;
const LEVEL_RANGE_DB = 40;

/** A linear level (a microphone's RMS, an RTP source's audioLevel) as the 0..1 the waves swell with. */
export function getBlobsLevel(level: number) {
  if(!(level > 0)) {
    return 0;
  }

  return Math.min(1, Math.max(0, (20 * Math.log10(level) - LEVEL_FLOOR_DB) / LEVEL_RANGE_DB));
}

const easeOutBack = (t: number) => {
  const s = 1.70158;
  return (t - 1) * (t - 1) * ((s + 1) * (t - 1) + s) + 1;
};

const easeInCirc = (t: number) => 1 - Math.sqrt(1 - t * t);

const randomSigned = () => Math.random() * 2 - 1;

export class RadialBlob {
  private readonly segmentLength: number;
  private readonly segmentAngle: number;
  private readonly progress: Float64Array;
  private readonly speed: Float64Array;
  private readonly radius: Float64Array;
  private readonly radiusNext: Float64Array;
  private readonly angle: Float64Array;
  private readonly angleNext: Float64Array;
  private level = 0;

  constructor(
    private readonly count: number,
    private readonly minScale: number,
    private readonly minRadius: number,
    private readonly maxRadius: number
  ) {
    this.segmentLength = 4 / 3 * Math.tan(Math.PI / (2 * count));
    this.segmentAngle = 2 * Math.PI / count;
    this.progress = new Float64Array(count);
    this.speed = new Float64Array(count);
    this.radius = new Float64Array(count);
    this.radiusNext = new Float64Array(count);
    this.angle = new Float64Array(count);
    this.angleNext = new Float64Array(count);

    for(let i = 0; i < count; ++i) {
      this.generateSpeed(i);
      this.generateNext(i); // the next values
      this.generateNext(i); // and, moved over, the current ones
    }
  }

  private generateSpeed(i: number) {
    this.progress[i] = 0;
    this.speed[i] = getBlobSpeed();
  }

  private generateNext(i: number) {
    this.angle[i] = this.angleNext[i];
    this.angleNext[i] = this.segmentAngle * i + randomSigned() * this.segmentAngle * 0.05;
    this.radius[i] = this.radiusNext[i];
    this.radiusNext[i] = this.minRadius + Math.random() * (this.maxRadius - this.minRadius);
  }

  public update(level: number, rate: number) {
    this.level = level;
    const step = (MIN_SPEED + level * MAX_SPEED) * rate;
    for(let i = 0; i < this.count; ++i) {
      if((this.progress[i] += step * this.speed[i]) >= 1) {
        this.generateSpeed(i);
        this.generateNext(i);
      }
    }
  }

  /** Into a context already translated to the centre, with its fill style set. */
  public paint(context: CanvasRenderingContext2D, outerScale: number) {
    const scale = (this.minScale + (1 - this.minScale) * this.level) * outerScale;
    if(scale <= 0) {
      return;
    }

    const {count, progress, radius, radiusNext, angle, angleNext, segmentLength} = this;
    context.save();
    context.scale(scale, scale);
    context.beginPath();
    for(let i = 0; i < count; ++i) {
      const j = i + 1 < count ? i + 1 : 0;
      const r1 = radius[i] + (radiusNext[i] - radius[i]) * progress[i];
      const r2 = radius[j] + (radiusNext[j] - radius[j]) * progress[j];
      const a1 = angle[i] + (angleNext[i] - angle[i]) * progress[i];
      const a2 = angle[j] + (angleNext[j] - angle[j]) * progress[j];
      const l = segmentLength * (r1 + r2) / 2;
      const sin1 = Math.sin(a1), cos1 = Math.cos(a1);
      const sin2 = Math.sin(a2), cos2 = Math.cos(a2);
      // (0, -r) rotated by the segment's angle, and its tangent handles
      if(!i) {
        context.moveTo(r1 * sin1, -r1 * cos1);
      }

      context.bezierCurveTo(
        l * cos1 + r1 * sin1, l * sin1 - r1 * cos1,
        -l * cos2 + r2 * sin2, -l * sin2 - r2 * cos2,
        r2 * sin2, -r2 * cos2
      );
    }

    context.closePath();
    context.fill();
    context.restore();
  }
}

/**
 * One canvas of blobs: their level, their entrance and exit, their colours' cross-fade. A
 * subclass says what the blobs look like and paints them. The canvas animates only while the
 * waves are shown or on their way out.
 */
export default abstract class GroupCallBlobs {
  public readonly canvas: HTMLCanvasElement;
  protected readonly context: CanvasRenderingContext2D;
  protected readonly blobs: RadialBlob[];
  protected readonly size: number;
  private readonly dpr: number;
  private readonly readLevel: () => number | undefined;
  private readonly onGone: () => void;

  private raf: number;
  private lastTime: number;
  private lastLevelRead = 0;
  protected level = 0;
  private levelTo = 0;
  private levelDelta = 0;

  private hidden = true;
  private enterStart = 0;

  private colorsFrom: ColorRgb[];
  private colorsTo: ColorRgb[];
  private colorsStart = 0;
  private colorsKey: string;

  /**
   * @param options.size the canvas's side, in CSS pixels
   * @param options.readLevel the level (linear, see getBlobsLevel) right now, read while the waves run
   * @param options.onGone once the waves are hidden and their exit is over
   */
  constructor(options: {
    blobs: RadialBlob[],
    size: number,
    className: string,
    readLevel?: () => number | undefined,
    onGone?: () => void
  }) {
    this.blobs = options.blobs;
    this.size = options.size;
    this.readLevel = options.readLevel;
    this.onGone = options.onGone;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    const canvas = this.canvas = document.createElement('canvas');
    canvas.classList.add(options.className);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = canvas.height = Math.round(this.size * this.dpr);
    canvas.style.setProperty('--size', this.size + 'px');
    this.context = canvas.getContext('2d');
  }

  /** The new fills for these colours (already mixed mid-fade). */
  protected abstract updateFills(colors: ColorRgb[]): void;

  /** The blobs, into the context translated to the canvas's centre. */
  protected abstract paint(enter: number): void;

  /** Every frame, with how far the waves are in (0 once they are gone). */
  protected onFrame(enter: number) {}

  protected switchColors(to: ColorRgb[]) {
    if(this.colorsTo && to.join() === this.colorsTo.join()) {
      return;
    }

    // a switch caught mid-fade starts from where the fade got to
    this.colorsFrom = this.colorsTo ? this.getColors(performance.now()) : to;
    this.colorsTo = to;
    this.colorsStart = performance.now();
    this.schedule();
  }

  /** The level to swell to, 0..1. */
  public setLevel(value: number) {
    const to = Math.min(1, Math.max(0, value));
    if(this.hidden || to === this.levelTo) {
      return;
    }

    this.levelTo = to;
    this.levelDelta = (to - this.level) / LEVEL_DURATION;
  }

  public setHidden(hidden: boolean) {
    if(this.applyHidden(hidden, performance.now())) {
      this.schedule();
    }
  }

  private applyHidden(hidden: boolean, now: number) {
    // * the waves wobble and grow: decorative motion, which reduced animations go without
    hidden ||= !liteMode.isAvailable('motion');
    if(this.hidden === hidden) {
      return false;
    }

    this.hidden = hidden;
    this.enterStart = now;
    if(hidden) {
      this.levelTo = this.levelDelta = 0;
    }

    return true;
  }

  public destroy() {
    if(this.raf !== undefined) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }
  }

  private schedule() {
    if(this.raf === undefined && this.colorsTo) {
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private getColors(now: number): ColorRgb[] {
    const progress = Math.min(1, (now - this.colorsStart) / SWITCH_DURATION);
    if(progress >= 1) {
      return this.colorsTo;
    }

    return this.colorsTo.map((to, i) => mixColors(to, this.colorsFrom[i], progress));
  }

  private frame = (now: number) => {
    this.raf = undefined;
    if(!this.canvas.isConnected) {
      return;
    }

    // animations switched off while the waves run: they go, as hidden ones do
    this.applyHidden(this.hidden, now);

    let dt = now - this.lastTime;
    this.lastTime = now;
    if(dt > 20 || dt < 0) {
      dt = FRAME_DURATION;
    }

    if(this.readLevel && now - this.lastLevelRead >= LEVEL_READ_INTERVAL) {
      this.lastLevelRead = now;
      this.setLevel(getBlobsLevel(this.readLevel() ?? 0));
    }

    if(this.level !== this.levelTo) {
      this.level += this.levelDelta * dt;
      if(this.levelDelta > 0 ? this.level > this.levelTo : this.level < this.levelTo) {
        this.level = this.levelTo;
      }
    }

    const enterProgress = Math.min(1, (now - this.enterStart) / ENTER_DURATION);
    const gone = this.hidden && enterProgress >= 1;
    const enter = gone ? 0 : this.hidden ? 1 - easeInCirc(enterProgress) : easeOutBack(enterProgress);
    const rate = dt / FRAME_DURATION;
    this.blobs.forEach((blob) => blob.update(this.level, rate));

    const colors = this.getColors(now);
    const colorsKey = colors.join();
    if(colorsKey !== this.colorsKey) {
      this.colorsKey = colorsKey;
      this.updateFills(colors);
    }

    const {context, size, dpr} = this;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onFrame(enter);
    if(gone) {
      this.onGone?.();
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
    this.paint(enter);

    this.raf = requestAnimationFrame(this.frame);
  };
}

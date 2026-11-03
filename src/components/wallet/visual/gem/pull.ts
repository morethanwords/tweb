// A finger on a gem (iOS InteractiveDiamondComponent's press): its moves turn the gem, the release throws it at the
// finger's speed over its last 80 ms, and a short press that hardly moved is a tap.

import type {Vec2} from '@components/wallet/visual/math';

/** a tap: shorter than this, seconds, and moving less than this, px (iOS: 0.25 s, 10 pt) */
const TAP_TIME = 0.25;
const TAP_TRAVEL = 10;
/** the release's speed is the finger's over this long, seconds */
const SPEED_WINDOW = 0.08;
/** a pull of this many points turns a held gem by the drag's unit (iOS, for a gem that is no wallet card's) */
export const GEM_DRAG_SCALE = 220;

export class GemPull {
  public readonly pointerId: number;
  private start: Vec2;
  private last: Vec2;
  private startTime: number;
  /** [time, clientX] */
  private samples: Vec2[];

  constructor(e: PointerEvent, now: number) {
    this.pointerId = e.pointerId;
    this.start = [e.clientX, e.clientY];
    this.last = [e.clientX, e.clientY];
    this.startTime = now;
    this.samples = [[now, e.clientX]];
  }

  /** How far the finger went since its last move, px. */
  public move(e: PointerEvent, now: number): Vec2 {
    const delta: Vec2 = [e.clientX - this.last[0], e.clientY - this.last[1]];
    this.last = [e.clientX, e.clientY];
    this.samples.push([now, e.clientX]);
    while(this.samples.length > 2 && now - this.samples[0][0] > SPEED_WINDOW) this.samples.shift();
    return delta;
  }

  /** The finger's speed along x as it lets go, px/s. */
  public velocity(e: PointerEvent, now: number): number {
    const first = this.samples[0];
    return first && now - first[0] > 0.005 ? (e.clientX - first[1]) / (now - first[0]) : 0;
  }

  public isTap(e: PointerEvent, now: number): boolean {
    return e.type !== 'pointercancel' && now - this.startTime < TAP_TIME &&
      Math.hypot(e.clientX - this.start[0], e.clientY - this.start[1]) < TAP_TRAVEL;
  }
}

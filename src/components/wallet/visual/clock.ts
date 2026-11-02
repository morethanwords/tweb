// One clock for everything: frames, send storyboards, intros. Deferred work
// runs not on setTimeout but on this same clock, inside a frame: a storyboard
// does not drift from the animation when the browser holds timers back. For
// debugging the clock can be driven by hand (`manual`).
//
// The screen that owns the frame loop calls `clock.run(now)` first in every
// frame, with `now = clock.now()`.

interface ClockTimer {
  at: number,
  fn: () => void,
  cancelled: boolean
}

export class WalletClock {
  public manual = false;
  public t = 0;
  public timers: ClockTimer[] = [];

  /** Seconds. */
  public now(): number {
    return this.manual ? this.t : performance.now() / 1000;
  }

  /** Run `fn` after `seconds` — in the first frame past the due time. Returns a cancel function. */
  public after(seconds: number, fn: () => void): () => void {
    const timer: ClockTimer = {at: this.now() + seconds, fn, cancelled: false};
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
      const index = this.timers.indexOf(timer);
      if(index !== -1) this.timers.splice(index, 1);
    };
  }

  /** Fire the due ones — in order of their due time. */
  public run(now: number) {
    if(!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
    if(!due.length) return;
    this.timers = this.timers.filter((t) => t.at > now);
    for(const t of due) if(!t.cancelled) t.fn();
  }
}

export const clock = new WalletClock();

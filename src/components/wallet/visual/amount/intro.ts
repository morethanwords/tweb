// The amount screen's entrance — a port of iOS's (WalletSendAmountIntro,
// InteractiveDiamondIntro, the recipient's opening spring): the gem drops in
// from the middle of the amount line, big, on a damped spring, and lands in
// its place; the amount is wiped in behind it; the caret fades in last; the
// balance and the send button rise into place; the recipient chip settles on
// a springy bounce. Any interaction plays the rest out in 0.15 s.
//
//   const intro = new AmountIntroClock(clock.now());
//   const frame = intro.frame(clock.now());   // null once it is over
//   intro.fastForward(clock.now());           // the user touched something

/** The gem waits this long before it moves. */
const GEM_DELAY = 0.18;
/** The amount's part of the entrance. */
export const INTRO_DURATION = 1.2;
/** The recipient chip settles for this long. */
const CHIP_DURATION = 2.1;
/** An interrupted entrance plays out in this. */
const FINISH_DURATION = 0.15;
const GEM_OMEGA = 2 * Math.PI / 0.9;
const GEM_DAMPING = 0.8;
const CHIP_OMEGA = 2 * Math.PI / 0.52;
const CHIP_DAMPING = 0.36;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/** The gem's way from the middle of the line to its place: 0 → 1, overshooting a little. */
function gemProgress(time: number) {
  if(time >= INTRO_DURATION) return 1;
  const t = Math.max(time - GEM_DELAY, 0);
  const decay = GEM_DAMPING * GEM_OMEGA;
  const frequency = GEM_OMEGA * Math.sqrt(1 - GEM_DAMPING * GEM_DAMPING);
  return 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + (decay - 1.2) / frequency * Math.sin(frequency * t));
}

/** The chip's bounce: 1 at the start, dying down to 0. */
function chipSpring(time: number) {
  const omegaD = CHIP_OMEGA * Math.sqrt(1 - CHIP_DAMPING * CHIP_DAMPING);
  return Math.exp(-CHIP_DAMPING * CHIP_OMEGA * time) *
    (Math.cos(omegaD * time) + CHIP_DAMPING * CHIP_OMEGA / omegaD * Math.sin(omegaD * time));
}

export interface AmountIntroFrame {
  /** The gem's way to its place, 0 → 1 (a little over on the spring). */
  progress: number,
  /** The caret's opacity. */
  caret: number,
  /** The chip's bounce: `translateY(26k) scale(1 − 0.07k)`. */
  chip: number
}

/** The gem 48 px up halfway (negative is up). */
export const introLift = (progress: number) => -192 * progress * (1 - progress);
/** The gem six times its size at the start. */
export const introScale = (progress: number) => 1 + 5 * Math.pow(Math.max(0, 1 - progress), 1.25);
/** The balance and the button come up from 56 px below. */
export const introRise = (progress: number) => 56 * (1 - progress);
/** The amount shows once the gem has made a start. */
export const introAlpha = (progress: number) => clamp01(progress / 0.08);

function amountAt(time: number) {
  if(time >= INTRO_DURATION) return {progress: 1, caret: 1};
  const k = clamp01((time - 0.78) / 0.2);
  return {progress: gemProgress(time), caret: smoothstep(k)};
}

export class AmountIntroClock {
  private start: number;
  private finish: {at: number, progress: number, caret: number, chip: number};
  private over: boolean;

  constructor(now: number) {
    this.start = now;
    this.over = false;
  }

  public get done() {
    return this.over;
  }

  /** The user touched something: what is left of the entrance plays out at once. */
  public fastForward(now: number) {
    if(this.over || this.finish) return;
    const elapsed = now - this.start;
    this.finish = {at: now, ...amountAt(elapsed), chip: Math.min(elapsed, CHIP_DURATION)};
  }

  /** Ends it where it is: the next frame is the screen at rest. */
  public stop() {
    this.over = true;
  }

  /** The entrance at `now`; null once it is over. */
  public frame(now: number): AmountIntroFrame {
    if(this.over) return null;
    const elapsed = now - this.start;
    if(this.finish) {
      const p = clamp01((now - this.finish.at) / FINISH_DURATION);
      if(p >= 1) {
        this.over = true;
        return null;
      }

      const k = smoothstep(p);
      const {progress, caret, chip} = this.finish;
      return {
        progress: progress + (1 - progress) * k,
        caret: caret + (1 - caret) * k,
        chip: chipSpring(chip + (CHIP_DURATION - chip) * k)
      };
    }

    if(elapsed >= CHIP_DURATION) {
      this.over = true;
      return null;
    }

    return {...amountAt(elapsed), chip: chipSpring(elapsed)};
  }
}

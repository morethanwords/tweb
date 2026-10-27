/*
 * The progress of a download or an upload that can be cancelled: a ring of 12 dots that a line goes
 * round, taking the dots in, and the download arrow, which turns into the ring when it is pressed and
 * back when the download is cancelled. Drawn in the indicator's own 54-unit box at any size.
 *
 * - The line is as wide as a dot is, so a dot it reaches simply becomes part of it. It starts as dot 0,
 *   at the dots' brightness, and is full by half way to the next dot. It shows where the bytes are,
 *   following each new value smoothly (an exponential approach, 160 ms), never ahead of them.
 * - While loading, the ring turns once in 8 s.
 * - While nothing has come, a wave runs round the dots, each lighting up in turn (a lap in 1.2 s). It
 *   starts at dot 0; once data comes, every dot plays the pulse it is in to its end and starts no other,
 *   so the wave runs out over the rest of its lap rather than going off at once.
 * - The arrow turns into the ring as Telegram for iOS does it (RadialDownloadContentNode →
 *   RadialProgressContentNode). The shaft is the visible end of a J that comes up out of the ring at its
 *   lower left; pressed, the visible piece slides back down the J into the ring and shrinks to nothing,
 *   dimming and thickening into a dot as it goes, while the head's arms draw back into the tip. The ring
 *   fades in, the cross grows from 0.2 of its size, and the ring starts turned so that its dot 0, where
 *   the line will begin, meets the J's end just as the piece does and takes its brightness over. On
 *   cancel the cross shrinks, the ring fades and the arrow grows back out of its tip. tweb's arrow has a
 *   base, the iOS one has not: it draws in to its middle with the arms.
 *
 * A progress that cannot be cancelled (a video being made) is the same ring with the share done in its
 * middle, where the arrow and the cross would be.
 *
 * Animation levels: full as above; reduced keeps the turning (a spinner) and the smooth line, crossfades
 * the arrow and the ring, and has no wave; off swaps, and the line stands where the bytes are.
 *
 * What it costs: the line and a change of the arrow are drawn by a script on the shared frame loop,
 * only while they move and only while the ring is in sight; the wave is Web Animations of the dots'
 * opacity, so it ends a pulse at a time without reading anything back; the turning is a CSS animation.
 * Dots 1-11 are one path, and elements of their own only while a wave runs on them: a page holding a
 * dozen elements per ring paid for them on every frame the line moved (in Chromium, the frame's
 * commit to the compositor and its layer updates, three times what one path costs).
 */

import liteMode from '@helpers/liteMode';
import {animate} from '@helpers/animation';
import {defaultEasing} from '@helpers/easings';
import clamp from '@helpers/number/clamp';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import createAppWindowIntersectionObserver from '@helpers/dom/createAppWindowIntersectionObserver';
import {createEffect, createRoot, on} from 'solid-js';

const N = 12;
const R = 19;
const CIRCUMFERENCE = 2 * Math.PI * R;
const DEG = Math.PI / 180;

const round = (x: number) => Math.round(x * 100) / 100;
const clamp01 = (x: number) => clamp(x, 0, 1);
const smooth = (x: number) => x * x * (3 - 2 * x);
const ringPoint = (a: number) => [round(27 + R * Math.cos(a)), round(27 + R * Math.sin(a))];

// cubic-bezier(.42, 0, .58, 1): CSS ease-in-out, Core Animation's easeInEaseOut
const easeInOut = (x: number) => defaultEasing(clamp01(x));

/* ── the drawings, in the 54-unit box ── */

// tweb's download glyph at 44 % of the box: the shaft down to the tip, the head's two arms, the base
const TIP = [27, 30.96];
const SHAFT_TOP = 19.08;
const ARM_ENDS = [[21.85, 25.81], [32.15, 25.81]];
const ARM_LENGTH = Math.hypot(TIP[0] - ARM_ENDS[0][0], TIP[1] - ARM_ENDS[0][1]);
const BASE_Y = 34.92, BASE_FROM = 20.07, BASE_TO = 33.93;
const BASE_LENGTH = BASE_TO - BASE_FROM;

// The J: on the ring from 159° to 148° (iOS's own angles), then down and round into the tip from
// below, then up the shaft. Its length is worked out here, for the dashes.
const J_START = 159 * DEG, J_BEND = 148 * DEG;
const [J_X0, J_Y0] = ringPoint(J_START), [J_X1, J_Y1] = ringPoint(J_BEND);
const J_C1 = [round(J_X1 + 9.6 * Math.sin(J_BEND)), round(J_Y1 - 9.6 * Math.cos(J_BEND))];
const J_C2 = [TIP[0], round(TIP[1] + 10.1)];
const J_PATH = `M${J_X0} ${J_Y0}A${R} ${R} 0 0 0 ${J_X1} ${J_Y1}` +
  `C${J_C1[0]} ${J_C1[1]} ${J_C2[0]} ${J_C2[1]} ${TIP[0]} ${TIP[1]}L${TIP[0]} ${SHAFT_TOP}`;
const J_LENGTH = (() => {
  let length = R * (J_START - J_BEND), [px, py] = [J_X1, J_Y1];
  for(let i = 1; i <= 64; ++i) {
    const t = i / 64, u = 1 - t;
    const x = u * u * u * J_X1 + 3 * u * u * t * J_C1[0] + 3 * u * t * t * J_C2[0] + t * t * t * TIP[0];
    const y = u * u * u * J_Y1 + 3 * u * u * t * J_C1[1] + 3 * u * t * t * J_C2[1] + t * t * t * TIP[1];
    length += Math.hypot(x - px, y - py);
    [px, py] = [x, y];
  }
  return length + TIP[1] - SHAFT_TOP;
})();
// where the shaft begins along the J: before it, the J is out of sight at rest
const J_SHAFT = 1 - (TIP[1] - SHAFT_TOP) / J_LENGTH;

// a dot as two arcs, so that dots 1-11 are drawn the same one by one and as one path
const DOTS = Array.from({length: N}, (_, i) => {
  const [x, y] = ringPoint(-90 * DEG + i * 360 / N * DEG);
  return `M${round(x - 1.5)} ${y}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0`;
});
const dotMarkup = (d: string) => `<path class="preloader-dot" d="${d}" opacity=".35"/>`;
// dots 1-11 one by one, for a wave
const WAVE_DOTS = DOTS.slice(1).map(dotMarkup).join('');

const RING_MARKUP = '<div class="preloader-dots-spin"><svg class="preloader-dots-ring" viewBox="0 0 54 54">' +
  dotMarkup(DOTS[0]) + `<path class="preloader-dots-rest" d="${DOTS.slice(1).join('')}" opacity=".35"/>` +
  `<circle class="preloader-line" cx="27" cy="27" r="${R}" transform="rotate(-90 27 27)" stroke-dasharray="0 ${round(CIRCUMFERENCE)}" opacity="0"/></svg></div>`;
// What sits in the middle goes under the turning ring, all in one colour, so the order does not show: on
// top, it would overlap a layer whose transform is animated and need layers of its own (in Chromium,
// one per ring, that would not merge).
const MARKUP = '<div class="preloader-circular"></div>' +
  '<svg class="preloader-arrow" viewBox="0 0 54 54">' +
  `<path d="M${BASE_FROM} ${BASE_Y}H${BASE_TO}"/>` +
  `<path d="${J_PATH}" stroke-dasharray="${round(J_LENGTH * (1 - J_SHAFT))} ${round(J_LENGTH * 2)}" stroke-dashoffset="${-round(J_LENGTH * J_SHAFT)}"/>` +
  ARM_ENDS.map(([x, y]) => `<path d="M${TIP[0]} ${TIP[1]}L${x} ${y}"/>`).join('') +
  '</svg>' +
  '<svg class="preloader-cross" viewBox="0 0 54 54"><path d="M21.6 21.6L32.4 32.4M32.4 21.6L21.6 32.4"/></svg>' +
  RING_MARKUP;
// the share done instead of the arrow and the cross; whatever holds it draws the disc under it
const PERCENT_MARKUP = '<span class="preloader-percent" dir="ltr"></span>' + RING_MARKUP;

// each markup is parsed once, and a ring takes a copy
const parsed: Map<string, DocumentFragment> = new Map();
function copyOf(markup: string) {
  let fragment = parsed.get(markup);
  if(!fragment) {
    parsed.set(markup, fragment = htmlToDocumentFragment(markup));
  }

  return fragment.cloneNode(true);
}

/* ── timings, ms ── */

// pressed: the J's piece slides in GO, the arms draw in ARMS_IN (fading from 70 for 200), the ring
// fades in from RING_IN, the cross grows from CROSS_IN for 200; the piece is dot 0 from LAND, which
// settles to the dots' brightness by 550; LANDED ends it all
const GO = 500, ARMS_IN = 200, RING_IN = 240, CROSS_IN = 270, LAND = 440, LANDED = 600;
// cancelled: the arrow grows back out in BACK, the cross shrinks in 150 and fades in BACK
const BACK = 250;
// the ring turns once in SPIN; pressed, it starts this far round, so that dot 0 is at the J's start
// GO later
const SPIN = 8000;
const SPIN_DELAY = -Math.round(((J_START / DEG + 90 - 360 * GO / SPIN) % 360 + 360) % 360 / 360 * SPIN);
// how quickly the line follows the bytes
const FOLLOW = 160;
// the wave: a lap, and how far behind each dot is
const WAVE = 1200, WAVE_STEP = 100;
const WAVE_KEYFRAMES: Keyframe[] = [
  {opacity: .35, easing: 'ease-in-out'},
  {opacity: 1, offset: .35, easing: 'ease-in-out'},
  {opacity: .35}
];

// the piece's brightness while it turns into dot 0 and dot 0's after, until it is one of the dots
const landing = (t: number) => 1 - .65 * smooth(clamp01((t - 250) / 300));

type Phase = 'go' | 'back';

// What is out of sight draws nothing: no line, no wave, no change of the arrow (the line takes up
// where the bytes are once seen). One observer for every ring in the document; the arrow, which does
// nothing until it is pressed, is not watched (a chat with automatic downloads off has hundreds).
const observed: Map<Element, PreloaderRing> = new Map();
const observer = createAppWindowIntersectionObserver((entries) => {
  for(const entry of entries) {
    observed.get(entry.target)?.setInSight(entry.isIntersecting);
  }
});

function observe(element: Element, ring: PreloaderRing) {
  if(typeof(IntersectionObserver) === 'undefined') {
    return;
  }

  // one taken out of the document out of sight is not reported: each new one looks for them
  observed.forEach((other) => other !== ring && other.sweep());
  observed.set(element, ring);
  observer.observe(element);
}

function unobserve(element: Element) {
  observed.delete(element);
  observer.unobserve(element);
}

export default class PreloaderRing {
  private spin: HTMLElement;
  // dot 0, where the line starts; dots 1-11 in one path, or one by one while a wave runs on them
  private dot: SVGPathElement;
  private rest: SVGPathElement;
  private waveDots: SVGPathElement[];
  private line: SVGCircleElement;
  private arrow: SVGSVGElement;
  private base: SVGPathElement;
  private shaft: SVGPathElement;
  private arms: SVGPathElement[];
  private cross: SVGSVGElement;
  private percent: HTMLElement;

  private manual = false;
  private arrowAtRest = true;
  private inSight = true;
  // the line: where the bytes are, and where it is
  private target = 0;
  private shown = 0;
  private resetAfterBack = false;
  private finishing: () => void;
  private finished: Promise<void>;
  // whether it has been in the document since it was last watched: out of it again, it was taken out
  private seen = false;

  private phase: Phase;
  private phaseAt = 0;
  private animating = false;
  private lastAt = 0;
  private wave: Animation[];
  // which wave the dots one by one last served, so that one still running out does not join them
  private waveId = 0;

  // the attribute values last written, so each is written only when it changes
  private written: Map<Element, {[name: string]: string}> = new Map();

  /**
   * `percent`: the share done in the middle instead of the arrow and the cross, for a progress that cannot
   * be cancelled; such a ring is never made manual.
   */
  constructor(private container: HTMLElement, options: {percent?: boolean} = {}) {
    container.classList.add('preloader-dots');
    container.append(copyOf(options.percent ? PERCENT_MARKUP : MARKUP));
    this.spin = container.querySelector('.preloader-dots-spin');
    this.dot = container.querySelector('.preloader-dot');
    this.rest = container.querySelector('.preloader-dots-rest');
    this.line = container.querySelector('.preloader-line');
    if(options.percent) {
      this.percent = container.querySelector('.preloader-percent');
      this.setPercent(0);
    } else {
      this.arrow = container.querySelector('.preloader-arrow');
      [this.base, this.shaft, ...this.arms] = Array.from(this.arrow.children) as SVGPathElement[];
      this.cross = container.querySelector('.preloader-cross');
    }

    // made for a download or an upload under way; one that waits for a press is made manual after
    this.setSpinning(true);
  }

  /**
   * Put in the document: a download that has not had a byte yet shows its wave.
   */
  public onAttach() {
    if(!this.manual) {
      observe(this.container, this);
    }

    this.updateWave();
  }

  public setInSight(inSight: boolean) {
    if(this.sweep()) {
      return;
    }

    // one not put in yet (a bubble still being built) is out of sight until it is
    inSight &&= this.container.isConnected;
    const changed = this.inSight !== inSight;
    this.inSight = inSight;
    if(inSight) {
      // the first report after it was put in may find it taken as in sight already: what waits for it
      // starts either way (each starts once)
      this.updateWave();
      this.run();
    } else if(changed) {
      this.stop();
    }
  }

  /**
   * A download starts: the line goes back to the start.
   */
  public begin() {
    this.target = this.shown = 0;
    this.resetAfterBack = false;
    this.render(0);
    this.updateWave();
  }

  /**
   * Where the bytes are, 0-1. Back to 0 is a new start (while the ring fades after a cancel, that waits
   * until it has).
   */
  public setTarget(value: number) {
    value = clamp01(value);
    this.setPercent(value);
    if(!value) {
      if(this.phase === 'back') {
        this.resetAfterBack = true;
        return;
      }

      this.target = this.shown = 0;
      this.render(0);
      this.updateWave();
      return;
    }

    if(value <= this.target) {
      return;
    }

    this.target = value;
    this.updateWave();
    if(!liteMode.isAvailable('animations')) {
      this.shown = value;
      this.render(0);
      this.finishing?.();
      return;
    }

    this.run();
  }

  /**
   * Resolves once the line has come round to the end (at once with no animations, or out of sight).
   */
  public finish() {
    if(this.shown >= .996 || !liteMode.isAvailable('animations') || !this.container.isConnected || !this.inSight) {
      return Promise.resolve();
    }

    // one wait, for however many wait (a file's detach and its row both do)
    return this.finished ??= new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timeout);
        this.finishing = this.finished = undefined;
        resolve();
      };

      const timeout = window.setTimeout(done, 1000);
      this.finishing = done;
    });
  }

  /**
   * Whether the arrow and the ring are turning into one another.
   */
  public isChanging() {
    return !!this.phase;
  }

  /**
   * The arrow (true) or the ring. `animated`: whether the change is seen happen.
   */
  public setManual(manual: boolean, animated: boolean) {
    if(this.manual === manual) {
      return;
    }

    this.manual = manual;
    const level = animated && this.container.isConnected && this.inSight ? liteMode.getAnimationLevel() : 0;
    this.stopPhase();
    if(manual) {
      // taken as in sight until pressed, which says it is
      this.letGo();
      this.inSight = true;
      this.stopWave(true);
      if(level) {
        this.startPhase('back', level);
      } else {
        this.setSpinning(false);
        this.drawArrowAtRest();
      }

      return;
    }

    if(this.container.isConnected) {
      observe(this.container, this);
    }

    // the ring starts turning at once; pressed, it starts turned for dot 0 to meet the J
    this.spin.style.animationDelay = level === 2 ? SPIN_DELAY + 'ms' : '';
    this.setSpinning(true);
    if(level === 2) {
      this.startPhase('go', level);
    } else {
      this.updateWave();
    }
  }

  /**
   * Out of the document: whatever plays stops.
   */
  public halt() {
    this.letGo();
    this.stop();
  }

  /**
   * Let go of it if it has been taken out of the document without a detach (the media viewer removes
   * it, a composer drops its overlay), and say so.
   */
  public sweep() {
    if(this.container.isConnected) {
      this.seen = true;
    } else if(this.seen) {
      this.halt();
      return true;
    }

    return false;
  }

  private letGo() {
    unobserve(this.container);
    this.seen = false;
  }

  private stop() {
    this.stopPhase();
    this.stopWave(true);
    this.finishing?.();
  }

  /* ── the arrow and the ring ── */

  private startPhase(phase: Phase, level: number) {
    this.phase = phase;
    this.phaseAt = performance.now();
    if(level === 2) {
      // the script draws this one: no transitions of the pieces' own
      this.arrow.style.transition = this.cross.style.transition = 'none';
      this.arrow.style.opacity = '1';
      if(phase === 'go') {
        this.container.classList.add('is-going');
      }
    }

    if(level === 2) {
      this.drawPhase(0);
    }

    this.run();
  }

  private stopPhase() {
    if(!this.phase) {
      return;
    }

    const phase = this.phase;
    this.phase = undefined;
    this.container.classList.remove('is-going');
    this.dot.style.visibility = '';
    for(const element of [this.arrow, this.cross]) {
      element.style.transition = element.style.opacity = element.style.transform = '';
    }

    this.shaft.style.strokeWidth = '';
    if(phase === 'back') {
      this.setSpinning(false);
      this.drawArrowAtRest();
      if(this.resetAfterBack) {
        this.resetAfterBack = false;
        this.target = this.shown = 0;
        this.render(0);
      }
    }

    this.updateWave();
  }

  private setSpinning(spinning: boolean) {
    this.container.classList.toggle('is-spinning', spinning);
  }

  // a dashed piece of a path, from `from` to `to` of its length
  private piece(path: SVGPathElement, length: number, from: number, to: number) {
    this.put(path, 'stroke-dasharray', `${round(Math.max(0, to - from) * length)} ${round(length * 2)}`);
    this.put(path, 'stroke-dashoffset', '' + -round(from * length));
  }

  private drawArrowAtRest() {
    // as the markup draws it, until a change has moved it
    if(this.arrowAtRest) {
      return;
    }

    this.arrowAtRest = true;
    this.piece(this.shaft, J_LENGTH, J_SHAFT, 1);
    this.put(this.shaft, 'opacity', '1');
    for(const arm of this.arms) {
      this.piece(arm, ARM_LENGTH, 0, 1);
      this.put(arm, 'opacity', '1');
    }

    this.piece(this.base, BASE_LENGTH, 0, 1);
    this.put(this.base, 'opacity', '1');
  }

  private drawPhase(t: number) {
    this.arrowAtRest = false;
    const go = this.phase === 'go';
    // the shaft: down the J and into the ring, or back up out of the tip
    let from = J_SHAFT, to = 1, opacity = 1, width = 2;
    if(go) {
      const e = easeInOut(t / GO);
      from = J_SHAFT * (1 - e);
      to = 1 - e;
      opacity = t < LAND ? landing(t) : 0;
      width = 2 + clamp01((t - 250) / (LAND - 250));
    } else {
      to = J_SHAFT + (1 - J_SHAFT) * easeInOut(t / BACK);
      opacity = clamp01(t / BACK);
    }

    this.piece(this.shaft, J_LENGTH, from, to);
    this.put(this.shaft, 'opacity', opacity.toFixed(3));
    this.shaft.style.strokeWidth = width.toFixed(2);

    // the arms draw in to the tip and the base to its middle, and back out
    const drawn = go ? 1 - easeInOut(t / ARMS_IN) : easeInOut(t / BACK);
    const seen = (go ? 1 - clamp01((t - 70) / 200) : clamp01(t / BACK)).toFixed(3);
    for(const arm of this.arms) {
      this.piece(arm, ARM_LENGTH, 0, drawn);
      this.put(arm, 'opacity', seen);
    }

    this.piece(this.base, BASE_LENGTH, .5 - drawn / 2, .5 + drawn / 2);
    this.put(this.base, 'opacity', seen);

    // the cross
    let scale = 1, crossOpacity = 1;
    if(go) {
      crossOpacity = t < CROSS_IN ? 0 : 1;
      scale = .2 + .8 * easeInOut((t - CROSS_IN) / 200);
    } else {
      scale = 1 - .8 * easeInOut(t / 150);
      crossOpacity = 1 - clamp01(t / BACK);
    }

    this.cross.style.opacity = crossOpacity.toFixed(3);
    this.cross.style.transform = `scale(${scale.toFixed(3)})`;

    if(go) {
      if(t >= RING_IN) this.container.classList.remove('is-going');
      this.dot.style.visibility = t < LAND ? 'hidden' : '';
    }
  }

  /* ── the line ── */

  private run() {
    // a loop that runs keeps its last frame's time: progress that comes between frames does not shorten
    // the next step
    if(this.animating) {
      return;
    }

    this.animating = true;
    this.lastAt = performance.now();
    animate(this.tick);
  }

  private tick = () => {
    if(!this.container.isConnected) {
      this.animating = false;
      this.stop();
      return false;
    }

    if(!this.inSight) {
      this.animating = false;
      return false;
    }

    const now = performance.now();
    const dt = Math.min(64, now - this.lastAt);
    this.lastAt = now;

    let phaseTime = 0;
    if(this.phase) {
      phaseTime = now - this.phaseAt;
      const level = liteMode.getAnimationLevel();
      if(phaseTime >= (this.phase === 'go' ? LANDED : BACK)) {
        this.stopPhase();
      } else if(level === 2) {
        this.drawPhase(phaseTime);
      }
    }

    // pressed, the line waits for the shaft to land on dot 0 and grows out of it, however fast the
    // bytes come
    const held = this.phase === 'go' && phaseTime < LAND;
    if(this.target > this.shown && !held) {
      this.shown += (this.target - this.shown) * (1 - Math.exp(-dt / FOLLOW));
      // the last half pixel of a 54 px ring at once, rather than frames that move it by less
      if(this.target - this.shown < .004) {
        this.shown = this.target;
      }

      if(this.shown >= .996 && this.target >= 1) {
        this.shown = 1;
      }
    }

    const landed = this.phase === 'go' && phaseTime >= LAND ? landing(phaseTime) : 0;
    this.render(landed);
    if(this.shown >= 1) {
      this.finishing?.();
    }

    this.animating = !!this.phase || this.target > this.shown;
    return this.animating;
  };

  // `lit`: a brightness dot 0, or the line starting on it, has at least
  private render(lit: number) {
    const started = this.shown > .0005;
    this.put(this.line, 'stroke-dasharray', `${round(this.shown * CIRCUMFERENCE)} ${round(CIRCUMFERENCE)}`);
    this.put(this.line, 'opacity', started ? Math.max(.35 + .65 * clamp01(this.shown * N * 2), lit).toFixed(3) : '0');
    this.put(this.dot, 'opacity', started ? '0' : Math.max(.35, lit).toFixed(3));
  }

  /* ── the wave ── */

  private updateWave() {
    const waiting = !this.manual && !this.target && this.phase !== 'go' && this.inSight && this.container.isConnected;
    if(waiting && liteMode.getAnimationLevel() === 2 && typeof(this.dot.animate) === 'function') {
      if(!this.wave) {
        ++this.waveId;
        this.wave = this.splitDots().map((dot, i) => dot.animate(WAVE_KEYFRAMES, {duration: WAVE, delay: i * WAVE_STEP, iterations: Infinity}));
        PreloaderRing.waving.add(this);
        PreloaderRing.watchLevel();
      }
    } else {
      this.stopWave(this.manual || !this.inSight || !this.container.isConnected || !liteMode.isAvailable('animations'));
    }
  }

  // A wave is decorative: it goes when the full animation level does (Power Saving, the system's reduce
  // motion), at once with no animations. One watcher for every ring.
  private static waving: Set<PreloaderRing> = new Set();
  private static levelWatched = false;
  private static watchLevel() {
    if(PreloaderRing.levelWatched) {
      return;
    }

    PreloaderRing.levelWatched = true;
    createRoot(() => createEffect(on(() => liteMode.getAnimationLevel(), () => {
      PreloaderRing.waving.forEach((ring) => ring.updateWave());
    }, {defer: true})));
  }

  // `now`: off at once; otherwise each dot ends the pulse it is in
  private stopWave(now: boolean) {
    const wave = this.wave;
    if(!wave) {
      return;
    }

    this.wave = undefined;
    PreloaderRing.waving.delete(this);
    const waveId = this.waveId;
    let running = 0;
    // the last pulse is out, and no other wave has taken the dots since
    const ended = () => {
      if(!--running && waveId === this.waveId) {
        this.joinDots();
      }
    };

    for(const animation of wave) {
      const iteration = animation.effect.getComputedTiming().currentIteration;
      if(now || iteration === null || iteration === undefined) {
        animation.cancel();
      } else {
        ++running;
        animation.effect.updateTiming({iterations: iteration + 1});
        animation.finished.then(ended, ended);
      }
    }

    if(!running) {
      this.joinDots();
    }
  }

  // the dots one by one, for a wave to run on (ones a wave is still running out on serve the next)
  private splitDots() {
    if(!this.waveDots) {
      this.rest.insertAdjacentHTML('afterend', WAVE_DOTS);
      this.waveDots = Array.from(this.rest.parentElement.querySelectorAll<SVGPathElement>('.preloader-dot')).slice(1);
      this.rest.style.display = 'none';
    }

    return [this.dot, ...this.waveDots];
  }

  // dots 1-11 back to one path: each ends its pulse at the path's brightness
  private joinDots() {
    if(!this.waveDots) {
      return;
    }

    this.waveDots.forEach((dot) => dot.remove());
    this.waveDots = undefined;
    this.rest.style.display = '';
  }

  // the share done, whole percents: 100 % only once it is all done
  private setPercent(value: number) {
    const text = Math.floor(value * 100) + '%';
    if(this.percent && this.percent.textContent !== text) {
      this.percent.textContent = text;
    }
  }

  private put(element: Element, name: string, value: string) {
    let values = this.written.get(element);
    if(!values) {
      this.written.set(element, values = {});
    }

    if(values[name] === value) {
      return;
    }

    values[name] = value;
    element.setAttribute(name, value);
  }
}

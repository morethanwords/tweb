// The live part of the amount screen — a port of the frame of the design's
// AmountScreen (amount.js), without its data: the gem in front of the amount,
// its bounce on every typed glyph, the gem ↔ currency-symbol flip on a swap,
// holding the gem (it grows almost fourfold and the amount shows through its
// facets), the swap arrows of the pill, and the send: the gem shudders, spins
// up, bursts — and leaves for the history once the screen asks it to.
//
// Usage — the screen owns the data and the frame loop:
//
//   const scene = new AmountScene(elements, {digits, onFocus, canHold});  // throws without WebGL2
//   scene.open();                         // on (re)open
//   scene.changedNow(clock.now());        // the amount changed: the gem and the symbol bounce
//   scene.kick(velocity, decay);          // a spin push per typed glyph
//   scene.swap(up);                       // the currency swapped: the gem and the symbol flip
//   scene.charge();                       // Continue: the gem spins up and bursts
//   scene.requestLaunch((launch) => …);   // the transfer went through: hand the gem to the flight
//   scene.cancelCharge();                 // it did not
//   scene.setOpening(progress);           // the entrance (intro.ts): the gem drops in from the line's middle; null — done
//   // every frame: scene.measure() before the frame's writes, then the digits/rolls, then:
//   scene.frame(clock.now());
//   scene.destroy();

import {GemView, Appearance} from '@components/wallet/visual/gem/stage';
import {gemAssets, gemHull} from '@components/wallet/visual/gem/geometry';
import {ease, settle} from '@components/wallet/visual/motion';
import {clock} from '@components/wallet/visual/clock';
import {pixelRatio} from '@components/wallet/visual/dom';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import {SPIN} from '@components/wallet/visual/amount/roll';
import {introLift, introScale} from '@components/wallet/visual/amount/intro';
import type {Digits} from '@components/wallet/visual/amount/digits';
import type {Vec2, Vec3} from '@components/wallet/visual/math';
import ListenerSetter from '@helpers/listenerSetter';

/** The gem's canvas — room for the growth, the burst and the swell. */
const GEM_CANVAS = 220;
/** The entrance's canvas: the gem comes in six times its size (iOS renders it on 320 too). */
const INTRO_CANVAS = 320;
/** The gem in the line. */
const GEM_WIDTH = 32;
/** The gem's touch radius. */
const GEM_HIT = 32;
/** Under the finger — 1 + 2.75 times. */
const HOLD_GROW = 2.75;
export const IDLE_SPIN = 2 * Math.PI / 26;
const SEND_SPIN = 10;
/** The amount through the gem — in deep blue. */
const LENS_INK = 'rgb(5, 33, 122)';
/** The gem leaves this long after the press at the earliest. */
const LAUNCH_AT = 0.18;
/** With reduced animations the gem and the currency sign cross-fade in their place instead of flipping. */
const SWAP_FADE = 0.15;

interface SendStage {
  energy: number,
  hit: number,
  hitAfter: (delay: number) => number,
  breath: number,
  ring: number
}

/** The send storyboard from the press: the hit, the spin-up, the breathing. */
function sendStage(time: number): SendStage {
  const ramp = (from: number, span: number) => Math.min(Math.max((time - from) / span, 0), 1);
  const hitAfter = (d: number) => {
    const t = time - d;
    return time > 0 && t > 0 && t < 0.42 ? Math.sin(Math.PI * t / 0.42) * (1 - 0.3 * t / 0.42) : 0;
  };
  return {
    energy: Math.pow(ramp(0, 0.45), 0.65),
    hit: hitAfter(0),
    hitAfter,
    breath: Math.sin(2 * Math.PI * 1.1 * time),
    ring: 1 - Math.pow(1 - ramp(0.02, 0.7), 2.4)
  };
}

/** The glyph's bounce on every change of the amount: up for a tenth and a bit, and back. */
const pop = (t: number) => t >= 0 && t < 0.42 ? Math.sin(Math.PI * t / 0.42) * (1 - 0.3 * t / 0.42) : 0;

export interface AmountSceneElements {
  /** The screen: the gem layer is placed in it, and the grown gem stays inside its edge by the gem (the left one,
   * the right one right to left). */
  root: HTMLElement,
  /** The amount line: the gem, the digits and the code; the pointer target. */
  line: HTMLElement,
  /** The gem's place in the line. */
  slot: HTMLElement,
  /** The currency symbol in the gem's place. */
  symbol: HTMLElement,
  /** The currency code after the digits. */
  code: HTMLElement,
  /** The layer over the screen: glow, ring and the gem's canvas. */
  layer: HTMLElement,
  glow: HTMLElement,
  ring: HTMLElement,
  gem: HTMLCanvasElement,
  /** The two halves of the swap icon. */
  arrows: (HTMLElement | SVGElement)[]
}

export interface AmountSceneOptions {
  digits: Digits,
  /** What travels and pops may play (the full animation level). Without it the gem keeps turning in its place:
   * no bounce or push on a change, the swap cross-fades it with the currency sign, the send does not spin it up. */
  motion?: boolean,
  /** A press next to the gem: focus the amount input. */
  onFocus: () => void,
  /** The gem can be held only while the amount is in Grams and nothing is being sent. */
  canHold: () => boolean,
  /** The amount seen through the gem; deep blue by default. */
  lensInk?: string
}

/** What the flight takes over from the screen's gem. */
export interface AmountSceneLaunch {
  gem: GemView,
  /** The gem's centre, client px. */
  from: Vec2,
  /** Its width, points. */
  width: number,
  /** Its rotation speed, rad/s. */
  spin: number
}

export class AmountScene {
  public gem: GemView;
  /** clock.now() of the press; null while nothing is sent. */
  public sendStart: number;
  public swapStart: number;
  public held: boolean;
  public grip: number;
  /** The amount line's scale: a long amount is fitted into the width, and the gem in it is as much smaller. */
  public lineScale: number;
  private elements: AmountSceneElements;
  private options: AmountSceneOptions;
  private gramMode: boolean;
  private gripFrom: number;
  private holdChange: number;
  private changed: number;
  private launched: boolean;
  private bursts: number;
  private launchRequest: (launch: AmountSceneLaunch) => void;
  private nudge: number;
  private pr: number;
  private lensCanvas: HTMLCanvasElement;
  private outline: Vec3[];
  private screenRect: DOMRect;
  private slotRect: DOMRect;
  private lineRect: DOMRect;
  /** the entrance's progress (intro.ts), null when it is over */
  private opening: number;
  private canvasSize: number;
  private listenerSetter: ListenerSetter;
  private destroyed: boolean;
  /** the line is laid out right to left: the gem at its right end, the push running leftwards from it */
  private rtl: boolean;

  /** Throws when WebGL2 is unavailable. */
  constructor(elements: AmountSceneElements, options: AmountSceneOptions) {
    this.elements = elements;
    this.options = options;
    this.gem = new GemView(elements.gem, {
      appearance: Appearance.blue, rotationSpeed: IDLE_SPIN, widthPoints: GEM_WIDTH,
      lightBackground: true, starEmission: 0.28, burstSize: 0.25, starZoom: 0.55
    });
    this.outline = gemAssets().outline;
    this.lensCanvas = document.createElement('canvas');
    this.listenerSetter = new ListenerSetter();
    this.gramMode = true;
    this.nudge = 0;
    this.lineScale = 1;
    this.opening = null;
    this.canvasSize = GEM_CANVAS;
    this.destroyed = false;
    this.reset();
    this.bindGestures();
  }

  private reset() {
    this.sendStart = null;
    this.launched = false;
    this.launchRequest = undefined;
    this.bursts = 0;
    this.swapStart = null;
    this.changed = -10;
    this.held = false;
    this.grip = this.gripFrom = 0;
    this.holdChange = -10;
  }

  /** A new opening: the gem at rest, nothing of the last send left on its canvas. */
  public open() {
    this.reset();
    const {glow, ring} = this.elements;
    glow.style.opacity = ring.style.opacity = '0';
    Object.assign(this.gem.style, {hideStone: false, backgroundStars: false, rotationSpeed: IDLE_SPIN, swayScale: 1, starOpacity: 1});
    this.gem.bursts = [];
    this.gem.setLens(null);
    this.layout();
    // * the first frame at once: the gem's canvas must not show the past
    this.gem.resetClock();
  }

  /** The gem's canvas — in screen pixels. */
  public layout() {
    this.pr = pixelRatio();
    const size = this.canvasSize;
    this.gem.setSize(size, this.pr);
    const canvas = this.elements.gem;
    canvas.style.width = canvas.style.height = `${size}px`;
    this.lensCanvas.width = this.lensCanvas.height = Math.round(size * this.pr);
  }

  /**
   * The entrance: the gem travels from the middle of the amount line to its place, big at first, along an arc.
   * The canvas is a larger one meanwhile, so the big gem is not cut.
   */
  public setOpening(progress: number | null) {
    const size = progress === null ? GEM_CANVAS : INTRO_CANVAS;
    this.opening = progress;
    if(this.canvasSize !== size) {
      this.canvasSize = size;
      this.layout();
    }
  }

  public setGramMode(gram: boolean) {
    this.gramMode = gram;
  }

  private get motion() {
    return this.options.motion !== false;
  }

  /** The amount changed: the glyph bounces. */
  public changedNow(now = clock.now()) {
    if(this.motion) this.changed = now;
  }

  public kick(velocity: number, decay = 0.7) {
    if(this.motion) this.gem.kick(velocity, decay);
  }

  /**
   * The currency swapped: the number rolls on a drum (the screen's), the
   * symbol flips, the gem spins the way the number goes. Without motion the two cross-fade where they stand.
   */
  public swap(up: boolean, now = clock.now()) {
    this.kick(9 * (up ? -1 : 1), 0.8);
    this.gramMode = !this.gramMode;
    this.swapStart = now;
    this.changedNow(now);
  }

  /** The press: the gem shudders, spins up and bursts while the transfer goes out. */
  public charge(now = clock.now()) {
    this.sendStart = now;
    this.launched = false;
    this.launchRequest = undefined;
    this.bursts = 0;
    navigator.vibrate?.(15);
    this.gem.kick(-10, 0.9);
    this.gem.style.backgroundStars = true;
  }

  /** The transfer went through: the gem leaves in the next frame past LAUNCH_AT, `callback` takes it over. */
  public requestLaunch(callback: (launch: AmountSceneLaunch) => void) {
    this.launchRequest = callback;
  }

  /** The transfer did not go out: the gem calms down. */
  public cancelCharge() {
    this.sendStart = null;
    this.launchRequest = undefined;
    this.launched = false;
    const {glow, ring} = this.elements;
    glow.style.opacity = ring.style.opacity = '0';
    Object.assign(this.gem.style, {hideStone: false, backgroundStars: false, rotationSpeed: IDLE_SPIN, swayScale: 1, starOpacity: 1});
  }

  /** Moving right now: the frame loop follows the display. */
  public get busy(): boolean {
    return this.sendStart !== null || this.swapStart !== null || this.held || this.grip > 0.002;
  }

  // MARK: Input

  private gemCenter(): Vec2 {
    const r = this.elements.slot.getBoundingClientRect();
    if(!r.width) return null;
    return [r.left + r.width / 2 + (this.nudge || 0), r.top + r.height / 2];
  }

  private bindGestures() {
    const line = this.elements.line;
    const listen = this.listenerSetter.add(line);
    // * the gem is held: it grows and covers the amount, and turns as it is pulled; a press elsewhere
    // * focuses the amount
    let drag: {last: Vec2, samples: Vec2[]} = null;
    const onGem = (e: PointerEvent) => {
      const c = this.gemCenter();
      return c && Math.hypot(e.clientX - c[0], e.clientY - c[1]) <= GEM_HIT * this.lineScale * (1 + HOLD_GROW * this.grip);
    };
    listen('pointerdown', (e) => {
      if(onGem(e) && this.sendStart === null && this.options.canHold()) {
        e.preventDefault();
        try {
          line.setPointerCapture(e.pointerId);
        } catch{}
        const t = clock.now();
        drag = {last: [e.clientX, e.clientY], samples: [[t, e.clientX]]};
        this.gem.beginDrag(t);
        this.hold(true);
      } else {
        this.options.onFocus();
      }
    });
    listen('pointermove', (e) => {
      line.style.cursor = drag ? 'grabbing' : (onGem(e) && this.options.canHold() ? 'grab' : '');
      if(!drag) return;
      const t = clock.now();
      this.gem.drag(e.clientX - drag.last[0], e.clientY - drag.last[1], t);
      drag.last = [e.clientX, e.clientY];
      drag.samples.push([t, e.clientX]);
      while(drag.samples.length > 2 && t - drag.samples[0][0] > 0.08) drag.samples.shift();
    });
    const end = (e: PointerEvent) => {
      if(!drag) return;
      const t = clock.now(), first = drag.samples[0];
      const v = t - first[0] > 0.005 ? (e.clientX - first[1]) / (t - first[0]) : 0;
      this.gem.endDrag(v, t, e.type === 'pointercancel');
      drag = null;
      this.hold(false);
      this.options.onFocus();
    };
    listen('pointerup', end);
    listen('pointercancel', end);
  }

  /**
   * The finger landed on the gem or let it go: it grows on a spring, comes
   * back with a damped swing, and a push runs over the digits from the gem.
   */
  private hold(on: boolean) {
    if(this.held === on) return;
    this.gripFrom = this.grip;
    this.held = on;
    this.holdChange = clock.now();
    navigator.vibrate?.(on ? 8 : 5);
  }

  /** The growth under the finger: 0 — in the line, 1 — almost fourfold. */
  private gripAt(now: number): number {
    const e = now - this.holdChange;
    if(this.held) return this.gripFrom + (1 - this.gripFrom) * settle(e / 0.46);
    // * let go — a damped swing: it overshoots its size and settles
    return this.gripFrom * Math.exp(-4.2 * e) * Math.cos(7 * e);
  }

  // MARK: Frame

  /** The layout reads of a frame — before the frame writes anything. */
  public measure() {
    this.rtl = isDocumentRTL(this.elements.root.ownerDocument);
    this.screenRect = this.elements.root.getBoundingClientRect();
    this.slotRect = this.elements.slot.getBoundingClientRect();
    // * the entrance may start in this very frame, after the measuring: the line is always read
    this.lineRect = this.elements.line.getBoundingClientRect();
  }

  public frame(now: number) {
    if(this.destroyed) return;
    if(!this.screenRect) this.measure();
    const {symbol, gem: gemCanvas, glow, ring, layer} = this.elements;
    const digits = this.options.digits;
    this.arrowsFrame(now);
    this.grip = this.gripAt(now);
    const grip = Math.max(0, this.grip);

    const screen = this.screenRect, slotRect = this.slotRect, lineRect = this.lineRect;
    this.screenRect = this.slotRect = this.lineRect = undefined;
    const slotX = slotRect.left + slotRect.width / 2, slotY = slotRect.top + slotRect.height / 2;

    // A swap: the gem and the symbol turn around the vertical — or, without motion, cross-fade in their place.
    let gemSide = this.gramMode ? 1 : 0, flip = '';
    if(this.swapStart !== null && !this.motion) {
      const q = Math.min(1, (now - this.swapStart) / SWAP_FADE);
      if(q >= 1) this.swapStart = null;
      gemSide = this.gramMode ? q : 1 - q;
      symbol.style.transform = symbol.style.filter = gemCanvas.style.filter = '';
    } else if(this.swapStart !== null) {
      const since = now - this.swapStart;
      const q = ease(since / SPIN);
      if(since > 1.9) this.swapStart = null;
      const toGem = this.gramMode;
      // Landed, the sign swings like a pendulum and dies down: one and a half
      // swings a second, gone in a second and a bit.
      const u = since - 0.3;
      const tilt = u > 0 ? 20 * Math.sin(2 * Math.PI * 1.6 * u) * Math.exp(-u / 0.5) : 0;
      const hop = Math.sin(Math.PI * q);
      gemSide = toGem ? (q >= 0.5 ? 1 : 0) : (q < 0.5 ? 1 : 0);
      const leaving = 180 * q, arriving = 180 * q - 180;
      const gemAngle = toGem ? arriving : leaving, symbolAngle = toGem ? leaving : arriving;
      const gemDrop = toGem ? 16 * (1 - q) : 16 * q, symbolDrop = toGem ? 16 * q : 16 * (1 - q);
      const b = 1 + 0.14 * pop(since);
      flip = `translateY(${gemDrop}px) rotateY(${gemAngle}deg) rotateZ(${toGem ? tilt : 0}deg) scale(${b})`;
      symbol.style.transform = `translateY(${symbolDrop}px) rotateY(${symbolAngle}deg) rotateZ(${toGem ? 0 : tilt}deg) scale(${b})`;
      symbol.style.filter = gemCanvas.style.filter = `blur(${6 * hop}px)`;
    } else {
      symbol.style.transform = symbol.style.filter = gemCanvas.style.filter = '';
    }
    symbol.style.opacity = String(1 - gemSide);

    // The bounce on every change of the amount — of the gem and of the symbol.
    const bounce = this.held ? 0 : pop(now - this.changed);
    if(this.swapStart === null && bounce > 0) symbol.style.transform = `scale(${1 + 0.14 * bounce})`;

    // The send.
    let swell = 1, energy = 0, stage: SendStage = null;
    if(this.sendStart !== null) {
      const t = now - this.sendStart;
      stage = sendStage(t);
      energy = stage.energy;
      swell = 1 + 0.35 * stage.hit + 0.03 * energy * stage.breath;
      if(this.bursts < 1 && t > 0.03) {
        this.gem.burst();
        this.bursts = 1;
      }
      if(this.bursts < 2 && t > 0.45) {
        this.gem.burst();
        this.bursts = 2;
      }
      this.gem.style.rotationSpeed = IDLE_SPIN + (SEND_SPIN - IDLE_SPIN) * energy;
      this.gem.style.swayScale = 1 + 1.6 * energy;
      this.gem.style.starOpacity = Math.max(energy, 0.6);
    }

    // The line's glyphs: in a send they catch the hit one after another; when
    // the gem has grown or come back — a push runs from the gem, with a rebound.
    // Right to left the gem stands after the last glyph: the push starts there.
    const pushT = now - this.holdChange;
    const cells = digits.cells.length;
    digits.cells.forEach((cell, index) => {
      const i = this.rtl ? cells - 1 - index : index;
      let k = 1;
      if(stage) {
        const t = now - this.sendStart;
        k = 1 + 0.1 * stage.hitAfter(0.055 * i) + 0.04 * energy * Math.sin(2 * Math.PI * 1.1 * (t - 0.11 * i));
      } else {
        const t = pushT - 0.035 * i;
        if(t > 0 && t < 0.7) k = 1 + 0.06 * Math.sin(2 * Math.PI * 1.6 * t) * Math.exp(-t / 0.18);
      }
      cell.el.style.transform = k === 1 ? '' : `scale(${k})`;
    });

    // The grown gem at the screen's edge (the left one, the right one right to
    // left) would go off screen: it moves in exactly as far as needed to be
    // seen whole. The width follows the raw travel: on the way back the gem
    // overshoots its size, shrinks a little and settles.
    const grown = GEM_WIDTH * this.lineScale * (1 + HOLD_GROW * this.grip) * swell;
    let gemX: number, gemY: number, points = grown * (1 + 0.14 * bounce);
    const opening = this.opening;
    if(opening !== null && lineRect) {
      // The entrance: from the line's middle to the slot, up along an arc, shrinking from six times its size.
      const middle = lineRect.left + lineRect.width / 2;
      this.nudge = 0;
      gemX = middle + (slotX - middle) * opening;
      gemY = slotY + introLift(opening);
      points *= introScale(opening);
    } else {
      this.nudge = this.rtl ?
        Math.min(0, screen.right - 16 - grown * 0.6 - slotX) :
        Math.max(0, screen.left + 16 + grown * 0.6 - slotX);
      gemX = slotX + this.nudge;
      gemY = slotY;
    }

    this.gem.style.widthPoints = points;

    if(stage) {
      const lifted = this.launched;
      Object.assign(glow.style, {width: `${points * 1.05}px`, height: `${points * 1.05}px`,
        left: `${-points * 0.525}px`, top: `${-points * 0.525}px`, filter: `blur(${points * 0.36}px)`,
        opacity: String(lifted ? 0 : 0.22 * energy), transition: 'opacity 0.25s'});
      const ringK = stage.ring, size = points * (1.2 + 3 * ringK);
      Object.assign(ring.style, {width: `${size}px`, height: `${size}px`, left: `${-size / 2}px`, top: `${-size / 2}px`,
        borderColor: `rgba(0,136,255,${0.32 * (1 - ringK)})`, borderWidth: `${1 + 2 * (1 - ringK)}px`,
        filter: `blur(${1 + 3 * ringK}px)`, opacity: String(ringK > 0.001 && ringK < 0.999 && !lifted ? 1 : 0)});
      // The gem breaks away — once the transfer went through.
      if(!this.launched && this.launchRequest && now - this.sendStart >= LAUNCH_AT) {
        this.launched = true;
        const callback = this.launchRequest;
        this.launchRequest = undefined;
        callback({gem: this.gem, from: [gemX, gemY], width: points, spin: this.gem.style.rotationSpeed});
        this.gem.style.hideStone = true;
      }
    }

    this.lens(grip, slotX, slotY);

    // The gem — at the glyph's place, in the screen's coordinates.
    layer.style.transform = `translate(${gemX - screen.left}px, ${gemY - screen.top}px)`;
    gemCanvas.style.transform = `translate(${-this.canvasSize / 2}px, ${-this.canvasSize / 2}px) ${flip}`;
    gemCanvas.style.opacity = String(gemSide);
    this.gem.render(now);
  }

  /**
   * The amount through the grown gem: the gem is dense, and the same glyphs
   * are drawn once more — over it, through its faceted lens, only inside its
   * silhouette, in deep blue at half strength. It reads as a number behind
   * a thickness of glass.
   */
  private lens(grip: number, slotX: number, slotY: number) {
    if(grip <= 0.002) {
      this.gem.setLens(null);
      return;
    }

    const pose = this.gem.pose;
    const size = this.canvasSize, half = size / 2;
    // A silhouette slightly narrower than the drawn gem: the lens edge hides under its rim.
    const hull = gemHull(this.outline, pose.yaw, pose.pitch, this.gem.style.widthPoints / 2 * 0.96)
    .map((p): Vec2 => [half + p[0], half + p[1]]);
    // The glyphs — in the canvas's coordinates as it would be without the gem's shift.
    const g = this.lensCanvas.getContext('2d');
    const k = this.pr;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, size, size);
    g.fillStyle = this.options.lensInk || LENS_INK;
    g.textBaseline = 'alphabetic';
    const ox = slotX - half, oy = slotY - half;
    const draw = (el: HTMLElement, text: string) => {
      const style = getComputedStyle(el);
      // * the styles are the line's own, before its scale; the boxes are on screen, after it
      g.font = `${style.fontWeight} ${parseFloat(style.fontSize) * this.lineScale}px ${style.fontFamily}`;
      const m = g.measureText(text);
      const r = el.getBoundingClientRect();
      const line = parseFloat(style.lineHeight) * this.lineScale;
      const base = r.top + (r.height - line) / 2 + (line - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      g.fillText(text, r.left + (r.width - m.width) / 2 - ox, base - oy);
    };
    for(const cell of this.options.digits.cells) if(cell.el.isConnected && cell.glyph) draw(cell.glyph, cell.c);
    draw(this.elements.code, this.elements.code.textContent);
    this.gem.setText(this.lensCanvas);
    this.gem.setLens({hull, center: [half, half], strength: Math.min(1, grip), spin: pose.yaw,
      textScale: 1, textShift: this.nudge, opacity: 0.55});
  }

  /**
   * The pill's arrows: each one leaves its own way past the edge, jumps to the
   * opposite edge there and comes back to its place, stretched and smeared by
   * the speed.
   */
  private arrowsFrame(now: number) {
    const arrows = this.elements.arrows;
    const since = this.swapStart === null || !this.motion ? 1 : (now - this.swapStart) / SPIN;
    if(since >= 1) {
      for(const a of arrows) a.style.transform = a.style.filter = '';
      return;
    }
    const p = ease(since);
    const pace = Math.pow(1 - Math.min(1, since), 1.2);
    const loop = p < 0.5 ? 2 * p : 2 * p - 2;
    arrows.forEach((a, i) => {
      const dir = i === 0 ? -1 : 1;
      a.style.transformOrigin = dir > 0 ? '50% 100%' : '50% 0%';
      a.style.transform = `translateY(${dir * 22 * loop}px) scaleY(${1 + 0.55 * pace})`;
      a.style.filter = `blur(${(2.5 * pace * pace).toFixed(2)}px)`;
    });
  }

  /** The screen closed: the line's glyphs drop their send ripple. */
  public close() {
    this.options.digits.cells.forEach((c) => {
      c.el.style.transform = '';
    });
  }

  /** Removes the listeners and releases the gem. */
  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.listenerSetter.removeAll();
    this.gem.destroy();
  }
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// The live gem in the middle of the Add Funds code, as on iOS (InteractiveDiamondComponent, centred): it turns
// once in 26 s; held, it grows almost fourfold and the code shows through its facets; pulled, it turns with the
// finger, and a throw spins it. On the sheet's first appearance it drops in: five times its size, a little up
// and down into its place with a slight undershoot.

import {Appearance, GemView} from '@components/wallet/visual/gem/stage';
import {gemAssets, gemHull} from '@components/wallet/visual/gem/geometry';
import {settle} from '@components/wallet/visual/motion';
import {pixelRatio} from '@components/wallet/visual/dom';
import {clock} from '@components/wallet/visual/clock';
import type {Vec2} from '@components/wallet/visual/math';

const IDLE_SPIN = 2 * Math.PI / 26;
/** held: 1 + 2.75 times */
const HOLD_GROW = 2.75;
/** the growth's spring and the damped swing back after a release, seconds */
const GRIP_IN = 0.46;
const RELEASE = 1.96;
/** the gem's canvas while it is grown, and while it drops in five times its size */
const EXPANDED_CANVAS = 220;
const OPENING_CANVAS = 320;
/** a pull of this many points turns it by the drag's unit */
const DRAG_SCALE = 220;
/** the code through the grown gem */
const LENS_OPACITY = 0.9;

/** The drop-in: iOS's InteractiveDiamondIntro at speed 1.5 and damping .64, after the reveal's .03 s */
const DROP_DELAY = 0.03;
const DROP_SPEED = 1.5;
const DROP_OMEGA = 2 * Math.PI / 0.9;
const DROP_DAMPING = 0.64;
export const WALLET_GEM_DROP_TIME = DROP_DELAY + (1.2 - 0.18) / DROP_SPEED;

function dropProgress(elapsed: number) {
  const t = Math.max(elapsed - DROP_DELAY, 0) * DROP_SPEED;
  const decay = DROP_DAMPING * DROP_OMEGA, frequency = DROP_OMEGA * Math.sqrt(1 - DROP_DAMPING * DROP_DAMPING);
  return 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + (decay - 1.2) / frequency * Math.sin(frequency * t));
}

export class WalletQrGem {
  private gem: GemView;
  private outline = gemAssets().outline;
  /** at rest: the gem's width and its canvas, points */
  private width = 0;
  private resting = 0;
  private canvasSide = 0;
  private transform = '';
  private held = false;
  private grip = 0;
  private gripFrom = 0;
  private holdChange: number = null;
  private dropStart: number = null;
  private drag: {last: Vec2, samples: Vec2[], pointerId: number};
  private code: {canvas: HTMLCanvasElement, center: Vec2, side: number};
  private lensCanvas: HTMLCanvasElement;
  private lensDirty = true;
  private lensOn = false;
  /** without movement: the gem at rest is drawn, and stands so until something changes */
  private stillDrawn = false;

  /** Throws without WebGL2 */
  constructor(
    private canvas: HTMLCanvasElement,
    private hit: HTMLElement,
    private options: {
      /** the gem turns by itself, drops in and spins when thrown */
      motion: boolean,
      /** a finger came down on it */
      onHold?: () => void
    }
  ) {
    this.gem = new GemView(canvas, {
      appearance: Appearance.blue,
      rotationSpeed: options.motion ? IDLE_SPIN : 0,
      // * without movement it stands still: only the finger turns it
      swayScale: options.motion ? 1 : 0,
      lightBackground: true
    });
    this.gem.dragScale = DRAG_SCALE;
    hit.addEventListener('pointerdown', this.onDown);
    hit.addEventListener('pointermove', this.onMove);
    hit.addEventListener('pointerup', this.onUp);
    hit.addEventListener('pointercancel', this.onUp);
  }

  /** The cleared square it stands in, CSS px: the gem is .72 of it */
  public setCutout(side: number) {
    this.width = side * 0.72;
    this.resting = Math.ceil(side);
    this.canvasSide = 0;
  }

  /** The finished code the grown gem refracts, and the gem's centre on it, CSS px */
  public setCode(canvas: HTMLCanvasElement, center: Vec2, side: number) {
    this.code = {canvas, center, side};
    this.lensDirty = true;
  }

  /** Movement turned on or off while it stands (the system's reduced motion): it stops where it is, or turns on */
  public setMotion(motion: boolean) {
    if(this.options.motion === motion) return;
    this.options.motion = motion;
    this.gem.style.rotationSpeed = motion ? IDLE_SPIN : 0;
    this.gem.style.swayScale = motion ? 1 : 0;
    if(!motion) this.dropStart = null;
    this.stillDrawn = false;
  }

  /** The drop-in, from `start` (the reveal's start) */
  public drop(start: number) {
    if(this.options.motion) this.dropStart = start;
  }

  public get busy() {
    return this.dropStart !== null || this.isExpanded(clock.now()) || this.gem.isDragging;
  }

  public frame(now: number) {
    let scale = 1, lift = 0;
    if(this.dropStart !== null) {
      const elapsed = now - this.dropStart;
      if(elapsed >= WALLET_GEM_DROP_TIME) {
        this.dropStart = null;
      } else {
        // * past its place it comes back half as far
        const progress = dropProgress(elapsed);
        const bounce = progress > 1 ? 0.49 : 1;
        const remaining = 1 - progress;
        const offset = remaining < 0 ? -Math.pow(-remaining, 1.25) : Math.pow(remaining, 1.25);
        scale = 1 + 4 * offset * bounce;
        lift = -192 * progress * (1 - progress) * bounce;
      }
    }

    this.grip = this.gripAt(now);
    const side = this.dropStart !== null ? OPENING_CANVAS : this.isExpanded(now) ? EXPANDED_CANVAS : this.resting;
    if(side !== this.canvasSide) {
      this.canvasSide = side;
      this.stillDrawn = false;
      this.gem.setSize(side, pixelRatio());
      this.canvas.style.width = this.canvas.style.height = side + 'px';
    }

    const transform = `translate(-50%, -50%) translateY(${lift.toFixed(2)}px)`;
    if(transform !== this.transform) {
      this.transform = this.canvas.style.transform = transform;
    }

    this.gem.style.widthPoints = this.width * scale * (1 + HOLD_GROW * this.grip);
    this.updateLens();
    // * without movement nothing on the gem runs by itself: at rest its light holds, and it is drawn once
    if(!this.options.motion && !this.busy) {
      if(this.stillDrawn) return;
      this.stillDrawn = true;
      this.gem.resetClock();
    } else {
      this.stillDrawn = false;
    }

    this.gem.render(now);
  }

  /** The page was hidden: no jump on return */
  public resetClock() {
    this.gem.resetClock();
  }

  public destroy() {
    const hit = this.hit;
    hit.removeEventListener('pointerdown', this.onDown);
    hit.removeEventListener('pointermove', this.onMove);
    hit.removeEventListener('pointerup', this.onUp);
    hit.removeEventListener('pointercancel', this.onUp);
    this.gem.destroy();
  }

  private isExpanded(now: number) {
    return this.held || (this.holdChange !== null && now - this.holdChange < RELEASE && this.gripFrom !== 0);
  }

  /** The growth under the finger: 0 at rest, 1 grown; a release swings past rest and settles */
  private gripAt(now: number) {
    if(this.holdChange === null) return 0;
    const elapsed = now - this.holdChange;
    if(this.held) return this.gripFrom + (1 - this.gripFrom) * settle(elapsed / GRIP_IN);
    if(elapsed >= RELEASE) return 0;
    return this.gripFrom * Math.exp(-4.2 * elapsed) * Math.cos(7 * elapsed);
  }

  private hold(on: boolean, now: number) {
    if(this.held === on) return;
    this.gripFrom = this.gripAt(now);
    this.held = on;
    this.holdChange = now;
  }

  /** The code through the grown gem: the modules bent by its facets, inside its silhouette */
  private updateLens() {
    const grip = this.grip;
    if(grip <= 0.002 || !this.code || this.canvasSide !== EXPANDED_CANVAS) {
      if(this.lensOn) {
        this.gem.setLens(null);
        this.lensOn = false;
      }

      return;
    }

    const half = EXPANDED_CANVAS / 2;
    if(this.lensDirty) {
      this.lensDirty = false;
      const pr = pixelRatio();
      const canvas = this.lensCanvas ??= document.createElement('canvas');
      canvas.width = canvas.height = Math.round(EXPANDED_CANVAS * pr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      const {canvas: code, center, side} = this.code;
      ctx.drawImage(code, 0, 0, code.width, code.height, half - center[0], half - center[1], side, side);
      this.gem.setText(canvas);
    }

    const pose = this.gem.pose;
    const hull = gemHull(this.outline, pose.yaw, pose.pitch, this.gem.style.widthPoints / 2 * 0.96)
    .map((p): Vec2 => [half + p[0], half + p[1]]);
    this.gem.setLens({hull, center: [half, half], strength: Math.min(1, grip), spin: pose.yaw, textScale: 1, textShift: 0, opacity: LENS_OPACITY});
    this.lensOn = true;
  }

  private onDown = (e: PointerEvent) => {
    if(this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try {
      this.hit.setPointerCapture(e.pointerId);
    } catch(err) {}

    const now = clock.now();
    this.drag = {last: [e.clientX, e.clientY], samples: [[now, e.clientX]], pointerId: e.pointerId};
    // * a press ends the drop-in where it is: the gem is the finger's now
    this.dropStart = null;
    this.gem.beginDrag(now);
    this.hold(true, now);
    this.options.onHold?.();
  };

  private onMove = (e: PointerEvent) => {
    const drag = this.drag;
    if(!drag || e.pointerId !== drag.pointerId) return;
    const now = clock.now();
    this.gem.drag(e.clientX - drag.last[0], e.clientY - drag.last[1], now);
    drag.last = [e.clientX, e.clientY];
    drag.samples.push([now, e.clientX]);
    while(drag.samples.length > 2 && now - drag.samples[0][0] > 0.08) drag.samples.shift();
  };

  private onUp = (e: PointerEvent) => {
    const drag = this.drag;
    if(!drag || e.pointerId !== drag.pointerId) return;
    const now = clock.now(), first = drag.samples[0];
    const velocity = this.options.motion && now - first[0] > 0.005 ? (e.clientX - first[1]) / (now - first[0]) : 0;
    this.gem.endDrag(velocity, now, e.type === 'pointercancel');
    this.drag = undefined;
    this.hold(false, now);
  };
}

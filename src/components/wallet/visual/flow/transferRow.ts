// A transfer's row in the history while the send flow plays it: the row
// opens, rises over the list — rounded, with a shadow, slightly larger — and
// sags from the gem's hit. Then the gem lives in it and spins fast while the
// transfer goes: the amount big in the middle, a sheen running along the row.
// When it went through, stars fly out of the gem across the row, the gem hops
// and shrinks into the icon next to the amount, and the row sits back down.
//
// Expected DOM — built and inserted (prepended to the list) by the caller
// before the row is constructed:
//
//   <li class="row-shell lifted">                   shell: opens from 0 to ROW_HEIGHT; `.lifted` puts it
//     <div class="row">                             row: above its siblings (z-index 1, radius 22)
//       <div class="row-plate"></div>               plate: absolute, inset 0, radius 22, white
//       <span class="avatar-wrap">…<svg class="pending-badge"/></span>   badge (optional): fades out
//       <div class="info">…</div>
//       <div class="amount"><span class="amount-text"></span><img class="gram hidden"></div>
//       <canvas class="row-overlay"></canvas>       overlay: absolute at 0,0, no pointer events
//       <canvas class="row-gem"></canvas>           gemCanvas: absolute at 0,0, no pointer events
//     </div>
//   </li>
//
// The caller's part, as in the design: `onMorph` (MORPH_AT after the
// completion) reveals the gram icon (`.gram` loses `.hidden`, gets `.pop`);
// `onFinish` (STAR_SPAN + 0.05 after it) removes `.lifted`, the badge, the
// plate, the overlay and the gem canvas, and drops `.pop`.

import {GemView, Appearance} from '@components/wallet/visual/gem/stage';
import {settle, linearEasing} from '@components/wallet/visual/motion';
import {clock} from '@components/wallet/visual/clock';
import {pixelRatio} from '@components/wallet/visual/dom';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import {sheen, starBurst} from '@components/wallet/visual/flow/overlay';
import {
  BIG_SCALE,
  FLY_CANVAS,
  GEM_INK,
  gemSlot,
  LIFT_RISE,
  LIFT_SCALE,
  MORPH_AT,
  PENDING_GEM,
  PLATE_OUT_X,
  PLATE_OUT_Y,
  ROW_DELAY,
  ROW_HEIGHT,
  ROW_SPIN,
  rowBig,
  rowDip,
  rowLift,
  STAR_SPAN,
  TRAVEL
} from '@components/wallet/visual/flow/timing';

export interface TransferRowElements {
  shell: HTMLElement,
  row: HTMLElement,
  plate: HTMLElement,
  amountText: HTMLElement,
  overlay: HTMLCanvasElement,
  gemCanvas: HTMLCanvasElement,
  badge?: Element,
  /** "Sending" in the date's place while the transfer goes: they cross-fade once it went (iOS) */
  status?: HTMLElement,
  date?: HTMLElement
}

export interface TransferRowOptions {
  /**
   * No gem lands in it (a collectible's transfer, as in the desktop client): the row rises with its sheen and
   * clock and sits back down when the transfer went through, with no stars and no icon to become.
   */
  gemless?: boolean,
  /**
   * No gem flies into it: a transfer that goes while the window shows it, without a send just before (iOS: every
   * pending transfer plays) — the row's gem is there from the start, with no hit.
   */
  noFlight?: boolean,
  /** the row opens and comes out from under the buttons; off for a row that was already in the list */
  entrance?: boolean,
  /** nothing moves (iOS reduce motion): no lift, no sheen, no gem — the clock and "Sending" only */
  reduced?: boolean
}

export interface TransferRowCallbacks {
  /** The gem becomes the icon: reveal the gram icon. */
  onMorph?: () => void,
  /** The row is back in the list: remove the flow's elements. */
  onFinish?: () => void
}

export class TransferRow {
  public shell: HTMLElement;
  public row: HTMLElement;
  public plate: HTMLElement;
  public amountText?: HTMLElement;
  public overlay: HTMLCanvasElement;
  public gemCanvas: HTMLCanvasElement;
  public badge: Element;
  public gem: GemView;
  public width: number;
  /** The row's own height: ROW_HEIGHT in the design. */
  public height: number;
  public liftStart: number;
  public landStart: number;
  /** clock.now() of the landing; null while the gem flies. */
  public landed: number;
  public settleStart: number;
  public doneStart: number;
  public finished: boolean;
  private overlayCtx: CanvasRenderingContext2D;
  private callbacks: TransferRowCallbacks;
  private completeOnLand: boolean;
  private gemless: boolean;
  private reduced: boolean;
  private status: HTMLElement;
  private date: HTMLElement;
  private timers: (() => void)[];
  /** the row is laid out right to left: the amount and the gem at its left end, the sheen running leftwards */
  private rtl: boolean;

  /**
   * `liftStart` — when the row starts rising (the throw's time + ROW_DELAY in
   * the design). The elements must already be in the document. Throws when
   * WebGL2 is unavailable.
   */
  constructor(elements: TransferRowElements, liftStart: number, callbacks: TransferRowCallbacks = {}, options: TransferRowOptions = {}) {
    const {shell, row, gemCanvas} = elements;
    this.shell = shell;
    this.row = row;
    this.plate = elements.plate;
    this.amountText = elements.amountText;
    this.overlay = elements.overlay;
    this.gemCanvas = gemCanvas;
    this.badge = elements.badge;
    this.callbacks = callbacks;
    this.reduced = !!options.reduced;
    // * nothing moves: no gem either (iOS draws none under reduce motion)
    this.gemless = !!options.gemless || this.reduced;
    this.status = elements.status;
    this.date = elements.date;
    this.timers = [];
    this.rtl = isDocumentRTL(row.ownerDocument);
    Object.assign(gemCanvas.style, {width: `${FLY_CANVAS}px`, height: `${FLY_CANVAS}px`, visibility: 'hidden'});
    this.height = shell.offsetHeight || ROW_HEIGHT;
    if(this.status) this.status.style.opacity = '1';
    if(this.date) this.date.style.opacity = '0';

    // The opening: the list makes room on a spring, and the row — already a
    // white card above it — comes out from under the buttons, growing from a
    // smaller one and fading in. The rows below move out from under it
    // instead of showing through.
    if(options.entrance !== false && !this.reduced) {
      const ease = linearEasing(settle, 32);
      shell.animate([{height: '0px'}, {height: `${this.height}px`}], {duration: 520, easing: ease});
      row.animate([
        {opacity: 0, scale: '0.86', translate: '0 -22px'},
        {opacity: 1, offset: 0.35},
        {opacity: 1, scale: '1', translate: '0 0'}
      ], {duration: 560, easing: ease});
    }

    row.style.transformOrigin = '50% 50%';

    if(!this.gemless) {
      this.gem = new GemView(gemCanvas, {
        appearance: Appearance.blue, rotationSpeed: ROW_SPIN, swayScale: 1.6, widthPoints: PENDING_GEM * GEM_INK,
        lightBackground: true, starZoom: 0.55, starEmission: 0.3, burstSize: 0.7
      });
      this.gem.setSize(FLY_CANVAS, pixelRatio());
    }

    this.overlayCtx = this.overlay.getContext('2d');
    this.width = row.offsetWidth;
    this.liftStart = liftStart;
    this.landStart = options.noFlight ? -Infinity : liftStart - ROW_DELAY + TRAVEL;
    // * nothing to wait for: the row is ready to complete at once
    this.landed = this.gemless || options.noFlight ? liftStart : null;
    if(options.noFlight && this.gem) {
      // * no flight: the row's gem is simply there, fading in as the row rises
      gemCanvas.style.visibility = 'visible';
      gemCanvas.animate([{opacity: 0}, {opacity: 1}], {duration: 200});
    }
    this.settleStart = null;
    this.doneStart = null;
    this.finished = false;
    this.completeOnLand = false;
  }

  /** The flying gem has landed: the row takes it over in the same frame the flying one disappears. */
  public land(fly: GemView, now: number) {
    this.landed = now;
    this.gem.adopt(fly);
    this.gem.kick(7, 0.7);
    this.gemCanvas.style.visibility = 'visible';
    navigator.vibrate?.(12);
    if(this.completeOnLand) this.complete(now);
  }

  /**
   * The transfer went through: stars across the row, the gem hops and becomes
   * the icon. Called before the landing, it waits for it.
   */
  public complete(now = clock.now()) {
    if(this.finished || this.doneStart !== null) return;
    if(this.landed === null) {
      this.completeOnLand = true;
      return;
    }
    this.settleStart = this.doneStart = now;
    // * the clock goes and the date comes back in "Sending"'s place (iOS clockAlpha: a cosine over 0.35 s)
    const settle = this.reduced ? 150 : 350;
    const options: KeyframeAnimationOptions = {duration: settle, easing: 'ease-in-out', fill: 'forwards'};
    this.badge?.animate([{opacity: 1, scale: 1}, {opacity: 0, scale: 0.001}], options);
    this.status?.animate([{opacity: 1}, {opacity: 0}], options);
    this.date?.animate([{opacity: 0}, {opacity: 1}], options);
    if(this.gemless) {
      this.timers.push(clock.after(settle / 1000, () => this.finish()));
      return;
    }

    this.gem.kick(12, 0.7);
    this.gem.style.backgroundStars = true;
    this.gem.burst();
    navigator.vibrate?.(20);
    this.timers.push(clock.after(MORPH_AT, () => this.callbacks.onMorph?.()));
    this.timers.push(clock.after(STAR_SPAN + 0.05, () => this.finish()));
  }

  private finish() {
    this.finished = true;
    this.row.style.transform = '';
    if(this.amountText) this.amountText.style.transform = '';
    if(this.status) this.status.style.opacity = '0';
    if(this.date) this.date.style.opacity = '1';
    this.gem?.destroy();
    this.callbacks.onFinish?.();
  }

  public frame(now: number) {
    if(this.finished) return;
    const lift = this.reduced ? 0 : rowLift(now, this.liftStart, this.settleStart);
    // * a row with no gem is not hit, and keeps what it shows as it is
    const big = this.gemless ? 0 : rowBig(now, this.settleStart);
    const dip = this.gemless ? 0 : rowDip(now, this.landStart);
    this.row.style.transform = `translateY(${-LIFT_RISE * lift + dip}px) scale(${1 + LIFT_SCALE * lift - 0.004 * dip})`;
    // The plate is white at once, the shadow follows the lift. Lifted, it is
    // wider than the row and goes slightly beyond the history block's edges.
    const k = Math.max(0, lift);
    const mx = PLATE_OUT_X * k, my = PLATE_OUT_Y * k;
    this.plate.style.inset = `${-my}px ${-mx}px`;
    this.plate.style.boxShadow = `0 ${6 * k}px ${14 * k}px rgba(0,0,0,${0.13 * Math.min(1, k)})`;
    // The pending amount — bigger and in the row's middle, before the gem (left of it, right of it right to left).
    if(this.amountText) this.amountText.style.transform = `translate(${-24 * big * (this.rtl ? -1 : 1)}px, ${19.5 * big}px) scale(${1 + BIG_SCALE * big})`;

    // The sheen and the stars follow the plate's outline; the canvas has room for its overhang.
    const w = this.width, H = this.height, OX = PLATE_OUT_X + 2, OY = PLATE_OUT_Y + 2;
    const scale = pixelRatio();
    if(this.overlay.width !== Math.round((w + 2 * OX) * scale)) {
      this.overlay.width = Math.round((w + 2 * OX) * scale);
      this.overlay.height = Math.round((H + 2 * OY) * scale);
      Object.assign(this.overlay.style, {width: `${w + 2 * OX}px`, height: `${H + 2 * OY}px`, left: `${-OX}px`, top: `${-OY}px`});
    }
    const g = this.overlayCtx;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, w + 2 * OX, H + 2 * OY);
    g.translate(OX - mx, OY - my);
    const pw = w + 2 * mx, ph = H + 2 * my;
    // * right to left the sheen runs from the right and the stars fly out of the gem at the left end: the same
    // * drawing, mirrored — so it is drawn with the left-to-right geometry
    if(this.rtl) {
      g.translate(pw, 0);
      g.scale(-1, 1);
    }
    if(this.doneStart === null && !this.reduced) sheen(g, pw, ph, now - this.liftStart);
    if(this.gemless) return;
    const [sx, sy] = gemSlot(w, 1, H);
    if(this.doneStart !== null) starBurst(g, pw, ph, now - this.doneStart, [sx + mx, sy + my]);

    if(this.landed === null) {
      // While the gem flies, the row's canvas already stands in place — the flying one aims at it.
      const [x, y] = gemSlot(w, big, H, this.rtl);
      this.gemCanvas.style.transform = `translate(${x - FLY_CANVAS / 2}px, ${y - FLY_CANVAS / 2}px)`;
      return;
    }
    // The gem in the row: the hit swells it for a moment; at the end it hops
    // and shrinks into the icon (13 — the icon's width), and fades.
    const finish = this.doneStart === null ? null : now - this.doneStart;
    const sinceLand = now - this.landStart;
    let width = PENDING_GEM;
    if(finish === null) {
      if(sinceLand > 0 && sinceLand < 0.36) width *= 1 + 0.26 * Math.sin(Math.PI * sinceLand / 0.36) * (1 - 0.3 * sinceLand / 0.36);
    } else {
      const pop = Math.sin(Math.PI * Math.min(1, finish / 0.26)) * 0.3;
      const shrink = Math.max(0, Math.min(1, (finish - 0.18) / 0.16));
      width = PENDING_GEM * (1 + pop) * (1 - shrink) + 13 * shrink;
    }
    const hop = finish !== null && finish < 0.34 ? Math.sin(Math.PI * finish / 0.34) * 11 : 0;
    const fade = finish !== null && finish > MORPH_AT + 0.03 ? Math.max(0, 1 - (finish - MORPH_AT - 0.03) / 0.1) : 1;
    this.gem.style.widthPoints = width * GEM_INK;
    const [x, y] = gemSlot(w, big, H, this.rtl);
    this.gemCanvas.style.transform = `translate(${x - FLY_CANVAS / 2}px, ${y - hop - FLY_CANVAS / 2}px)`;
    this.gemCanvas.style.opacity = String(fade);
    this.gem.render(now);
  }

  /** Cancels the pending steps and releases the row's gem. */
  public destroy() {
    for(const cancel of this.timers) cancel();
    this.timers = [];
    this.finished = true;
    this.gem?.destroy();
  }
}

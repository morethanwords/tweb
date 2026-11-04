/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// The card's gem under a finger, the way iOS holds it in a chat (InteractiveDiamondComponent, expanded downward):
// pressed, it grows to three times its size and down over the amount, which shows through its facets; pulled, it
// turns with the finger, and a throw spins it; let go, it springs back, and a moment later the card takes the hit.
// Comes with the gem's renderer, so that the chat's own card stays light.

import type {GemView} from '@components/wallet/visual/gem/stage';
import {GEM_EXPANDED_CANVAS, GemLensSource} from '@components/wallet/visual/gem/lens';
import {GEM_DRAG_SCALE, GemPull} from '@components/wallet/visual/gem/pull';
import {pixelRatio} from '@components/wallet/visual/dom';
import {clock} from '@components/wallet/visual/clock';
import type {Vec2} from '@components/wallet/visual/math';
import cancelEvent from '@helpers/dom/cancelEvent';

/** held: three times its size, and down by 12 pt for every size it grew (iOS dragGrow, growShift) */
export const CARD_GEM_HOLD_GROW = 3;
const HOLD_SHIFT = 12;
/** a throw's push, rad/s */
const RELEASE_IMPULSE = 3 * 6.5;
/** the card takes the hit this long after the release, ms */
const LANDING_DELAY = 200;
/** the amount through the grown gem: its own colours, over the facets (iOS: preserved colours at 0.7) */
const LENS_OPACITY = 0.7;

export type CardGemHoldOptions = {
  /** CSS px for one of iOS's points: the card is iOS's, larger */
  point: number,
  /** the canvas at rest, CSS px */
  restingCanvas: number,
  /** the amount's spans, drawn into the gem as it grows over them */
  amount: () => HTMLElement[],
  /** whether a press takes the gem now (not while the transfer goes or the card is read) */
  canHold: () => boolean,
  /** the gem landed back, `power` 0…1: how far it had grown */
  onLand: (power: number) => void
};

export class CardGemHold {
  private pull: GemPull;
  /** where the press began: the gem box's centre, client px */
  private center: Vec2;
  /** a click that ends a press on the gem is the gem's, not the card's */
  private pressed = false;
  private claimedClick: MouseEvent;
  private landing: number;
  private side: number;
  private expandedSide: number;
  private lensCanvas: HTMLCanvasElement;
  private lens: GemLensSource;

  constructor(private gem: GemView, private hit: HTMLElement, private options: CardGemHoldOptions) {
    this.side = options.restingCanvas;
    this.expandedSide = Math.round(GEM_EXPANDED_CANVAS * options.point);
    gem.dragScale = GEM_DRAG_SCALE * options.point;
    this.lens = new GemLensSource(gem);
    hit.addEventListener('pointerdown', this.onDown);
    hit.addEventListener('pointermove', this.onMove);
    hit.addEventListener('pointerup', this.onUp);
    hit.addEventListener('pointercancel', this.onUp);
    hit.addEventListener('lostpointercapture', this.onUp);
    hit.addEventListener('click', this.onClick);
    hit.addEventListener('dblclick', this.onDoubleClick);
    hit.addEventListener('contextmenu', this.onContextMenu);
    hit.addEventListener('touchstart', this.onTouchStart);
  }

  /** How far it has grown: 0 at rest, 1 at three times its size */
  public get strength() {
    return Math.min(1, Math.max(0, (this.gem.grow - 1) / (CARD_GEM_HOLD_GROW - 1)));
  }

  /** The click that ended a press on the gem: the card opens nothing for it */
  public tookClick(event: MouseEvent) {
    return event === this.claimedClick;
  }

  /**
   * Before each frame: the canvas grows with the gem and the amount shows through it. Gives how far down the gem
   * goes as it grows, px.
   */
  public frame() {
    const gem = this.gem;
    const expanded = gem.isDragging || Math.abs(gem.grow - 1) > 1e-3 || Math.abs(gem.growVelocity) > 1e-3;
    const side = expanded ? this.expandedSide : this.options.restingCanvas;
    if(side !== this.side) {
      this.side = side;
      gem.setSize(side, pixelRatio());
      gem.canvas.style.width = gem.canvas.style.height = side + 'px';
    }

    // * the amount through the grown gem: its glyphs where they stand, bent by its facets inside its silhouette
    const shift = HOLD_SHIFT * this.options.point * (gem.grow - 1), half = side / 2;
    const source = side === this.expandedSide ? this.lensCanvas : undefined;
    this.lens.update(source, [half, half + shift], gem.style.widthPoints * gem.grow, this.strength, LENS_OPACITY);
    return shift;
  }

  public destroy() {
    const hit = this.hit;
    hit.removeEventListener('pointerdown', this.onDown);
    hit.removeEventListener('pointermove', this.onMove);
    hit.removeEventListener('pointerup', this.onUp);
    hit.removeEventListener('pointercancel', this.onUp);
    hit.removeEventListener('lostpointercapture', this.onUp);
    hit.removeEventListener('click', this.onClick);
    hit.removeEventListener('dblclick', this.onDoubleClick);
    hit.removeEventListener('contextmenu', this.onContextMenu);
    hit.removeEventListener('touchstart', this.onTouchStart);
    clearTimeout(this.landing);
    hit.style.cursor = '';
  }

  /** The amount as it stands now, on a canvas the size of the grown gem's and centred on it */
  private drawAmount() {
    const side = this.expandedSide, half = side / 2, pr = pixelRatio();
    const canvas = this.lensCanvas ??= document.createElement('canvas');
    canvas.width = canvas.height = Math.round(side * pr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, side, side);
    ctx.textBaseline = 'alphabetic';
    for(const span of this.options.amount()) {
      const text = span.textContent;
      if(!text) continue;
      const style = getComputedStyle(span);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      const rect = span.getBoundingClientRect();
      const ascent = ctx.measureText(text).fontBoundingBoxAscent;
      ctx.fillText(text, rect.left - this.center[0] + half, rect.top - this.center[1] + half + ascent);
    }

    this.lens.changed();
  }

  private onDown = (e: PointerEvent) => {
    this.pressed = false;
    if(this.pull || (e.pointerType === 'mouse' && e.button !== 0) || !this.options.canHold()) return;
    // * the press is the gem's: no text selected under it, nothing the chat does on a press of the message
    cancelEvent(e);
    try {
      this.hit.setPointerCapture(e.pointerId);
    } catch(err) {}

    clearTimeout(this.landing);
    this.pressed = true;
    const rect = this.hit.getBoundingClientRect();
    this.center = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    this.drawAmount();
    const now = clock.now();
    this.pull = new GemPull(e, now);
    this.gem.beginDrag(now);
    this.hit.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    const pull = this.pull;
    if(!pull || e.pointerId !== pull.pointerId) return;
    // * the button went up where its pointerup never reached the gem
    if(!e.buttons) {
      this.onUp(e);
      return;
    }

    const now = clock.now();
    const [dx, dy] = pull.move(e, now);
    this.gem.drag(dx, dy, now);
  };

  /**
   * Let go: a pointerup, a pointercancel, or a press that ended with no pointerup here (the capture lost, a move with
   * no button down) - that one lets the gem go where it is, unthrown.
   */
  private onUp = (e: PointerEvent) => {
    const pull = this.pull;
    if(!pull || e.pointerId !== pull.pointerId) return;
    this.pull = undefined;
    const now = clock.now(), cancelled = e.type === 'pointercancel', released = e.type === 'pointerup';
    const power = this.strength;
    const tapDirection = released && pull.isTap(e, now) ? (e.clientX < this.center[0] ? -1 : 1) : undefined;
    this.gem.endDrag(released ? pull.velocity(e, now) : 0, now, cancelled, tapDirection, RELEASE_IMPULSE);
    this.hit.style.cursor = '';
    if(cancelled || power <= 0) return;
    // * it lands as it springs back: unless pressed again by then, the card takes a hit as hard as it had grown
    this.landing = window.setTimeout(() => !this.pull && this.options.onLand(power), LANDING_DELAY);
  };

  private onClick = (e: MouseEvent) => {
    if(!this.pressed) return;
    this.pressed = false;
    this.claimedClick = e;
  };

  // * two quick taps spin the gem twice: they do not answer the message, as a double click on it does
  private onDoubleClick = (e: MouseEvent) => {
    if(this.options.canHold()) e.stopPropagation();
  };

  // * a finger's long press is a hold of the gem, not the message's menu; a right click still opens it
  private onContextMenu = (e: MouseEvent) => {
    if(this.pull) cancelEvent(e);
  };

  // * a finger on the gem neither swipes the message nor starts its long press
  private onTouchStart = (e: TouchEvent) => {
    if(this.options.canHold()) e.stopPropagation();
  };
}

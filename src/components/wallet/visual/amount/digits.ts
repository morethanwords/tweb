// The amount's digits — a port of the line cells from Rolling.swift, in DOM:
// - a typed glyph pops in: the cell opens with an overshooting spring, the
//   glyph comes out of a light blur and overshoots in size a little;
// - glyph over glyph (zero to a digit) melts like a drop: blur and an alpha
//   threshold, the old one sinks onto the line, the new one rises from it;
// - on a currency swap the glyphs roll on a drum.
// Digits recognise each other by their place in the number, and commas — by
// the digit group they hold: a digit typed at the end appears at the end
// instead of reassembling the middle.
//
// Usage — what the amount screen calls (the screen owns the frame loop):
//
//   const digits = new Digits(container);  // container: a flex line with `align-items: baseline`
//                                          // and the digits' font (48px/56px 600 in the design)
//   document.fonts?.ready.then(() => digits.remeasure());
//
//   const entry = new AmountEntry();       // the typed state (entry.ts)
//   digits.set(entry.integerText, entry.fractionText, 'type', true, true);  // on open: instant
//   digits.set(entry.integerText, entry.fractionText, 'type');              // a digit / point typed
//   digits.set(entry.integerText, entry.fractionText, 'type', false);       // erased
//   digits.set(entry.integerText, entry.fractionText, 'spin', up);          // currency swapped: the drum
//   digits.tick(clock.now());              // every frame: melts and the drum
//
//   digits.cells                           // the current cells: the screen scales `cell.el` per
//                                          // frame (the send ripple) and redraws `cell.glyph`'s
//                                          // `cell.c` into the gem lens
//   digits.destroy();
//
// The currency code and the converted amount next to the line are RollText
// lines (roll.ts): `new RollText(el, {pitch: 32 * 0.71 * 0.8})`, `set(text)`,
// `spin(fromSegments, toSegments, {up, colorFrom, colorTo, start: clock.now()})`
// and `frame(clock.now())` every frame.

import {settle, ease, inertia, linearEasing} from '@components/wallet/visual/motion';
import {clock} from '@components/wallet/visual/clock';
import {DrumCell, SPIN} from '@components/wallet/visual/amount/roll';
import {BlurFilter, gooFilter, layoutWidth, removeFilter, smearFilter} from '@components/wallet/visual/dom';
import '@components/wallet/visual/amount/cells.scss';

const TYPING = 0.22;
/**
 * Zero melting into a digit — longer than on iOS (0.12 there): on the web the
 * drop otherwise flashed for a single frame, and the swap read as a click.
 */
const MELT = 0.3;
/** Cap height of 48px Roboto. */
const CAP = 34;

const SETTLE = linearEasing(settle);
const EASE = linearEasing(ease);

export interface DigitCell {
  el: HTMLElement,
  /** The visible glyph; absent on the cells of a running drum. */
  glyph?: HTMLElement,
  c: string,
  frac: boolean,
  key?: string,
  isNew?: boolean,
  ghost?: HTMLElement,
  goo?: BlurFilter
}

interface Token {
  c: string,
  frac: boolean,
  key: string,
  index?: number
}

interface Melt {
  cell: DigitCell,
  start: number
}

interface Drum {
  cells: DrumCell[],
  start: number,
  tokens: Token[]
}

export class Digits {
  public container: HTMLElement;
  public cells: DigitCell[];
  private melts: Melt[];
  private widths: Map<string, number>;
  private measurer: HTMLSpanElement;
  private drum: Drum;
  private drumFilter: BlurFilter;
  private goos: Set<BlurFilter>;

  constructor(container: HTMLElement) {
    this.container = container;
    this.cells = [];
    this.melts = [];
    this.widths = new Map();
    this.drum = null;
    this.drumFilter = null;
    this.goos = new Set();
    this.measurer = document.createElement('span');
    this.measurer.className = 'amount-cell';
    this.measurer.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0';
    container.append(this.measurer);
  }

  public width(c: string, frac: boolean): number {
    const key = `${frac ? 'f' : 'i'}${c}`;
    if(!this.widths.has(key)) {
      this.measurer.className = `amount-cell${frac ? ' fraction' : ''}`;
      this.measurer.textContent = c;
      // * the line may be scaled to fit: the cell's width is the unscaled one
      const w = layoutWidth(this.measurer);
      if(w > 0) this.widths.set(key, w);
      return w;
    }
    return this.widths.get(key);
  }

  /** Fonts have loaded — widths are measured again. */
  public remeasure() {
    this.widths.clear();
    for(const cell of this.cells) cell.el.style.width = `${this.width(cell.c, cell.frac)}px`;
  }

  private make(c: string, frac: boolean, key: string): DigitCell {
    const el = document.createElement('span');
    el.className = `amount-cell${frac ? ' fraction' : ''}`;
    const glyph = document.createElement('span');
    glyph.textContent = c;
    el.append(glyph);
    return {el, glyph, c, frac, key};
  }

  /**
   * A new line: `integer` with commas, `fraction` with the point. `mode` —
   * 'type' (typing) or 'spin' (currency recount); `up` — which way to roll.
   */
  public set(integer: string, fraction: string, mode: 'type' | 'spin' = 'type', up = true, instant = false) {
    this.finishDrum();
    const tokens: Token[] = [];
    // A comma goes by its place from the right: the k-th from the right holds the same boundary.
    const commas = [...integer].filter((c) => c === ',').length;
    let comma = 0, digit = 0;
    for(const c of integer) {
      if(c === ',') tokens.push({c, frac: false, key: `sep${commas - comma++}`});
      else tokens.push({c, frac: false, key: null, index: digit++});
    }
    [...fraction].forEach((c, i) => tokens.push({c, frac: true, key: `frac${i}`}));

    if(instant || mode === 'spin') return this.replaceAll(tokens, mode === 'spin' && !instant, up);

    // Integer digits: a common head, a common tail, the middle — one by one.
    const oldDigits = this.cells.filter((c) => !c.frac && c.c !== ',');
    const newDigits = tokens.filter((t) => !t.frac && t.c !== ',');
    let head = 0;
    while(head < oldDigits.length && head < newDigits.length && oldDigits[head].c === newDigits[head].c) head++;
    let tail = 0;
    while(tail < oldDigits.length - head && tail < newDigits.length - head &&
      oldDigits[oldDigits.length - 1 - tail].c === newDigits[newDigits.length - 1 - tail].c) tail++;
    const match = new Map<Token, DigitCell>(); // new digit → old cell
    for(let i = 0; i < head; i++) match.set(newDigits[i], oldDigits[i]);
    for(let k = 0; k < tail; k++) match.set(newDigits[newDigits.length - 1 - k], oldDigits[oldDigits.length - 1 - k]);
    const oldMiddle = oldDigits.slice(head, oldDigits.length - tail);
    const newMiddle = newDigits.slice(head, newDigits.length - tail);
    const paired = Math.min(oldMiddle.length, newMiddle.length);
    for(let k = 0; k < paired; k++) match.set(newMiddle[k], oldMiddle[k]);

    const byKey = new Map(this.cells.filter((c) => c.key).map((c): [string, DigitCell] => [c.key, c]));
    const used = new Set<DigitCell>();
    const next = tokens.map((t) => {
      const old = t.key ? byKey.get(t.key) : match.get(t);
      if(old && !used.has(old)) {
        used.add(old);
        if(old.c !== t.c) this.melt(old, t.c);
        old.key = t.key;
        return old;
      }
      const cell = this.make(t.c, t.frac, t.key);
      cell.isNew = true;
      return cell;
    });

    // The gone ones stay in their old place while they shrink.
    const gone = this.cells.filter((c) => !used.has(c));
    const order: DigitCell[] = [];
    let goneIndex = 0;
    const oldOrder = new Map(this.cells.map((c, i): [DigitCell, number] => [c, i]));
    for(const cell of next) {
      if(!cell.isNew) {
        while(goneIndex < gone.length && oldOrder.get(gone[goneIndex]) < oldOrder.get(cell)) order.push(gone[goneIndex++]);
      }
      order.push(cell);
    }
    while(goneIndex < gone.length) order.push(gone[goneIndex++]);

    // Where the glyphs stood — the move is counted from these places, on screen, then back in the line's own
    // pixels (it may be scaled to fit).
    const before = new Map(next.filter((c) => !c.isNew).map((c): [DigitCell, number] => [c, c.el.getBoundingClientRect().left]));
    const lineWidth = layoutWidth(this.container);
    const scale = lineWidth ? this.container.getBoundingClientRect().width / lineWidth : 1;
    this.container.replaceChildren(this.measurer, ...order.map((c) => c.el));
    for(const cell of next) {
      if(cell.isNew) {
        cell.isNew = false;
        this.popIn(cell);
      }
    }
    for(const [cell, was] of before) {
      const dx = (was - cell.el.getBoundingClientRect().left) / (scale || 1);
      if(Math.abs(dx) > 0.5) this.slide(cell, dx);
    }
    for(const cell of gone) this.popOut(cell);
    this.cells = next;
  }

  private replaceAll(tokens: Token[], animated: boolean, up?: boolean) {
    this.finishDrum();
    const old = this.cells;
    if(!animated) {
      const next = tokens.map((t) => this.make(t.c, t.frac, t.key));
      for(const c of next) c.el.style.width = `${this.width(c.c, c.frac)}px`;
      this.container.replaceChildren(this.measurer, ...next.map((c) => c.el));
      this.cells = next;
      this.releaseCells(old);
      return;
    }
    // The drum: the integer part — digits from the right, the fraction — from
    // the left. Every digit rolls from the old glyph to the new one, all stop together.
    const split = (list: {c: string, frac: boolean}[]) =>
      [list.filter((t) => !t.frac).map((t) => t.c), list.filter((t) => t.frac).map((t) => t.c)];
    const [oldInteger, oldFraction] = split(old), [newInteger, newFraction] = split(tokens);
    const cells: DrumCell[] = [];
    // * the drum rolls in the line's own ink (black in the design), so it follows the theme
    const ink = getComputedStyle(this.container).color;
    const pair = (a: string[], b: string[], frac: boolean, right: boolean) => {
      const n = Math.max(a.length, b.length), out: [string, string][] = [];
      for(let i = 0; i < n; i++) {
        const x = right ? a[a.length - 1 - i] : a[i], y = right ? b[b.length - 1 - i] : b[i];
        out.push([x ?? null, y ?? null]);
      }
      if(right) out.reverse();
      for(const [x, y] of out) {
        const same = x === y;
        const cell = new DrumCell({
          from: x, to: same ? null : y, up, className: `amount-cell${frac ? ' fraction' : ''}`,
          widthFrom: x === null ? 0 : this.width(x, frac), widthTo: y === null ? 0 : this.width(y, frac),
          colorFrom: ink, colorTo: ink
        });
        if(same) {
          cell.leaving = false;
          cell.widthTo = cell.widthFrom;
        }
        cell.pitch = (frac ? 22.6 : CAP) * 0.8;
        cells.push(cell);
      }
    };
    pair(oldInteger, newInteger, false, true);
    pair(oldFraction, newFraction, true, false);
    this.container.replaceChildren(this.measurer, ...cells.map((c) => c.el));
    this.drum = {cells, start: clock.now(), tokens};
    if(!this.drumFilter) this.drumFilter = smearFilter();
    this.container.style.filter = `url(#${this.drumFilter.id})`;
    // The drum cells are the same «cells» for the send ripple.
    this.cells = cells.map((c) => ({el: c.el, c: '', frac: false}));
    this.releaseCells(old);
    this.tickDrum(this.drum.start);
  }

  private tickDrum(now: number) {
    const d = this.drum;
    if(!d) return;
    const t = now - d.start;
    let pace = 0;
    for(const cell of d.cells) pace = Math.max(pace, cell.frame(t, cell.pitch));
    // The vertical smear — by the travel speed, as long as the glyph's path.
    this.drumFilter.blur.setAttribute('stdDeviation', `0 ${(CAP * 0.45 * pace * pace / 2).toFixed(2)}`);
    if(t > SPIN + 0.02) this.finishDrum();
  }

  /** The drum has stopped (or typing interrupted it) — the line is plain cells again. */
  private finishDrum() {
    const d = this.drum;
    if(!d) return;
    this.drum = null;
    this.container.style.filter = '';
    this.cells = [];
    this.replaceAll(d.tokens, false);
  }

  /**
   * A glyph moves to a new place: the cell already stands where it belongs,
   * but is drawn where it was and catches up with an overshoot. A comma dives
   * under the line meanwhile — goes around the digit from below, where digits
   * have no ink — and grows a little: it reads as flying around, not as a shift.
   */
  private slide(cell: DigitCell, dx: number) {
    const comma = cell.c === ',';
    const hop = comma ? 34 * 0.22 : 0;
    const frames: Keyframe[] = [];
    for(let i = 0; i <= 16; i++) {
      const p = Math.min(1, Math.max(0, inertia(i / 16)));
      const arc = hop * Math.pow(Math.sin(Math.PI * p), 0.7);
      frames.push({
        translate: `${dx * (1 - inertia(i / 16))}px ${arc}px`,
        scale: comma ? `${1 + 0.1 * Math.sin(Math.PI * p)}` : '1'
      });
    }
    cell.el.animate(frames, {duration: TYPING * 1000 * (comma ? 1.6 : 1)});
  }

  private popIn(cell: DigitCell) {
    const w = this.width(cell.c, cell.frac);
    cell.el.style.width = `${w}px`;
    cell.el.animate([{width: '0px'}, {width: `${w}px`}], {duration: TYPING * 1000, easing: SETTLE});
    cell.glyph.animate([
      {transform: 'scale(0.86)', opacity: 0, filter: 'blur(3px)'},
      {transform: 'scale(1)', opacity: 1, filter: 'blur(0px)'}
    ], {duration: TYPING * 1000, easing: SETTLE});
  }

  private popOut(cell: DigitCell) {
    const w = layoutWidth(cell.el) || this.width(cell.c, cell.frac);
    cell.el.animate([{width: `${w}px`}, {width: '0px'}], {duration: MELT * 1300, easing: EASE, fill: 'forwards'});
    const fade = cell.glyph.animate([
      {transform: 'scale(1)', opacity: 1, filter: 'blur(0px)'},
      {transform: 'scale(0.86)', opacity: 0, filter: 'blur(3px)'}
    ], {duration: MELT * 1300, easing: EASE, fill: 'forwards'});
    fade.finished.then(() => {
      cell.el.remove();
      this.releaseCells([cell]);
    }).catch((): void => {});
  }

  /**
   * Glyph over glyph — as a drop. The cell has its own filter: blur, an
   * alpha threshold and a slight edge softening. The old glyph sinks onto
   * the line and spreads into a puddle, the new one rises from it and
   * overshoots a little in size. `tick` drives the frames.
   */
  private melt(cell: DigitCell, c: string) {
    const from = cell.c;
    cell.c = c;
    const w0 = this.width(from, cell.frac), w1 = this.width(c, cell.frac);
    cell.el.style.width = `${w1}px`;
    if(w0 !== w1) cell.el.animate([{width: `${w0}px`}, {width: `${w1}px`}], {duration: MELT * 1000, easing: SETTLE});
    cell.ghost?.remove();
    const ghost = document.createElement('span');
    ghost.className = 'ghost';
    ghost.textContent = from;
    cell.el.append(ghost);
    cell.ghost = ghost;
    cell.glyph.textContent = c;
    if(!cell.goo) {
      cell.goo = gooFilter();
      this.goos.add(cell.goo);
    }
    cell.el.style.filter = `url(#${cell.goo.id})`;
    this.melts = this.melts.filter((m) => m.cell !== cell);
    this.melts.push({cell, start: clock.now()});
  }

  /** A frame of the melts and the bounce (and of the drum). */
  public tick(now: number) {
    this.tickDrum(now);
    if(!this.melts.length) return;
    this.melts = this.melts.filter((m) => {
      const e = now - m.start;
      const k = Math.min(1, Math.max(0, e / MELT));
      const {cell} = m;
      if(k < 1) {
        // The drop lives in the middle of the travel: at the ends the glyph matches the plain one.
        const fuse = Math.pow(Math.sin(Math.PI * k), 0.6);
        // The blur radius on iOS is about three sigmas: the sigma here is three times smaller.
        cell.goo.blur.setAttribute('stdDeviation', (CAP * 0.075 * fuse).toFixed(2));
        // The old one sinks to the line and spreads sideways.
        const sink = ease(k);
        cell.ghost.style.opacity = String(Math.pow(1 - k, 0.7));
        cell.ghost.style.transform = `translateX(-50%) scale(${1 + 0.14 * sink}, ${1 - 0.42 * sink})`;
        // The new one rises from the puddle — with a spring in height.
        const rise = settle(k);
        cell.glyph.style.opacity = String(Math.pow(k, 0.6));
        cell.glyph.style.transform = `scale(${1.12 - 0.12 * rise}, ${0.55 + 0.45 * rise})`;
        return true;
      }
      if(cell.ghost) {
        cell.ghost.remove();
        cell.ghost = null;
        cell.el.style.filter = '';
        cell.glyph.style.opacity = '';
      }
      // Having melted, the glyph still bounces a little in size.
      const after = e - MELT;
      const b = 1 + 0.12 * Math.exp(-after / 0.1) * Math.sin(2 * Math.PI * after / 0.28);
      cell.glyph.style.transform = `scale(${b})`;
      if(after > 0.5) {
        cell.glyph.style.transform = '';
        return false;
      }
      return true;
    });
  }

  /**
   * Cells that left the line give their drop filters back. The filter object
   * stays on the cell: a melt still in flight keeps writing to it harmlessly.
   */
  private releaseCells(cells: DigitCell[]) {
    for(const cell of cells) {
      if(!cell.goo || !this.goos.has(cell.goo)) continue;
      this.goos.delete(cell.goo);
      removeFilter(cell.goo.filter);
    }
  }

  /** Stops the drum and the melts and removes the measurer and the SVG filters. */
  public destroy() {
    this.drum = null;
    this.melts = [];
    this.container.style.filter = '';
    for(const cell of this.cells) cell.el.style.filter = '';
    this.measurer.remove();
    if(this.drumFilter) removeFilter(this.drumFilter.filter);
    this.drumFilter = null;
    for(const goo of this.goos) removeFilter(goo.filter);
    this.goos.clear();
  }
}

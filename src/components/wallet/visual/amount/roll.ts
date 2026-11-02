// The recount drum — a port of .drum from Rolling.swift. Every digit rolls
// from the old glyph to the new one by one click, in the direction the number
// grows; all digits stop together. A glyph is brightest in its place and fades
// towards the window's edge, so a digit that rolled away disappears
// completely. While the drum turns, the glyphs are smeared vertically — by the
// travel speed rather than by a constant blur: the stop does not read as a
// jerk. The letters of the currency code roll on the same drum with a small
// stagger, and the colour changes in the same phase.

import {ease} from '@components/wallet/visual/motion';
import {BlurFilter, layoutWidth, removeFilter, smearFilter} from '@components/wallet/visual/dom';
import '@components/wallet/visual/amount/cells.scss';

export const SPIN = 0.46;
const STAGGER = 0.05;

const rgb = (c: string) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
function blend(a: string, b: string, k: number): string {
  if(a === b || k >= 1) return b;
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}

/** The drum's window: a glyph is brightest in place and fades towards the edge. */
function drumWindow(dy: number, pitch: number): number {
  const k = Math.abs(dy) / (pitch * 0.58);
  return k >= 1 ? 0 : 1 - Math.pow(k, 2.2);
}

export interface DrumCellOptions {
  /** null — the cell appears. */
  from: string,
  /** null — the cell leaves (or stays, when it does not change). */
  to: string,
  widthFrom: number,
  widthTo: number,
  up: boolean,
  delay?: number,
  span?: number,
  colorFrom: string,
  colorTo: string,
  className?: string
}

/** One drum cell: a column of glyphs from the old one to the new one. */
export class DrumCell {
  public column: string[];
  public appearing: boolean;
  public leaving: boolean;
  public widthFrom: number;
  public widthTo: number;
  public dir: number;
  public delay: number;
  public span: number;
  public colorFrom: string;
  public colorTo: string;
  public el: HTMLSpanElement;
  public glyphs: HTMLSpanElement[];
  /** The step of the roll, set by the owner when cells differ in size. */
  public pitch: number;

  constructor({from, to, widthFrom, widthTo, up, delay = 0, span = SPIN, colorFrom, colorTo, className = ''}: DrumCellOptions) {
    this.column = [from, to].filter((c) => c !== null && c !== undefined);
    this.appearing = from == null;
    this.leaving = to == null;
    this.widthFrom = widthFrom;
    this.widthTo = widthTo;
    this.dir = up ? 1 : -1;
    this.delay = delay;
    this.span = span;
    this.colorFrom = colorFrom;
    this.colorTo = colorTo;
    this.el = document.createElement('span');
    this.el.className = `roll-cell ${className}`;
    // An invisible glyph in the flow keeps the baseline and the line height.
    const strut = document.createElement('span');
    strut.className = 'roll-strut';
    strut.textContent = to ?? from ?? ' ';
    this.el.append(strut);
    this.glyphs = this.column.map((c) => {
      const g = document.createElement('span');
      g.className = 'roll-glyph';
      g.textContent = c;
      this.el.append(g);
      return g;
    });
    this.el.style.width = `${widthFrom}px`;
  }

  /**
   * A frame; `t` — seconds since the line started rolling. Returns the travel
   * pace 0…1 — the line smears the glyphs by it.
   */
  public frame(t: number, pitch: number): number {
    const raw = Math.min(1, Math.max(0, (t - this.delay) / this.span));
    const p = ease(raw);
    const pace = Math.pow(1 - raw, 1.2);
    const steps = this.column.length - 1;
    const open = this.appearing ? p : (this.leaving ? 1 - p : 1);
    this.el.style.width = `${this.widthFrom + (this.widthTo - this.widthFrom) * p}px`;
    const color = blend(this.colorFrom, this.colorTo, p);
    this.glyphs.forEach((g, i) => {
      // An appearing or leaving digit does not roll — it comes out of the
      // haze or goes into it together with its width.
      const dy = steps > 0 ? (i - p * steps) * pitch * this.dir : 0;
      const alpha = (steps > 0 ? drumWindow(dy, pitch) : 1) * Math.pow(open, 2.2);
      g.style.transform = `translate(-50%, ${dy}px)`;
      g.style.opacity = String(alpha);
      g.style.color = color;
    });
    return steps > 0 && raw > 0 && raw < 1 ? pace : 0;
  }
}

/** A segment of a rolling line. */
export interface RollSegment {
  text: string,
  /** 'right' — digits are counted from the right. */
  align?: 'right',
  /** Letter-by-letter stagger. */
  letters?: boolean,
  className?: string
}

export interface RollSpinOptions {
  up: boolean,
  colorFrom: string,
  colorTo: string,
  /** clock.now() of the start. */
  start: number
}

/**
 * A line that can roll like a drum. Cells go by segment: numbers are aligned
 * by the right edge of the integer part, fractions and words — by the left.
 *
 * Usage: `new RollText(el, {pitch})` (the step — 0.8 of the cap height, e.g.
 * `32 * 0.71 * 0.8`); `set(text, color?)` without animation;
 * `spin(fromSegments, toSegments, {up, colorFrom, colorTo, start: clock.now()})`;
 * `frame(clock.now())` every frame while `spinning`; `destroy()`.
 */
export class RollText {
  public el: HTMLElement;
  public pitch: number;
  public text: string;
  public color: string;
  private filter: BlurFilter;
  private cells: DrumCell[];
  private start: number;
  private measurer: HTMLSpanElement;
  private widths: Map<string, number>;

  constructor(el: HTMLElement, {pitch}: {pitch: number}) {
    this.el = el;
    this.pitch = pitch;
    this.filter = smearFilter();
    this.cells = null;
    this.measurer = document.createElement('span');
    this.measurer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
    this.widths = new Map();
  }

  public width(c: string, className = ''): number {
    const key = `${className}|${c}`;
    if(!this.widths.has(key)) {
      this.measurer.className = className;
      this.measurer.textContent = c;
      this.el.append(this.measurer);
      // * the amount line may be scaled to fit: the cell's width is the unscaled one
      const w = layoutWidth(this.measurer);
      this.measurer.remove();
      if(w > 0) this.widths.set(key, w);
      return w;
    }
    return this.widths.get(key);
  }

  /** Plain text, no animation. */
  public set(text: string, color?: string) {
    this.finish();
    this.el.textContent = text;
    if(color !== undefined) this.el.style.color = color;
    this.color = color ?? this.color;
    this.text = text;
  }

  /**
   * Roll from the old segments to the new ones. A segment is {text, align,
   * letters, className}: `align` 'right' — digits are counted from the right,
   * `letters` — a letter-by-letter stagger.
   */
  public spin(fromSegments: RollSegment[], toSegments: RollSegment[], {up, colorFrom, colorTo, start}: RollSpinOptions) {
    this.finish();
    const cells: DrumCell[] = [];
    toSegments.forEach((to, s) => {
      const from = fromSegments[s] || {text: ''};
      const a = [...from.text], b = [...to.text];
      const n = Math.max(a.length, b.length);
      const pairs: [string, string][] = [];
      for(let i = 0; i < n; i++) {
        const ia = to.align === 'right' ? a.length - 1 - i : i;
        const ib = to.align === 'right' ? b.length - 1 - i : i;
        pairs.push([a[ia] ?? null, b[ib] ?? null]);
      }
      if(to.align === 'right') pairs.reverse();
      pairs.forEach(([x, y], i) => {
        const cls = to.className || '';
        const same = x === y;
        cells.push(new DrumCell({
          from: same ? y : x, to: same ? null : y, up,
          widthFrom: x === null ? 0 : this.width(x, cls),
          widthTo: y === null ? 0 : this.width(y, cls),
          delay: to.letters ? i * STAGGER : 0,
          span: to.letters ? SPIN - i * STAGGER * 0.5 : SPIN,
          colorFrom, colorTo, className: cls
        }));
        // A glyph that does not change stands still: a column of one glyph.
        if(same) {
          const c = cells[cells.length - 1];
          c.leaving = false;
          c.widthTo = c.widthFrom;
        }
      });
    });
    this.cells = cells;
    this.start = start;
    this.el.textContent = '';
    this.el.append(...cells.map((c) => c.el));
    this.el.style.filter = `url(#${this.filter.id})`;
    this.text = toSegments.map((s) => s.text).join('');
    this.color = colorTo;
    this.frame(start);
  }

  public get spinning(): boolean {
    return this.cells !== null;
  }

  public frame(now: number) {
    if(!this.cells) return;
    const t = now - this.start;
    let pace = 0;
    for(const cell of this.cells) pace = Math.max(pace, cell.frame(t, this.pitch));
    // The smear — as long as the glyph's path, while it is fast.
    this.filter.blur.setAttribute('stdDeviation', `0 ${(this.pitch * 0.55 * pace * pace / 2).toFixed(2)}`);
    if(t > SPIN + STAGGER * 4) this.finish();
  }

  public finish() {
    if(!this.cells) return;
    this.cells = null;
    this.el.style.filter = '';
    this.el.textContent = this.text;
    this.el.style.color = this.color || '';
  }

  /** Settles the line on its final text and removes its SVG filter. */
  public destroy() {
    this.finish();
    if(this.filter) removeFilter(this.filter.filter);
    this.filter = null;
  }
}

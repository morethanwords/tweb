// The recipient chip comes alive on every opening of the amount screen — a
// port of RecipientCard from the iOS demo. The chip itself flies in and
// springs, and everything inside assembles from characters, as in «The Matrix»:
// - the photo falls as characters of the address's size, and every character
//   decodes into the photo's pixels under it;
// - the name and the username fall into place letter by letter;
// - the address falls in streams through both lines, then every other group
//   lights up black.
// Everything is computed from the opening time: there is no state, any frame
// is drawn from scratch. When it has all played out, the canvas clears and the
// plain layout remains.
//
// Expected DOM (the design's classes; the module only needs the elements):
//
//   <div class="chip">                                 chip — gets `.assembling` while playing; the
//     <span class="chip-avatar"><img></span>           screen's CSS hides the avatar, the label and
//     <div class="chip-body">                          the address under it
//       <div class="chip-label"><span class="chip-name"></span><span class="chip-nick"></span></div>
//       <div class="chip-address"></div>               two lines of six groups («Martian Mono» 300)
//     </div>
//     <canvas class="chip-matrix"></canvas>            absolute at the chip's top-left, no pointer events
//   </div>
//
// Usage: `matrix.play(person, avatarImage)` right after the chip is laid out
// for a new recipient, then `matrix.frame(clock.now())` every frame until it
// returns false.

import {clock} from '@components/wallet/visual/clock';
import {offsetIn, pixelRatio} from '@components/wallet/visual/dom';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import isRTL from '@helpers/string/isRTL';
import {Vec2} from '@components/wallet/visual/math';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const FLIP = 0.045;
const GRAY = '#6d6d72';
const INK = '#000000';
export const MATRIX_SPAN = 2.1;

function noise(a: number, salt: number): number {
  let x = (Math.imul(a, 73856093) ^ Math.imul(salt, 19349663)) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  x ^= x >>> 15;
  return (x % 10000) / 10000;
}

function glyph(a: number, salt: number, t: number): string {
  const tick = Math.floor(Math.min(Math.max(t, 0), 3600) / FLIP);
  const hash = (Math.imul(a, 2654435761 | 0) ^ Math.imul(tick, 40503) ^ Math.imul(salt, 97)) & 0x7fffffff;
  return ALPHABET[hash % ALPHABET.length];
}

/** The wave across the chip: when the stream at `x` from its starting edge starts (see `MatrixChip.wave`). */
const start = (x: number, salt: number, delay = 0) => 0.1 + delay + 0.5 * (x / 300) + 0.14 * noise(Math.floor(x * 10), salt);

/** The fall path 0 → 1 with a slight overshoot; second — the speed. */
function path(u: number): Vec2 {
  const c1 = 0.9, c3 = c1 + 1, x = u - 1;
  return [1 + c3 * x * x * x + c1 * x * x, 3 * c3 * x * x + 2 * c1 * x];
}

function passTime(target: number): number {
  let lo = 0, hi = 1;
  for(let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if(path(mid)[0] < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

const smooth = (k: number) => {
  const t = Math.min(Math.max(k, 0), 1);
  return t * t * (3 - 2 * t);
};

/** `#rrggbb` or `rgb[a](…)` as [r, g, b, a]. */
function parseColor(c: string): [number, number, number, number] {
  if(c.startsWith('#')) {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
  }

  const [r = 0, g = 0, b = 0, a = 1] = (c.match(/[\d.]+/g) || []).map(Number);
  return [r, g, b, a];
}

function mix(a: string, b: string, k: number): string {
  const pa = parseColor(a), pb = parseColor(b);
  const c = [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * k));
  return `rgb(${c.join(',')})`;
}

function withAlpha(c: string, alpha: number): string {
  const [r, g, b] = parseColor(c);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface MatrixChipElements {
  chip: HTMLElement,
  canvas: HTMLCanvasElement,
  name: HTMLElement,
  nick: HTMLElement,
  address: HTMLElement,
  /** `.chip-avatar`: its first element child is the avatar itself, read on every `play`. */
  avatarSlot: HTMLElement
}

export interface MatrixPerson {
  /** Twelve groups separated by spaces: six per line. */
  address: string
}

interface Piece {
  c: string,
  x: number,
  slot: number,
  font: string,
  color: string,
  baseline: number
}

interface ColorSamples {
  data: Uint8ClampedArray,
  width: number
}

export class MatrixChip {
  public chip: HTMLElement;
  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private elements: MatrixChipElements;
  /** clock.now() of the opening; null when idle. */
  private opened: number;
  private person: MatrixPerson;
  private image: CanvasImageSource;
  private samples: Map<number, ColorSamples>;
  private pr: number;
  private w: number;
  private h: number;
  private addressSize: number;
  private addressFont: string;
  private pieces: Piece[];
  private titleHeight: number;
  private advance: number;
  private addressAscent: number;
  private addressOrigin: Vec2;
  private lines: string[];
  private avatar: {x: number, y: number, size: number};
  /** The layout's colours: the address's gray, the black of its lit groups and of a falling head. */
  private muted: string;
  private strong: string;
  private head: string;
  private addressLine: number;
  private columns: number;
  private rows: number;
  private cell: Vec2;
  private decoded: number;
  /** the chip is laid out right to left: the wave starts at its right edge, by the photo */
  private rtl: boolean;

  constructor(elements: MatrixChipElements) {
    this.elements = elements;
    this.chip = elements.chip;
    this.canvas = elements.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.opened = null;
  }

  /** A new opening: take the layout from the DOM and start from zero. */
  public play(person: MatrixPerson, image: CanvasImageSource) {
    this.person = person;
    this.image = image;
    this.samples = new Map();
    this.opened = clock.now();
    this.chip.classList.add('assembling');
    this.measure();
  }

  private measure() {
    const chip = this.chip;
    const pr = pixelRatio();
    const w = chip.offsetWidth, h = chip.offsetHeight;
    this.pr = pr;
    this.w = w;
    this.h = h;
    this.rtl = isDocumentRTL(chip.ownerDocument);
    this.canvas.width = Math.round(w * pr);
    this.canvas.height = Math.round(h * pr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const g = this.ctx;
    const at = (el: HTMLElement): Vec2 => {
      const {x, y} = offsetIn(el, chip);
      return [x, y];
    };

    const {name: nameEl, nick: nickEl, address: addressEl} = this.elements;
    const avatarEl = this.elements.avatarSlot.firstElementChild as HTMLElement;
    // * fonts, spacing and colours come from the layout (the design's values are the fallbacks), so the
    // * characters land on the glyphs the chip shows in any theme
    const nameStyle = getComputedStyle(nameEl), nickStyle = getComputedStyle(nickEl);
    const addressStyle = getComputedStyle(addressEl);
    const font = (style: CSSStyleDeclaration, fallback: string) => style.fontFamily ?
      `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` :
      fallback;
    const length = (value: string, fallback: number) => {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? fallback : parsed;
    };
    const spacing = (value: string, fallback: number) => value === 'normal' ? 0 : length(value, fallback);
    const nameFont = font(nameStyle, '500 16px Roboto, sans-serif'), nickFont = font(nickStyle, '400 14px Roboto, sans-serif');
    this.addressSize = parseFloat(addressStyle.fontSize) || 12;
    this.addressFont = `${addressStyle.fontWeight || 300} ${this.addressSize}px ${addressStyle.fontFamily || '"Martian Mono", ui-monospace, monospace'}`;
    this.addressLine = length(addressStyle.lineHeight, 18);
    const bold = addressEl.querySelector('b');
    this.muted = addressStyle.color || GRAY;
    this.strong = (bold && getComputedStyle(bold).color) || nameStyle.color || INK;
    this.head = withAlpha(this.strong, 0.95);

    // The name and the username — letter by letter, on the layout's baseline.
    const baseline = (el: HTMLElement, font: string, lineHeight: number) => {
      g.font = font;
      const m = g.measureText('Hg');
      const [, y] = at(el);
      return y + (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    };
    this.pieces = [];
    const add = (el: HTMLElement, font: string, spacing: number, color: string, lineHeight: number, rtl?: boolean) => {
      const [x0] = at(el);
      const b = baseline(el, font, lineHeight);
      g.font = font;
      const text = el.textContent;
      // * a name written right to left runs from its box's right edge (its box keeps the layout's direction, its
      // * text orders itself by its first letter: `dir="auto"`)
      const right = x0 + el.offsetWidth;
      for(let i = 0; i < text.length; i++) {
        if(text[i] === ' ') continue;
        const x = rtl ?
          right - g.measureText(text.slice(0, i + 1)).width - spacing * i :
          x0 + g.measureText(text.slice(0, i)).width + spacing * i;
        this.pieces.push({c: text[i], x, slot: g.measureText(text[i]).width, font, color, baseline: b});
      }
    };
    add(nameEl, nameFont, spacing(nameStyle.letterSpacing, -0.31), nameStyle.color || INK, length(nameStyle.lineHeight, 22), isRTL(nameEl.textContent));
    add(nickEl, nickFont, spacing(nickStyle.letterSpacing, -0.15), nickStyle.color || GRAY, length(nickStyle.lineHeight, 19));
    this.titleHeight = length(nameStyle.lineHeight, 22);

    // The address — monospaced, in columns.
    g.font = this.addressFont;
    this.advance = g.measureText('0').width;
    const m = g.measureText('Hg');
    this.addressAscent = m.fontBoundingBoxAscent;
    const [ax, ay] = at(addressEl);
    this.addressOrigin = [ax, ay + (this.addressLine - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2];
    this.lines = [this.person.address.split(' ').slice(0, 6).join(' '), this.person.address.split(' ').slice(6).join(' ')];

    // The photo — on a grid of address characters.
    const [px, py] = at(avatarEl);
    this.avatar = {x: px, y: py, size: avatarEl.offsetWidth};
    const size = this.avatar.size;
    this.columns = Math.max(3, Math.floor(size / this.advance));
    this.rows = Math.max(2, Math.floor(size / 10.5));
    this.cell = [size / this.columns, size / this.rows];
    this.decoded = 0;
    for(let c = 0; c < this.columns; c++) for(let r = 0; r < this.rows; r++)
      this.decoded = Math.max(this.decoded, this.decodeStart(r, c) + 0.24);
  }

  /** A frame. Returns false once everything has played out. */
  public frame(nowSeconds: number): boolean {
    if(this.opened === null) return false;
    const t = nowSeconds - this.opened;
    if(t >= MATRIX_SPAN) {
      this.opened = null;
      this.chip.classList.remove('assembling');
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return false;
    }
    const g = this.ctx;
    g.setTransform(this.pr, 0, 0, this.pr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    this.drawAvatar(t);
    this.drawTitle(t);
    this.drawAddress(t);
    return true;
  }

  /** `x` from the edge the wave starts at: the chip's left one, its right one right to left (the photo's side) */
  private wave(x: number) {
    return this.rtl ? this.w - x : x;
  }

  // MARK: Characters

  private fill(c: string, font: string, x: number, slot: number, baseline: number, color: string, alpha = 1) {
    const g = this.ctx;
    g.font = font;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillText(c, x + (slot - g.measureText(c).width) / 2, baseline);
    g.globalAlpha = 1;
  }

  /** A character falling down: a sharp head, a trail stretching up behind it. */
  private smear(c: string, font: string, size: number, x: number, slot: number, baseline: number, velocity: number,
    head: string, tail: string, alpha: number) {
    if(alpha <= 0.01) return;
    const length = Math.min(Math.max(velocity, 0) * 0.04, size * 1.2);
    const samples = length > 1 ? Math.min(2 + Math.floor(length / 1.2), 14) : 1;
    const weights: number[] = [];
    for(let i = 0; i < samples; i++) weights.push(Math.pow(1 - (samples > 1 ? i / (samples - 1) : 0), 1.6));
    const total = Math.max(weights.slice(1).reduce((a, b) => a + b, 0), 0.001);
    for(let i = samples - 1; i >= 0; i--) {
      const k = samples > 1 ? i / (samples - 1) : 0;
      this.fill(c, font, x, slot, baseline - length * k, i === 0 ? head : tail,
        alpha * (i === 0 ? 0.8 : weights[i] / total * 1.4));
    }
  }

  // MARK: Photo

  private avatarBaseline(row: number): number {
    return this.avatar.y + this.cell[1] * row + (this.cell[1] + 8.4) / 2;
  }

  private timing(column: number): Vec2 {
    return [start(this.wave(this.avatar.x + this.cell[0] * column), 31), 0.3 + 0.08 * noise(column, 32)];
  }

  private span(): Vec2 {
    return [this.avatarBaseline(0) - this.cell[1] * 1.6, this.avatarBaseline(this.rows - 1)];
  }

  private passed(row: number, column: number): number {
    const [s, fall] = this.timing(column), [top, bottom] = this.span();
    return s + passTime((this.avatarBaseline(row) - top) / (bottom - top)) * fall;
  }

  private settled(row: number, column: number): number {
    const [s, fall] = this.timing(column);
    return row === this.rows - 1 ? s + fall : this.passed(row, column) + 0.14;
  }

  private decodeStart(row: number, column: number): number {
    return this.settled(row, column) + 0.1 + 0.04 * noise(row * 7 + column, 71);
  }

  /** The photo's colours on the grid — once per grid. */
  private colors(split: number): ColorSamples {
    if(this.samples.has(split)) return this.samples.get(split);
    const img = this.image;
    if(!img || (img instanceof HTMLImageElement && !img.complete)) return null;
    const c = document.createElement('canvas');
    c.width = this.columns * split;
    c.height = this.rows * split;
    const g = c.getContext('2d', {willReadFrequently: true});
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    this.samples.set(split, {data, width: c.width});
    return this.samples.get(split);
  }

  private drawAvatar(t: number) {
    const g = this.ctx, a = this.avatar, [cw, ch] = this.cell;
    const font = this.addressFont;
    if(t >= this.decoded) {
      g.save();
      g.beginPath();
      g.arc(a.x + a.size / 2, a.y + a.size / 2, a.size / 2, 0, Math.PI * 2);
      g.clip();
      if(this.image) g.drawImage(this.image, a.x, a.y, a.size, a.size);
      g.restore();
      return;
    }
    // The characters — without the mask: whole, and outside the circle too.
    for(let column = 0; column < this.columns; column++) {
      for(let row = 0; row < this.rows; row++) {
        const last = row === this.rows - 1;
        if(t < (last ? this.settled(row, column) : this.passed(row, column))) continue;
        const k = (t - this.decodeStart(row, column)) / 0.24;
        if(k >= 1 / 3) continue;
        const still = t >= this.settled(row, column);
        const id = row * this.columns + column;
        const c = still ? glyph(id, 77, 0) : glyph(id, 78, t);
        this.fill(c, font, a.x + cw * column, cw, this.avatarBaseline(row), this.muted,
          (k > 0 ? 1 - k * 3 : 1) * (still ? 1 : 0.55));
      }
      // The stream's head.
      const [s, fall] = this.timing(column);
      const u = (t - s) / fall;
      if(u > 0 && u < 1) {
        const [top, bottom] = this.span();
        const [p, speed] = path(u);
        const y = top + (bottom - top) * p;
        const id = (this.rows - 1) * this.columns + column;
        const c = u > 0.72 ? glyph(id, 77, 0) : glyph(column, 79, t);
        const enter = Math.min(Math.max((y - top) / ch, 0), 1);
        this.smear(c, font, this.addressSize, a.x + cw * column, cw, y, speed * (bottom - top) / fall, this.head, this.muted, enter * enter);
      }
    }
    // Decoding into pixels: coarse 2×2, fine 4×4, then the photo itself.
    g.save();
    g.beginPath();
    g.arc(a.x + a.size / 2, a.y + a.size / 2, a.size / 2, 0, Math.PI * 2);
    g.clip();
    for(let column = 0; column < this.columns; column++) for(let row = 0; row < this.rows; row++) {
      const k = (t - this.decodeStart(row, column)) / 0.24;
      if(k <= 0) continue;
      const x = a.x + cw * column, y = a.y + ch * row;
      g.save();
      g.beginPath();
      g.rect(x - 0.5, y - 0.5, cw + 1, ch + 1);
      g.clip();
      if(k >= 2 / 3 && this.image) {
        g.drawImage(this.image, a.x, a.y, a.size, a.size);
      } else {
        const fine = k >= 1 / 3, split = fine ? 4 : 2;
        const s = this.colors(split);
        if(s) {
          const w = cw / split, h = ch / split;
          for(let i = 0; i < split; i++) for(let j = 0; j < split; j++) {
            const o = ((row * split + j) * s.width + column * split + i) * 4;
            g.fillStyle = `rgb(${s.data[o]},${s.data[o + 1]},${s.data[o + 2]})`;
            g.fillRect(x + w * i, y + h * j, w + 0.3, h + 0.3);
          }
        }
        if(!fine) this.fill(glyph(row * this.columns + column, 77, 0), font, x, cw, this.avatarBaseline(row), '#fff', 1 - k * 3);
      }
      g.restore();
    }
    g.restore();
  }

  // MARK: Name

  private drawTitle(t: number) {
    this.pieces.forEach((p, index) => {
      const s = start(this.wave(p.x), 51 + index);
      const fall = 0.3 + 0.08 * noise(index, 52);
      const local = t - s;
      if(local <= 0) return;
      const u = Math.min(local / fall, 1);
      if(u >= 1) {
        this.fill(p.c, p.font, p.x, p.slot, p.baseline, p.color);
        return;
      }
      const [q, speed] = path(u);
      const drop = this.titleHeight * 1.1;
      const y = p.baseline - drop * (1 - q);
      const c = u > 0.72 ? p.c : glyph(index, 53, t);
      this.smear(c, p.font, 16, p.x, p.slot, y, speed * drop / fall, p.color, this.muted, Math.min(u / 0.4, 1));
    });
  }

  // MARK: Address

  private character(line: number, column: number): string {
    const text = this.lines[line];
    if(!text || column >= text.length) return null;
    return text[column] === ' ' ? null : text[column];
  }

  private addressTiming(column: number): Vec2 {
    return [start(this.wave(this.addressOrigin[0] + this.advance * column), 1, 0.08), 0.36 + 0.1 * noise(column, 2)];
  }

  private groupColor(row: number, column: number): string {
    const group = this.lines[row].slice(0, column).split(' ').length - 1;
    return (group + row) % 2 === 1 ? this.strong : this.muted;
  }

  private highlight(row: number, column: number, t: number): number {
    const text = this.lines[row];
    let from = column, to = column;
    while(from > 0 && text[from - 1] !== ' ') from--;
    while(to < text.length - 1 && text[to + 1] !== ' ') to++;
    let last = row;
    for(let l = this.lines.length - 1; l >= 0; l--) if(this.character(l, column) !== null) {
      last = l;
      break;
    }
    let ready = 0;
    for(let c = from; c <= to; c++) {
      const [s, fall] = this.addressTiming(c);
      ready = Math.max(ready, s + fall + (row === last ? 0 : 0.14));
    }
    return smooth((t - ready - 0.06) / 0.24);
  }

  private drawAddress(t: number) {
    const font = this.addressFont, adv = this.advance, line = this.addressLine;
    const columns = Math.max(...this.lines.map((l) => l.length));
    const baseline = (row: number) => this.addressOrigin[1] + this.addressAscent + line * row;
    for(let column = 0; column < columns; column++) {
      const rows = this.lines.map((_, i) => i).filter((i) => this.character(i, column) !== null);
      if(!rows.length) continue;
      const last = rows[rows.length - 1];
      const x = this.addressOrigin[0] + adv * column;
      const [s, fall] = this.addressTiming(column);
      const local = t - s;
      if(local <= 0) continue;
      const u = Math.min(local / fall, 1);
      const top = baseline(0) - line, bottom = baseline(last);
      const [p, speed] = path(u);
      const head = top + (bottom - top) * p;
      const put = (row: number, settled: boolean) => {
        const final = this.character(row, column);
        const c = settled ? final : glyph(column, 11 + row, t);
        const color = settled ? mix(this.muted, this.groupColor(row, column), this.highlight(row, column, t)) : this.muted;
        this.fill(c, font, x, adv, baseline(row), color, settled ? 1 : 0.55);
      };
      for(const row of rows) {
        if(row === last || head < baseline(row)) continue;
        const passed = passTime((baseline(row) - top) / (bottom - top));
        put(row, local - passed * fall > 0.14);
      }
      if(u < 1) {
        const c = u > 0.72 ? this.character(last, column) : glyph(column, 7, t);
        const enter = Math.min(Math.max((head - top) / line, 0), 1);
        this.smear(c, font, this.addressSize, x, adv, head, speed * (bottom - top) / fall, this.head, this.muted, enter * enter);
      } else {
        put(last, true);
      }
    }
  }

  /** Stops the play, clears the canvas and drops the sampled photo. */
  public destroy() {
    if(this.opened !== null) this.chip.classList.remove('assembling');
    this.opened = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.samples = null;
    this.image = null;
  }
}

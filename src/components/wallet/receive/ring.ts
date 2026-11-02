/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// The address running around the Add Funds card, as on iOS (WalletReceiveAddressRingComponent): two copies of
// "· ABCD EFGH … " fill a rounded loop 14 px outside the card, every glyph centred on the loop and turned to it
// with its top outward, and the whole text runs clockwise at 18 px a second. Decorative: the card says the
// address itself.

const SPEED = 18;
const COLOR = 'rgba(0, 82, 179, .48)';
const FONT_FAMILY = '"Roboto Mono", monospace';

type Sample = {x: number, y: number, angle: number};

/** The loop: a rounded rectangle walked clockwise from the middle of its top edge */
class Perimeter {
  public length: number;
  private horizontal: number;
  private vertical: number;
  private corner: number;

  constructor(private x: number, private y: number, private w: number, private h: number, private radius: number) {
    this.radius = Math.min(Math.max(0, radius), Math.min(w, h) / 2);
    this.horizontal = Math.max(0, w - this.radius * 2);
    this.vertical = Math.max(0, h - this.radius * 2);
    this.corner = Math.PI * this.radius / 2;
    this.length = this.horizontal * 2 + this.vertical * 2 + this.corner * 4;
  }

  private arc(cx: number, cy: number, angle: number): Sample {
    return {x: cx + this.radius * Math.cos(angle), y: cy + this.radius * Math.sin(angle), angle: angle + Math.PI / 2};
  }

  public sample(distance: number): Sample {
    const {x, y, w, h, radius, horizontal, vertical, corner} = this;
    let d = distance % this.length;
    if(d < 0) d += this.length;
    d += horizontal / 2;
    if(d >= this.length) d -= this.length;

    if(d < horizontal) return {x: x + radius + d, y, angle: 0};
    d -= horizontal;
    if(d < corner) return this.arc(x + w - radius, y + radius, -Math.PI / 2 + d / radius);
    d -= corner;
    if(d < vertical) return {x: x + w, y: y + radius + d, angle: Math.PI / 2};
    d -= vertical;
    if(d < corner) return this.arc(x + w - radius, y + h - radius, d / radius);
    d -= corner;
    if(d < horizontal) return {x: x + w - radius - d, y: y + h, angle: Math.PI};
    d -= horizontal;
    if(d < corner) return this.arc(x + radius, y + h - radius, Math.PI / 2 + d / radius);
    d -= corner;
    if(d < vertical) return {x, y: y + h - radius - d, angle: -Math.PI / 2};
    d -= vertical;
    if(d < corner) return this.arc(x + radius, y + radius, Math.PI + d / radius);
    return {x: x + radius, y, angle: 0};
  }
}

export type WalletAddressRingLayout = {
  /** the ring's box, CSS px */
  width: number,
  height: number,
  /** the card it runs around, centred in the box */
  cardWidth: number,
  cardHeight: number,
  cardRadius: number,
  /** how far outside the card the loop goes */
  offset: number
};

export class WalletAddressRing {
  private glyphs: {char: string, center: number}[] = [];
  private perimeter: Perimeter;
  private scale = 1;
  private tracking = 0;
  private baseline = 0;
  private font: string;
  private offset = 0;
  private last: number = null;
  private pixelRatio = 1;

  constructor(private canvas: HTMLCanvasElement) {}

  /** The text and the loop; draws the ring where it stands */
  public setup(address: string, layout: WalletAddressRingLayout, pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    const {width, height} = layout;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.glyphs = [];
    this.perimeter = undefined;
    if(!address) {
      this.draw();
      return;
    }

    const fontSize = Math.max(8, Math.min(11, width / 31)) * 1.2;
    this.font = `500 ${fontSize}px ${FONT_FAMILY}`;
    const ctx = this.canvas.getContext('2d');
    ctx.font = this.font;
    const metrics = ctx.measureText('A');
    const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.93;
    const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.24;
    // * the glyph's middle on the loop, as iOS centres it between ascent and descent
    this.baseline = (ascent - descent) / 2;

    // * the loop keeps half a line inside the box, so no glyph is cut
    const inset = Math.ceil((ascent + descent) / 2);
    const cardX = (width - layout.cardWidth) / 2, cardY = (height - layout.cardHeight) / 2;
    const left = Math.max(cardX - layout.offset, Math.min(inset, (width - 1) / 2));
    const top = Math.max(cardY - layout.offset, Math.min(inset, (height - 1) / 2));
    const right = Math.min(cardX + layout.cardWidth + layout.offset, width - Math.min(inset, (width - 1) / 2));
    const bottom = Math.min(cardY + layout.cardHeight + layout.offset, height - Math.min(inset, (height - 1) / 2));
    if(right <= left || bottom <= top) {
      this.draw();
      return;
    }

    const radius = Math.min(layout.cardRadius, Math.min(layout.cardWidth, layout.cardHeight) / 2) + layout.offset;
    this.perimeter = new Perimeter(left, top, right - left, bottom - top, radius);

    const text = '· ' + (address.match(/.{1,4}/g) || []).join(' ').toUpperCase() + ' ';
    let x = 0;
    for(const char of text) {
      const advance = ctx.measureText(char).width;
      this.glyphs.push({char, center: x + advance / 2});
      x += advance;
    }

    // * two copies, each half the loop: a longer text shrinks to fit, a shorter one spreads its glyphs evenly
    const half = this.perimeter.length / 2;
    this.scale = x > half ? half / x * 0.99 : 1;
    this.tracking = Math.max(0, (half - x * this.scale) / this.glyphs.length);
    this.offset %= half;
    this.draw();
  }

  public draw() {
    const ctx = this.canvas.getContext('2d');
    const pr = this.pixelRatio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const perimeter = this.perimeter;
    if(!perimeter || !this.glyphs.length) {
      return;
    }

    ctx.font = this.font;
    ctx.fillStyle = COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const half = perimeter.length / 2;
    const first = this.glyphs[0].center * this.scale;
    for(let copy = 0; copy < 2; ++copy) {
      this.glyphs.forEach((glyph, index) => {
        if(glyph.char === ' ') return;
        const distance = this.offset + copy * half + glyph.center * this.scale - first + index * this.tracking;
        const sample = perimeter.sample(distance);
        const cos = Math.cos(sample.angle) * this.scale * pr, sin = Math.sin(sample.angle) * this.scale * pr;
        ctx.setTransform(cos, sin, -sin, cos, sample.x * pr, sample.y * pr);
        ctx.fillText(glyph.char, 0, this.baseline);
      });
    }
  }

  /** One step of the run: the text moves on by the time since the last frame */
  public frame(now: number) {
    const dt = this.last === null ? 0 : Math.min(Math.max(0, now - this.last), 0.05);
    this.last = now;
    if(!this.perimeter || !dt) {
      return;
    }

    this.offset = (this.offset + dt * SPEED) % (this.perimeter.length / 2);
    this.draw();
  }

  /** The page was hidden: no jump on return */
  public resetClock() {
    this.last = null;
  }
}

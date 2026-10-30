// The typed amount — exactly what the person typed, not a number: otherwise
// «10.» in the middle of typing would collapse into «10». A port of AmountEntry.

export class AmountEntry {
  public static maxInteger = 9;
  public static maxFraction = 2;

  public integer: string;
  /** null — no point typed yet; '' — a point with no digits after it. */
  public fraction: string;
  /** Digits allowed after the point: the design's two by default, nine for Grams. */
  public maxFraction: number;

  constructor(integer = '0', fraction: string = null, maxFraction = AmountEntry.maxFraction) {
    this.integer = integer;
    this.fraction = fraction;
    this.maxFraction = maxFraction;
  }

  /** The reverse conversion: to cents, without trailing zeros. */
  public static fromValue(value: number): AmountEntry {
    const cents = Math.round(value * 100);
    const whole = Math.trunc(cents / 100);
    let tail = String(Math.abs(cents) % 100).padStart(2, '0');
    while(tail.endsWith('0')) tail = tail.slice(0, -1);
    return new AmountEntry(String(whole), tail || null);
  }

  /** From a plain decimal string («1234.500»): cut to `maxFraction` digits, without trailing zeros. */
  public static fromDecimal(text: string, maxFraction = AmountEntry.maxFraction): AmountEntry {
    const [whole, tail = ''] = text.split('.');
    let fraction = tail.slice(0, maxFraction);
    while(fraction.endsWith('0')) fraction = fraction.slice(0, -1);
    return new AmountEntry(whole.replace(/^0+(?=\d)/, '') || '0', fraction || null, maxFraction);
  }

  /** The typed amount as a plain decimal string («10.» → «10.0»). */
  public get decimal(): string {
    return `${this.integer || '0'}.${this.fraction || '0'}`;
  }

  public get value(): number {
    return Number(`${this.integer || '0'}.${this.fraction || '0'}`) || 0;
  }

  public get integerText(): string {
    return grouped(this.integer || '0');
  }

  public get fractionText(): string {
    return this.fraction === null ? '' : `.${this.fraction}`;
  }

  public get acceptsDigit(): boolean {
    if(this.fraction !== null) return this.fraction.length < this.maxFraction;
    return this.integer === '0' || this.integer.length < AmountEntry.maxInteger;
  }

  public get acceptsPoint(): boolean {
    return this.fraction === null && this.maxFraction > 0;
  }

  public get isZero(): boolean {
    return this.integer === '0' && this.fraction === null;
  }

  public append(d: string) {
    if(this.fraction !== null) {
      if(this.fraction.length < this.maxFraction) this.fraction += d;
    } else if(this.integer === '0') this.integer = d;
    else if(this.integer.length < AmountEntry.maxInteger) this.integer += d;
  }

  public startFraction() {
    if(this.fraction === null) this.fraction = '';
  }

  /** `text` — digits and a point — typed after this amount, as a new entry; null when a part of it is not taken. */
  public typed(text: string): AmountEntry | null {
    const next = new AmountEntry(this.integer, this.fraction, this.maxFraction);
    for(const char of text) {
      if(char === '.' ? !next.acceptsPoint : !next.acceptsDigit) return null;
      if(char === '.') next.startFraction();
      else next.append(char);
    }

    return next;
  }

  public deleteBackward() {
    if(this.fraction !== null) {
      this.fraction = this.fraction ? this.fraction.slice(0, -1) : null;
    } else if(this.integer.length > 1) {
      this.integer = this.integer.slice(0, -1);
    } else {
      this.integer = '0';
    }
  }
}

/**
 * A number pasted, dropped or filled in at once, as the typing path takes it: ASCII digits and at most one point
 * («1,234.56» → «1234.56»), or null when it is no amount. Spaces go; with both «,» and «.» the last of them is the
 * point and the rest group the digits; several of one kind group, a single one is the point. A single comma before
 * exactly three digits («1,234») reads either way — a thousand or one and a bit — and is refused rather than guessed,
 * as are groups of other sizes than the digits are grouped in (three, or two in the middle as in India).
 */
export function parseTypedAmount(text: string): string | null {
  const value = text.replace(/\s/g, '');
  if(!/^[\d.,]*\d[\d.,]*$/.test(value)) return null;
  const count = (char: string) => value.split(char).length - 1;
  const dots = count('.'), commas = count(',');
  let point: string;
  if(dots && commas) point = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
  else if(dots === 1) point = '.';
  else if(commas === 1) point = ',';
  // * the point is the last separator, and only one: «1,2.3.4» is no number
  if(point && count(point) > 1) return null;

  const pointAt = point ? value.lastIndexOf(point) : -1;
  const whole = pointAt === -1 ? value : value.slice(0, pointAt);
  const fraction = pointAt === -1 ? undefined : value.slice(pointAt + 1);
  if(point === ',' && !dots && /^[1-9]\d{0,2}$/.test(whole) && /^\d{3}$/.test(fraction)) return null;

  const groups = whole.split(/[.,]/);
  if(groups.length > 1) {
    const middle = groups.slice(1, -1);
    if(!/^\d{1,3}$/.test(groups[0]) || !/^\d{3}$/.test(groups[groups.length - 1]) || middle.some((group) => !/^\d{2,3}$/.test(group))) {
      return null;
    }
  }

  return groups.join('') + (fraction === undefined ? '' : '.' + fraction);
}

export function grouped(digits: string): string {
  let out = '';
  [...digits].reverse().forEach((c, i) => {
    if(i > 0 && i % 3 === 0) out = ',' + out;
    out = c + out;
  });
  return out;
}

/** An amount for display: whole — without «.00», with a fraction — always two digits («12.50», not «12.5»). */
export function display(value: number): string {
  const e = AmountEntry.fromValue(value);
  return e.integerText + (e.fraction ? `.${e.fraction.padEnd(2, '0')}` : '');
}

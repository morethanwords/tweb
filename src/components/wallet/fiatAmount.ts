/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bigInt, {BigInteger} from 'big-integer';

/**
 * Fiat and Grams in exact decimals: the rate is the decimal it is written as, an amount typed in fiat becomes Grams
 * with no float on the way, and what the Send button says is what goes.
 */

/** An amount typed in fiat goes in whole hundredths of a Gram, as Android sends it: the button can say it exactly */
export const FIAT_GRAMS_DECIMALS = 2;

const GRAM_DECIMALS = 9;
const TEN = bigInt(10);

export type DecimalRounding = 'halfUp' | 'up' | 'down';

/** `digits / 10^scale` */
type Decimal = {digits: BigInteger, scale: number};

/** `12.5`, `12.`, `.5`, `1.5e-7`: plain digits with at most one point and an exponent; anything else is nothing */
function parseDecimal(text: string): Decimal | undefined {
  const match = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if(!match || !(match[1] || match[2])) {
    return;
  }

  const fraction = match[2] || '';
  let digits = bigInt((match[1] || '') + fraction || '0');
  let scale = fraction.length - Number(match[3] || 0);
  if(scale < 0) {
    digits = digits.multiply(TEN.pow(-scale));
    scale = 0;
  }

  return {digits, scale};
}

/** The rate as JavaScript writes the number (`2.12`, `1.5e-7`) — that decimal, exactly; none for one that is no rate */
function parseRate(rate: number) {
  return Number.isFinite(rate) && rate > 0 ? parseDecimal(String(rate)) : undefined;
}

/** `a / b` for `a >= 0`, `b > 0`, rounded as asked */
function divide(a: BigInteger, b: BigInteger, rounding: DecimalRounding) {
  const {quotient, remainder} = a.divmod(b);
  if(remainder.isZero() || rounding === 'down') return quotient;
  if(rounding === 'up') return quotient.add(1);
  return remainder.multiply(2).compare(b) >= 0 ? quotient.add(1) : quotient;
}

/**
 * Nanograms for an amount typed in fiat at `rate` (fiat per Gram): divided exactly, in hundredths of a Gram rounded
 * half up (Android WalletSendEnterAmount.getGramNanoAmount). `'0'` for no amount or no rate.
 */
export function fiatToNanos(fiat: string, rate: number): string {
  const amount = parseDecimal(fiat), perGram = parseRate(rate);
  if(!amount || !perGram) {
    return '0';
  }

  // * (A / 10^a) / (R / 10^r), in hundredths: A * 10^(r + 2) / (R * 10^a)
  const hundredths = divide(
    amount.digits.multiply(TEN.pow(perGram.scale + FIAT_GRAMS_DECIMALS)),
    perGram.digits.multiply(TEN.pow(amount.scale)),
    'halfUp'
  );

  return hundredths.multiply(TEN.pow(GRAM_DECIMALS - FIAT_GRAMS_DECIMALS)).toString();
}

/**
 * What `nanos` are worth in fiat at `rate`, with exactly `exponent` decimals (`3.09`, `172`): half up for showing,
 * up for a minimum that must not fall under itself again
 */
export function nanosToFiat(nanos: string, rate: number, exponent: number, rounding: DecimalRounding = 'halfUp'): string {
  const perGram = parseRate(rate);
  const value = bigInt(nanos).abs();
  const units = perGram ? divide(
    value.multiply(perGram.digits).multiply(TEN.pow(exponent)),
    TEN.pow(perGram.scale + GRAM_DECIMALS),
    rounding
  ) : bigInt.zero;

  const text = units.toString().padStart(exponent + 1, '0');
  return exponent > 0 ? text.slice(0, -exponent) + '.' + text.slice(-exponent) : text;
}

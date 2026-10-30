/*
 * The amount screen's pasted numbers: a paste, a drop or an autofill is read as a whole number — grouping and the
 * point told apart — and then typed under the same limits as keys, all of it or nothing.
 */

import {describe, expect, it} from 'vitest';
import {AmountEntry, parseTypedAmount} from '@components/wallet/visual/amount/entry';

describe('a pasted amount', () => {
  it('takes the last of a comma and a point as the point, the rest as grouping', () => {
    expect(parseTypedAmount('1,234.56')).toBe('1234.56');
    expect(parseTypedAmount('1.234,56')).toBe('1234.56');
    expect(parseTypedAmount('1,234,567.891')).toBe('1234567.891');
    expect(parseTypedAmount('1.234.567,89')).toBe('1234567.89');
    expect(parseTypedAmount('1,23,456.78')).toBe('123456.78');
  });

  it('drops spaces, the non-breaking ones too', () => {
    expect(parseTypedAmount(' 12.5 ')).toBe('12.5');
    expect(parseTypedAmount('1 234,56')).toBe('1234.56');
    expect(parseTypedAmount('1 234.5')).toBe('1234.5');
    expect(parseTypedAmount('1 234 567')).toBe('1234567');
  });

  it('reads several of one separator as grouping and a single one as the point', () => {
    expect(parseTypedAmount('1,234,567')).toBe('1234567');
    expect(parseTypedAmount('1.234.567')).toBe('1234567');
    expect(parseTypedAmount('12,5')).toBe('12.5');
    expect(parseTypedAmount('0,123')).toBe('0.123');
    expect(parseTypedAmount('1234,567')).toBe('1234.567');
    expect(parseTypedAmount('1.234')).toBe('1.234');
    expect(parseTypedAmount('.5')).toBe('.5');
    expect(parseTypedAmount('5.')).toBe('5.');
    expect(parseTypedAmount('15')).toBe('15');
  });

  it('refuses a single comma before three digits: a thousand or one and a bit', () => {
    expect(parseTypedAmount('1,234')).toBeNull();
    expect(parseTypedAmount('12,500')).toBeNull();
    expect(parseTypedAmount('999,000')).toBeNull();
  });

  it('refuses what is no number', () => {
    for(const text of ['', '  ', ',.', '..', '-5', '+5', '$12', '12 GRAM', '1e5', 'abc', '١٢', '1,2.3.4', '1.234,5,6']) {
      expect(parseTypedAmount(text)).toBeNull();
    }
  });

  it('refuses groups of other sizes than digits are grouped in', () => {
    expect(parseTypedAmount('1,2,3')).toBeNull();
    expect(parseTypedAmount('12.34.56')).toBeNull();
    expect(parseTypedAmount('1,,234')).toBeNull();
    expect(parseTypedAmount('1234,567,890')).toBeNull();
    expect(parseTypedAmount('1.2.3,4')).toBeNull();
  });
});

describe('a pasted amount, typed', () => {
  const typed = (entry: AmountEntry, text: string) => {
    const next = entry.typed(parseTypedAmount(text));
    return next && next.decimal;
  };

  it('replaces a zero and follows what was typed before it', () => {
    expect(typed(new AmountEntry('0', null, 9), '1,234.56')).toBe('1234.56');
    expect(typed(new AmountEntry('5', null, 9), '12')).toBe('512.0');
    expect(typed(new AmountEntry('0', null, 9), '0.5')).toBe('0.5');
  });

  it('is refused whole when a part does not fit: an amount is never cut to another one', () => {
    // * ten decimals in Grams, three in a fiat with two
    expect(typed(new AmountEntry('0', null, 9), '1.1234567891')).toBeNull();
    expect(typed(new AmountEntry('0', null, 2), '12.345')).toBeNull();
    // * ten digits before the point
    expect(typed(new AmountEntry('0', null, 9), '1,234,567,890')).toBeNull();
    // * a second point
    expect(typed(new AmountEntry('1', '5', 9), '2.3')).toBeNull();
    // * an entry is left as it was
    const entry = new AmountEntry('7', null, 2);
    expect(entry.typed('1.234')).toBeNull();
    expect(entry.decimal).toBe('7.0');
  });

  it('takes nine decimals in Grams and two in fiat', () => {
    expect(typed(new AmountEntry('0', null, 9), '0.123456789')).toBe('0.123456789');
    expect(typed(new AmountEntry('0', null, 2), '1.234,56')).toBe('1234.56');
  });
});

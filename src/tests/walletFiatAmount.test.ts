/*
 * An amount typed in fiat on the send screen: turned into Grams with exact decimals, in whole hundredths of a Gram
 * (Android), so that what the Send button says is what is sent; and Grams shown in fiat the same exact way.
 */

import {describe, expect, it} from 'vitest';
import {fiatToNanos, nanosToFiat} from '@components/wallet/fiatAmount';
import {formatFiat} from '@components/wallet/format';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';

describe('fiat typed into the send screen', () => {
  it('goes in whole hundredths of a Gram, rounded half up', () => {
    // * 3.09 / 2.12 = 1.4575…
    expect(fiatToNanos('3.09', 2.12)).toBe('1460000000');
    // * 100 / 2.1234567891234 = 47.0930…
    expect(fiatToNanos('100.00', 2.1234567891234)).toBe('47090000000');
    expect(fiatToNanos('10', 2)).toBe('5000000000');
  });

  it('divides exactly where a float would land just under the half', () => {
    // * 2.01 / 2 is 1.005 exactly; as floats it is 1.00499…, which rounds down
    expect(fiatToNanos('2.01', 2)).toBe('1010000000');
    // * 0.3 / 0.1 is 3 exactly; as floats it is 2.99999…
    expect(fiatToNanos('0.3', 0.1)).toBe('3000000000');
  });

  it('reads a rate JavaScript writes with an exponent', () => {
    expect(fiatToNanos('0.0000003', 1.5e-7)).toBe('2000000000');
    expect(fiatToNanos('3000000000000000000000', 1e21)).toBe('3000000000');
  });

  it('is nothing without an amount or a rate', () => {
    expect(fiatToNanos('0.0', 2.12)).toBe('0');
    expect(fiatToNanos('', 2.12)).toBe('0');
    expect(fiatToNanos('1,5', 2.12)).toBe('0');
    expect(fiatToNanos('5', 0)).toBe('0');
    expect(fiatToNanos('5', NaN)).toBe('0');
    expect(fiatToNanos('5', Infinity)).toBe('0');
    expect(fiatToNanos('5', -2)).toBe('0');
  });

  it('is an amount the button writes in full with two decimals', () => {
    for(const fiat of ['0.01', '0.37', '1.99', '12.34', '99.99', '1234.56', '0.07']) {
      for(const rate of [2.12, 1.87, 172.4, 0.0003, 3.3333333]) {
        const nanos = fiatToNanos(fiat, rate);
        expect(nanos.endsWith('0000000') || nanos === '0').toBe(true);
        // * what the button shows of it, all nine decimals allowed, is what the two decimals say
        expect(formatNanoton(nanos, 9, false)).toBe(formatNanoton(nanos, 2, false));
      }
    }
  });
});

describe('Grams shown in fiat', () => {
  it('has the currency\'s decimals, rounded half up', () => {
    expect(nanosToFiat('1460000000', 2.12, 2)).toBe('3.10');
    expect(nanosToFiat('1000000000', 172.4, 2)).toBe('172.40');
    expect(nanosToFiat('1000000000', 172.4, 0)).toBe('172');
    expect(nanosToFiat('1000000000', 0.3, 3)).toBe('0.300');
    expect(nanosToFiat('1', 2.12, 2)).toBe('0.00');
    // * 1.005 exactly: a float's toFixed(2) says 1.00
    expect(nanosToFiat('1005000000', 1, 2)).toBe('1.01');
  });

  it('rounds a minimum up, so that it is not under itself once typed back', () => {
    expect(nanosToFiat('100000000', 2.12, 2, 'up')).toBe('0.22');
    expect(nanosToFiat('100000000', 2.12, 2, 'halfUp')).toBe('0.21');
    expect(nanosToFiat('100000000', 2.12, 2, 'down')).toBe('0.21');
    for(const rate of [2.12, 3.33, 1.87, 0.37, 172.4]) {
      const fiat = nanosToFiat('100000000', rate, 2, 'up');
      expect(+fiatToNanos(fiat, rate)).toBeGreaterThanOrEqual(100000000);
    }
  });

  it('is nothing at no rate', () => {
    expect(nanosToFiat('1000000000', 0, 2)).toBe('0.00');
    expect(nanosToFiat('1000000000', NaN, 0)).toBe('0');
  });
});

describe('fiat written next to an amount', () => {
  it('says what the amount screen says: the same exact decimals', () => {
    // * 1.005 exactly: as floats 100.49999… cents, which rounded to $1.00
    expect(formatFiat('1005000000', 1, 'USD')).toBe('$1.01');
    expect(formatFiat('1460000000', 2.12, 'USD')).toBe('$3.10');
    expect(formatFiat('1000000000', 172.4, 'JPY')).toBe('¥172');
    expect(formatFiat('1000000000', 2.5, 'EUR')).toBe('2,50 €');
    for(const nanos of ['1005000000', '2015000000', '4255000000', '123456789012', '1']) {
      for(const rate of [1, 2.12, 3.3333333, 0.3]) {
        expect(formatFiat(nanos, rate, 'USD')).toBe('$' + Number(nanosToFiat(nanos, rate, 2)).toLocaleString('en-US', {minimumFractionDigits: 2}));
      }
    }
  });

  it('writes a fee with more decimals than the currency has, exactly too', () => {
    expect(formatFiat('2900000', 2, 'USD', 4)).toBe('$0.0058');
    // * 0.00015 exactly is half up: as a float it is 0.000149999…
    expect(formatFiat('150000', 1, 'USD', 4)).toBe('$0.0002');
    expect(formatFiat('350000', 1, 'USD', 4)).toBe('$0.0004');
  });

  it('keeps the sign and says nothing worth at no rate', () => {
    expect(formatFiat('-1005000000', 1, 'USD')).toBe('-$1.01');
    expect(formatFiat('1000000000', 0, 'USD')).toBe('$0.00');
  });
});

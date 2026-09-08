import {StarsAmount} from '@layer';
import formatStarsAmount, {formatStarsAmountExact, starsAmountNanounits} from '@appManagers/utils/payments/formatStarsAmount';

describe('exact transaction amounts', () => {
  test.each([
    ['0', 0, '0'],
    ['0', 1, '0.000000001'],
    ['0', -1, '-0.000000001'],
    ['1', -1, '0.999999999'],
    ['-1', 1, '-0.999999999'],
    ['-1', -500000000, '-1.5'],
    ['9007199254740993', 123456789, '9007199254740993.123456789'],
    ['-9223372036854775808', -999999999, '-9223372036854775808.999999999']
  ])('formats Stars %s + %s nanos without losing precision', (amount, nanos, expected) => {
    expect(formatStarsAmountExact({_: 'starsAmount', amount, nanos})).toBe(expected);
  });

  test.each([
    ['0', '0'],
    ['1', '0.000000001'],
    ['-1', '-0.000000001'],
    ['1250000000', '1.25'],
    ['9223372036854775807', '9223372036.854775807'],
    ['-9223372036854775808', '-9223372036.854775808']
  ])('formats Gram nanounits %s without losing precision', (amount, expected) => {
    expect(formatStarsAmountExact({_: 'starsTonAmount', amount})).toBe(expected);
  });

  test('preserves int64 string amounts when constructing a transaction', () => {
    expect(formatStarsAmountExact(formatStarsAmount('9223372036854775807'))).toBe('9223372036854775807');
    expect(formatStarsAmountExact(formatStarsAmount('-9223372036854775808'))).toBe('-9223372036854775808');
  });

  test('adds a fractional commission exactly before displaying the full price', () => {
    const net: StarsAmount = {_: 'starsAmount', amount: '9007199254740993', nanos: 999999999};
    const commission: StarsAmount = {_: 'starsAmount', amount: 0, nanos: 1};
    expect(starsAmountNanounits(net).add(starsAmountNanounits(commission)).toString()).toBe('9007199254740994000000000');
  });

  test.each([0.1, -0.1, 1.25, -1.25, 0.000000001, -0.000000001])('retains signed fractional Stars when encoding %s', (amount) => {
    expect(formatStarsAmount(formatStarsAmount(amount))).toBe(amount);
  });
});

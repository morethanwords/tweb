import {formatNanoton, parseNanotonFromDecimal} from '@helpers/paymentsWrapCurrencyAmount';

describe('Gram amount formatting', () => {
  test.each([
    ['123456789', 3, '0.123'],
    ['123556789', 3, '0.124'],
    ['1005000', 3, '0.001'],
    ['500000', 3, '0.001'],
    ['550000000', 1, '0.6'],
    ['995000000', 0, '1'],
    ['950000000', 1, '1'],
    ['995000000', 2, '1'],
    ['999500000', 3, '1'],
    ['-1005000', 3, '-0.001'],
    ['-1', 2, '0'],
    ['-1', 9, '-0.000000001'],
    ['9223372036854775807', 9, '9,223,372,036.854775807']
  ])('formats %s nanograms with %s decimals', (amount, decimals, expected) => {
    expect(formatNanoton(amount, decimals)).toBe(expected);
  });

  test.each([
    ['0.000000001', '1'],
    ['-0.000000001', '-1'],
    ['-1.25', '-1250000000'],
    ['1.25', '1250000000'],
    ['9223372036.854775807', '9223372036854775807'],
    ['-9223372036.854775808', '-9223372036854775808']
  ])('parses signed decimal %s exactly', (decimal, expected) => {
    expect(parseNanotonFromDecimal(decimal).toString()).toBe(expected);
  });

  test.each(['1', '-1', '999999999', '-999999999', '9223372036854775807', '-9223372036854775808'])('round trips %s nanograms', (amount) => {
    expect(parseNanotonFromDecimal(formatNanoton(amount, 9, false)).toString()).toBe(amount);
  });
});

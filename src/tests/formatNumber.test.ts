import formatNumber from '@helpers/number/formatNumber';

describe('formatNumber', () => {
  test('zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  test('small numbers below 1K are unchanged', () => {
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(999)).toBe('999');
  });

  test('thousands / millions / billions / trillions', () => {
    expect(formatNumber(1500)).toBe('1.5K');
    expect(formatNumber(1e6)).toBe('1M');
    expect(formatNumber(1e9)).toBe('1B');
    expect(formatNumber(1e12)).toBe('1T');
  });

  test('negative numbers keep the sign', () => {
    expect(formatNumber(-1500)).toBe('-1.5K');
    expect(formatNumber(-1e9)).toBe('-1B');
  });

  test('decimals are respected', () => {
    expect(formatNumber(1234, 1)).toBe('1.2K');
    expect(formatNumber(1234, 0)).toBe('1K');
  });

  // Contract guard (NOT a user-visible bug — real counts top out around billions):
  // sizes = ['', 'K', 'M', 'B', 'T'] has length 5, but i = floor(log(n)/log(1000))
  // reaches 5 at 1e15. sizes[5] is undefined, so the result is `value + undefined`,
  // which coerces to NaN — a number, not the documented `: string`. This locks the
  // return type on out-of-range magnitudes, mirroring the formatBytes clamp.
  test('out-of-range magnitudes stay strings, never NaN / undefined', () => {
    const quadrillion = formatNumber(1e15);
    expect(typeof quadrillion).toBe('string');
    expect(quadrillion).not.toContain('undefined');
    expect(quadrillion).not.toContain('NaN');
    expect(Number.isNaN(+quadrillion.replace(/[^\d.-]/g, ''))).toBe(false);

    const fiveQuadrillion = formatNumber(5e15);
    expect(fiveQuadrillion).not.toContain('undefined');
    expect(fiveQuadrillion).not.toContain('NaN');

    const quintillion = formatNumber(1e18);
    expect(quintillion).not.toContain('undefined');
    expect(quintillion).not.toContain('NaN');
  });

  test('negative extreme values never produce NaN', () => {
    const negQuadrillion = formatNumber(-2e15);
    expect(negQuadrillion).not.toContain('NaN');
    expect(negQuadrillion).not.toContain('undefined');
    expect(negQuadrillion.startsWith('-')).toBe(true);
  });
});

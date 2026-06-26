import formatBytesPure from '@helpers/formatBytesPure';

describe('formatBytesPure', () => {
  test('zero bytes', () => {
    expect(formatBytesPure(0)).toBe('0 B');
  });

  test('sub-KB stays in bytes', () => {
    expect(formatBytesPure(1023)).toBe('1023 B');
  });

  test('exactly 1 KB', () => {
    expect(formatBytesPure(1024)).toBe('1 KB');
  });

  test('1 GB unchanged', () => {
    expect(formatBytesPure(1024 ** 3)).toBe('1.00 GB');
  });

  test('1 TB formats with TB unit (regression: was "1.000 ")', () => {
    expect(formatBytesPure(1024 ** 4)).toBe('1.000 TB');
  });

  test('5 TB formats with TB unit (regression: was "4.547 ")', () => {
    expect(formatBytesPure(5 * 1024 ** 4)).toBe('5.000 TB');
  });

  test('3 PB formats with PB unit', () => {
    expect(formatBytesPure(3 * 1024 ** 5)).toBe('3.0000 PB');
  });

  test('TB-range value with fixed 0 decimals', () => {
    expect(formatBytesPure(2 * 1024 ** 4, 0)).toBe('2 TB');
  });

  test('unit is always defined across every magnitude', () => {
    for(let p = 0; p <= 6; ++p) {
      const result = formatBytesPure(2 * 1024 ** p);
      expect(result).toMatch(/ (B|KB|MB|GB|TB|PB)$/);
      expect(result.endsWith(' ')).toBe(false);
      expect(result).not.toContain('undefined');
    }
  });
});

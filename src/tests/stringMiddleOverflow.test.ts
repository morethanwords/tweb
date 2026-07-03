import stringMiddleOverflow from '@helpers/string/stringMiddleOverflow';

describe('stringMiddleOverflow', () => {
  test('returns the string unchanged when it fits within maxLength', () => {
    expect(stringMiddleOverflow('short', 18)).toBe('short');
    expect(stringMiddleOverflow('exactlyten', 10)).toBe('exactlyten');
    expect(stringMiddleOverflow('', 5)).toBe('');
  });

  test('keeps a head, the ellipsis, and a tail of the original', () => {
    const result = stringMiddleOverflow('0123456789', 8);
    expect(result).toContain('...');
    expect(result.startsWith('0')).toBe(true);
    expect(result.endsWith('9')).toBe(true);
  });

  // The bug: a middle-truncation helper must never produce a result that
  // exceeds maxLength — yet the original implementation added the 3-char
  // ellipsis ON TOP of two ~maxLength/2 halves, so the output was always
  // ~maxLength + 3 characters long.
  test('never exceeds maxLength for any overflowing input', () => {
    const inputs = [
      'abcdefgh',
      'abcdefg',
      'abcdefghij',
      '0123456789',
      'a'.repeat(20),
      '123456789012345678901',
      'x'.repeat(100)
    ];

    for(const input of inputs) {
      for(const maxLength of [6, 8, 10, 18, 26]) {
        const result = stringMiddleOverflow(input, maxLength);
        expect(result.length).toBeLessThanOrEqual(maxLength);
      }
    }
  });

  // The production call site shortens a search query to 18 chars; before the
  // fix, a 19–21 char query produced a "shortened" label LONGER than the raw
  // query, defeating the purpose entirely.
  test('shortened result is never longer than the original (maxLength 18, the production value)', () => {
    for(let len = 19; len <= 40; ++len) {
      const input = 'q'.repeat(len);
      const result = stringMiddleOverflow(input, 18);
      expect(result.length).toBeLessThanOrEqual(18);
      expect(result.length).toBeLessThan(input.length);
    }
  });
});

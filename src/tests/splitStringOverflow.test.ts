import splitStringByLength from '@helpers/string/splitStringByLength';

function assertValidSplit(original: string, parts: string[], maxLength: number) {
  expect(parts.join('')).toBe(original);
  expect(parts.every((p) => p.length > 0)).toBe(true);
  expect(parts.every((p) => p.length <= maxLength)).toBe(true);
}

describe('splitStringByLength overflow path', () => {
  test('single oversized token followed by words (the #343 overflow path)', () => {
    const str = 'X'.repeat(35) + ' aa bb cc dd ee ff';
    const parts = splitStringByLength(str, 10);
    assertValidSplit(str, parts, 10);
  });

  test('long leading token then more words', () => {
    const str = 'A'.repeat(250) + ' second third';
    const parts = splitStringByLength(str, 100);
    assertValidSplit(str, parts, 100);
  });

  test('oversized token in the middle of words', () => {
    const str = 'aa bb ' + 'C'.repeat(45) + ' dd ee ff gg';
    const parts = splitStringByLength(str, 10);
    assertValidSplit(str, parts, 10);
  });

  test('multiple oversized tokens', () => {
    const str = 'X'.repeat(35) + ' yy ' + 'Z'.repeat(28) + ' end';
    const parts = splitStringByLength(str, 10);
    assertValidSplit(str, parts, 10);
  });
});

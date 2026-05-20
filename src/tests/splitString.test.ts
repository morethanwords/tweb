import splitStringByLength from '@helpers/string/splitStringByLength';

function assertValidSplit(original: string, parts: string[], maxLength: number) {
  expect(parts.join('')).toBe(original);
  expect(parts.every((p) => p.length > 0)).toBe(true);
  expect(parts.every((p) => p.length <= maxLength)).toBe(true);
}

describe('splitStringByLength', () => {
  test('string under limit returns single element', () => {
    const str = 'hello world';
    const parts = splitStringByLength(str, 100);
    expect(parts).toEqual([str]);
  });

  test('string exactly at limit returns single element', () => {
    const str = 'abcde';
    const parts = splitStringByLength(str, 5);
    expect(parts).toEqual([str]);
  });

  test('basic two-part split on word boundary', () => {
    const str = 'aaa bbb ccc ddd';
    const parts = splitStringByLength(str, 8);
    assertValidSplit(str, parts, 8);
    expect(parts.length).toBe(2);
  });

  test('three-part split preserves all content (the #343 bug)', () => {
    const str = 'aaa bbb ccc ddd eee fff ggg hhh iii';
    const parts = splitStringByLength(str, 12);
    assertValidSplit(str, parts, 12);
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  test('no spaces forces hard split at maxLength', () => {
    const str = 'abcdefghijklmnopqrstuvwxyz';
    const parts = splitStringByLength(str, 10);
    assertValidSplit(str, parts, 10);
  });

  test('trailing content after last space is not lost', () => {
    const str = 'aaa bbb c';
    const parts = splitStringByLength(str, 5);
    assertValidSplit(str, parts, 5);
    expect(parts[parts.length - 1]).toContain('c');
  });

  test('single character words', () => {
    const str = 'a b c d e f g h i j';
    const parts = splitStringByLength(str, 4);
    assertValidSplit(str, parts, 4);
  });

  test('large realistic message (~12k chars, maxLength 4096)', () => {
    const words = Array.from({length: 2000}, (_, i) => 'word' + i);
    const str = words.join(' ');
    const parts = splitStringByLength(str, 4096);
    assertValidSplit(str, parts, 4096);
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  test('message with varying word lengths', () => {
    const str = 'short ' + 'a'.repeat(50) + ' medium ' + 'b'.repeat(100) + ' tiny ' + 'c'.repeat(30) + ' end';
    const parts = splitStringByLength(str, 60);
    assertValidSplit(str, parts, 60);
  });

  test('spaces at split boundaries', () => {
    // Words that exactly fill the limit
    const str = 'aaaa bbbb cccc dddd';
    const parts = splitStringByLength(str, 9);
    assertValidSplit(str, parts, 9);
  });

  test('many parts split correctly (stress test)', () => {
    const words = Array.from({length: 500}, () => 'test');
    const str = words.join(' ');
    const parts = splitStringByLength(str, 20);
    assertValidSplit(str, parts, 20);
    expect(parts.length).toBeGreaterThan(10);
  });
});

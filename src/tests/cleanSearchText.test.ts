import {clearBadCharsAndTrim} from '@helpers/cleanSearchText';

describe('clearBadCharsAndTrim', () => {
  test('removes ALL leading whitespace', () => {
    expect(clearBadCharsAndTrim('   xyz')).toEqual('xyz');
  });

  test('removes ALL trailing whitespace (not just the last char)', () => {
    expect(clearBadCharsAndTrim('abc   ')).toEqual('abc');
  });

  test('trims both ends fully', () => {
    expect(clearBadCharsAndTrim('  hello  ')).toEqual('hello');
  });

  test('trims trailing tabs fully', () => {
    expect(clearBadCharsAndTrim('tab\t\t')).toEqual('tab');
  });

  test('keeps inner whitespace, only trims the edges', () => {
    expect(clearBadCharsAndTrim('a b   ')).toEqual('a b');
  });

  test('still strips bad chars while trimming', () => {
    expect(clearBadCharsAndTrim('  foo!!!  ')).toEqual('foo');
  });

  test('empty-after-trim collapses to empty string', () => {
    expect(clearBadCharsAndTrim('    ')).toEqual('');
  });
});

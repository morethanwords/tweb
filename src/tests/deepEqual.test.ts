import {describe, expect, test} from 'vitest';
import deepEqual from '../helpers/object/deepEqual';

describe('deepEqual', () => {
  test('compares flat objects', () => {
    expect(deepEqual({a: 1, b: 2}, {a: 1, b: 2})).toBe(true);
    expect(deepEqual({a: 1, b: 2}, {a: 1, b: 3})).toBe(false);
  });

  test('ignores undefined properties', () => {
    expect(deepEqual({a: 1, b: undefined}, {a: 1})).toBe(true);
    expect(deepEqual({a: 1}, {a: 1, b: undefined})).toBe(true);
  });

  test('recurses into nested objects', () => {
    expect(deepEqual({a: {b: 1}}, {a: {b: 1}})).toBe(true);
    expect(deepEqual({a: {b: 1}}, {a: {b: 2}})).toBe(false);
  });

  test('ignores the given keys at the top level', () => {
    expect(deepEqual({a: 1, date: 1}, {a: 1, date: 2}, ['date'])).toBe(true);
    expect(deepEqual({a: 1, date: 1}, {a: 2, date: 1}, ['date'])).toBe(false);
  });

  // * Regression: ignoreKeys must apply ONLY at the comparison (top) level.
  // * Previously it leaked into every recursion depth, so a nested object that
  // * differed under a same-named key was wrongly reported equal.
  test('does NOT ignore the keys inside nested objects', () => {
    // `date` exists at BOTH levels; ignoring it at the top must not hide the
    // nested difference under `meta.date`.
    expect(deepEqual(
      {date: 1, meta: {date: 10}},
      {date: 2, meta: {date: 20}},
      ['date']
    )).toBe(false);

    expect(deepEqual(
      {date: 1, reply_to: 'a', meta: {reply_to: 'x'}},
      {date: 2, reply_to: 'b', meta: {reply_to: 'y'}},
      ['date', 'reply_to']
    )).toBe(false);
  });

  test('nested objects still equal when the differing key is genuinely top-level only', () => {
    expect(deepEqual(
      {date: 1, meta: {date: 10}},
      {date: 999, meta: {date: 10}},
      ['date']
    )).toBe(true);
  });
});

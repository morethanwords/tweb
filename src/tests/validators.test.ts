import {isUsernameValid, isWebAppNameValid} from '../lib/richTextProcessor/validators';

// Mirrors TDLib's is_valid_username (with tweb's 3-char minimum):
// https://github.com/tdlib/td/blob/master/td/telegram/misc.cpp is_valid_username
describe('isUsernameValid', () => {
  test('accepts a plain valid username', () => {
    expect(isUsernameValid('durov')).toBe(true);
    expect(isUsernameValid('Abc123')).toBe(true);
    expect(isUsernameValid('a_b_c')).toBe(true);
  });

  test('rejects too short / too long', () => {
    expect(isUsernameValid('ab')).toBe(false); // < 3
    expect(isUsernameValid('a'.repeat(33))).toBe(false); // > 32
  });

  test('rejects a non-letter first character', () => {
    expect(isUsernameValid('1abc')).toBe(false);
    expect(isUsernameValid('_abc')).toBe(false);
  });

  test('rejects disallowed characters', () => {
    expect(isUsernameValid('abc-def')).toBe(false);
    expect(isUsernameValid('abc.def')).toBe(false);
    expect(isUsernameValid('abc def')).toBe(false);
  });

  // The two regression cases — TDLib rejects both; the dead `=== ''` checks let them through.
  test('rejects a trailing underscore', () => {
    expect(isUsernameValid('abc_')).toBe(false);
    expect(isUsernameValid('username_')).toBe(false);
  });

  test('rejects consecutive underscores', () => {
    expect(isUsernameValid('a__b')).toBe(false);
    expect(isUsernameValid('foo___bar')).toBe(false);
  });

  test('accepts single non-trailing underscores', () => {
    expect(isUsernameValid('a_b')).toBe(true);
    expect(isUsernameValid('foo_bar_baz')).toBe(true);
  });
});

describe('isWebAppNameValid', () => {
  test('inherits the username rules', () => {
    expect(isWebAppNameValid('myapp')).toBe(true);
    expect(isWebAppNameValid('ab')).toBe(false);
    expect(isWebAppNameValid('app_')).toBe(false);
    expect(isWebAppNameValid('a__b')).toBe(false);
  });
});

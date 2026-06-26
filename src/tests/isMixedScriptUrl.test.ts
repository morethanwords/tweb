import {describe, expect, test} from 'vitest';
import isMixedScriptUrl from '../helpers/string/isMixedScriptUrl';

// Reference: telegram-tt src/util/browser/url.ts (isMixedScriptUrl), which feeds the
// raw url through ensureProtocol() before `new URL(...)`. The tweb port dropped that
// step, so a protocol-less url makes `new URL(...)` throw and the catch wrongly
// classifies it as mixed-script. These cases lock in the corrected behaviour.

describe('isMixedScriptUrl', () => {
  test('protocol-prefixed pure-Latin domain is not mixed-script', () => {
    expect(isMixedScriptUrl('https://example.com')).toBe(false);
  });

  test('protocol-less pure-Latin domain is not mixed-script', () => {
    // Before the fix: `new URL('example.com')` throws → catch returns true.
    expect(isMixedScriptUrl('example.com')).toBe(false);
  });

  test('protocol-less domain with digits/dashes is not mixed-script', () => {
    // Before the fix: throws on `new URL('my-site123.com')` → true.
    expect(isMixedScriptUrl('my-site123.com')).toBe(false);
  });

  test('protocol-less single-script (all-Cyrillic incl. TLD) domain is not mixed-script', () => {
    // пример.рф is entirely Cyrillic — only the missing-protocol bug made it "mixed".
    expect(isMixedScriptUrl('пример.рф')).toBe(false);
  });

  test('Latin+Cyrillic (confusable) domain is mixed-script', () => {
    // Latin 'a','l','e' + Cyrillic 'рр' look-alikes — a real homograph-spoofing case.
    expect(isMixedScriptUrl('https://aррle.com')).toBe(true);
    expect(isMixedScriptUrl('aррle.com')).toBe(true);
  });

  test('truly unparseable input stays treated as mixed-script', () => {
    // Invalid even after a protocol is prepended → catch path returns true.
    expect(isMixedScriptUrl(':::')).toBe(true);
  });
});

import {describe, expect, test} from 'vitest';
import isSuspiciousUrl from '../helpers/string/isSuspiciousUrl';

// Reference: telegram-tt src/util/browser/url.ts (isMixedScriptUrl), which feeds the
// raw url through ensureProtocol() before `new URL(...)`. The tweb port dropped that
// step, so a protocol-less url makes `new URL(...)` throw and the catch wrongly
// classifies it as suspicious. These cases lock in the corrected behaviour.

describe('isSuspiciousUrl', () => {
  test('protocol-prefixed pure-Latin domain is not suspicious', () => {
    expect(isSuspiciousUrl('https://example.com')).toBe(false);
  });

  test('protocol-less pure-Latin domain is not suspicious', () => {
    // Before the fix: `new URL('example.com')` throws → catch returns true.
    expect(isSuspiciousUrl('example.com')).toBe(false);
  });

  test('protocol-less domain with digits/dashes is not suspicious', () => {
    // Before the fix: throws on `new URL('my-site123.com')` → true.
    expect(isSuspiciousUrl('my-site123.com')).toBe(false);
  });

  test('protocol-less single-script (all-Cyrillic incl. TLD) domain is not suspicious', () => {
    // пример.рф is entirely Cyrillic — only the missing-protocol bug made it "mixed".
    expect(isSuspiciousUrl('пример.рф')).toBe(false);
  });

  test('Latin+Cyrillic (confusable) domain is suspicious', () => {
    // Latin 'a','l','e' + Cyrillic 'рр' look-alikes — a real homograph-spoofing case.
    expect(isSuspiciousUrl('https://aррle.com')).toBe(true);
    expect(isSuspiciousUrl('aррle.com')).toBe(true);
  });

  test('truly unparseable input stays treated as suspicious', () => {
    // Invalid even after a protocol is prepended → catch path returns true.
    expect(isSuspiciousUrl(':::')).toBe(true);
  });

  // Two non-Latin scripts in one label: the plain latin/non-latin split saw no Latin at all
  // and let these through.

  test('Cyrillic label with an Armenian look-alike is suspicious', () => {
    // пօчта.рф — Cyrillic 'п','ч','т','а' + Armenian 'օ' (U+0585) posing as 'о'.
    expect(isSuspiciousUrl('пօчта.рф')).toBe(true);
    expect(isSuspiciousUrl('https://пօчта.рф/tracking')).toBe(true);
  });

  test('pure-Armenian domain under an Armenian TLD is not suspicious', () => {
    expect(isSuspiciousUrl('օրինակ.հայ')).toBe(false);
  });

  test('Cyrillic label with a Greek look-alike is suspicious', () => {
    // Greek 'ο' (U+03BF) inside an otherwise Cyrillic label.
    expect(isSuspiciousUrl('пοчта.рф')).toBe(true);
  });

  // Non-Latin domains under an ASCII TLD: the old whole-hostname check saw the Latin TLD
  // and alerted on perfectly ordinary domains.

  test('Japanese domain under a Latin TLD is not suspicious', () => {
    // Han + Hiragana is an allowed combination, and neither is confusable with Latin.
    expect(isSuspiciousUrl('例え.jp')).toBe(false);
    expect(isSuspiciousUrl('ゲーム.jp')).toBe(false); // 'ー' belongs to no script in particular
  });

  test('Korean/Arabic/Hebrew domains under a Latin TLD are not suspicious', () => {
    expect(isSuspiciousUrl('한국.com')).toBe(false);
    expect(isSuspiciousUrl('بيت.com')).toBe(false);
    expect(isSuspiciousUrl('עברית.com')).toBe(false);
  });

  test('Latin subdomain of a Cyrillic domain is not suspicious', () => {
    expect(isSuspiciousUrl('www.почта.рф')).toBe(false);
  });

  // Single-script labels that still spoof.

  test('whole-script Cyrillic homograph under a Latin TLD is suspicious', () => {
    // аррӏе.com — every letter is Cyrillic, so no label mixes scripts; the spoof is the
    // Cyrillic label sitting under a Latin TLD.
    expect(isSuspiciousUrl('аррӏе.com')).toBe(true);
  });

  test('label in a script no registry allows is suspicious', () => {
    // Cherokee syllabary posing as Latin capitals.
    expect(isSuspiciousUrl('ᏚᎢᎬᎪᎷ.com')).toBe(true);
  });

  test('accented Latin and IP hostnames are not suspicious', () => {
    expect(isSuspiciousUrl('bücher.de')).toBe(false);
    expect(isSuspiciousUrl('http://192.168.0.1:8080')).toBe(false);
  });

  test('a host-shaped login is suspicious', () => {
    // Everything before the `@` is userinfo — this opens evil.com.
    expect(isSuspiciousUrl('https://почта.рф@evil.com')).toBe(true);
    expect(isSuspiciousUrl('https://example.com:443@evil.com')).toBe(true);
    // An `@` in the path is not a login.
    expect(isSuspiciousUrl('https://example.com/@durov')).toBe(false);
  });

  test('already-punycoded hostname is decoded before checking', () => {
    expect(isSuspiciousUrl('https://xn--80ak6aa92e.com')).toBe(true); // аррӏе.com
    expect(isSuspiciousUrl('https://xn--e1afmkfd.xn--p1ai')).toBe(false); // пример.рф
  });
});

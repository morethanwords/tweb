/*
 * t.me/call/<slug> and tg://call?slug= forwarded whatever followed to
 * phone.getGroupCall. The slug is an opaque server token; the link handlers
 * accept only that alphabet and treat anything else as a dead link.
 */
import {describe, expect, it} from 'vitest';
import {CONFERENCE_CALL_SLUG_REGEXP} from '@lib/calls/constants';

describe('CONFERENCE_CALL_SLUG_REGEXP', () => {
  it('accepts the slugs the server mints', () => {
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('AbC123_-xyz')).toBe(true);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('a')).toBe(true);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('x'.repeat(64))).toBe(true);
  });

  it('rejects everything else', () => {
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('x'.repeat(65))).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('../call')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('slug?x=1')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('slug#1')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('a b')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('a\nb')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('слаг')).toBe(false);
    expect(CONFERENCE_CALL_SLUG_REGEXP.test('a/b')).toBe(false);
  });
});

import {describe, expect, test} from 'vitest';
import formatRelativeTime from '../helpers/date/formatRelativeTime';

const SECOND = 1000;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;

describe('formatRelativeTime', () => {
  describe('past times', () => {
    test('just now under 3s', () => {
      const r = formatRelativeTime(100, 102);
      expect(r.key).toBe('FormattedDate.JustNow');
    });

    test('seconds ago', () => {
      const r = formatRelativeTime(100, 130);
      expect(r.key).toBe('FormattedDate.SecondsAgo');
      expect(r.args).toEqual([30]);
      expect(r.updateInterval).toBe(SECOND);
    });

    test('minutes ago: next update at the next minute boundary', () => {
      // 5m10s in the past -> "5 minutes ago", flips to "6 minutes ago" in 50s
      const r = formatRelativeTime(0, 5 * MINUTE + 10);
      expect(r.key).toBe('FormattedDate.MinutesAgo');
      expect(r.args).toEqual([5]);
      expect(r.updateInterval).toBe(50 * SECOND);
    });

    test('minutes ago at an exact boundary: label valid for a full unit', () => {
      // exactly 5m in the past -> "5 minutes ago" stays valid for a full minute
      const r = formatRelativeTime(0, 5 * MINUTE);
      expect(r.key).toBe('FormattedDate.MinutesAgo');
      expect(r.args).toEqual([5]);
      expect(r.updateInterval).toBe(MINUTE * SECOND);
    });
  });

  describe('future times', () => {
    test('in seconds', () => {
      const r = formatRelativeTime(130, 100);
      expect(r.key).toBe('FormattedDate.InSeconds');
      expect(r.args).toEqual([30]);
    });

    test('in minutes: next update when the remaining whole-minutes drops', () => {
      // 5m10s in the future -> "in 5 minutes", flips to "in 4 minutes" in 10s
      const r = formatRelativeTime(5 * MINUTE + 10, 0);
      expect(r.key).toBe('FormattedDate.InMinutes');
      expect(r.args).toEqual([5]);
      expect(r.updateInterval).toBe(10 * SECOND);
    });

    test('in hours: next update when remaining whole-hours drops', () => {
      // 2h then 40 minutes in the future -> "in 2 hours", flips to "in 1 hour" in 40m
      const r = formatRelativeTime(2 * HOUR + 40 * MINUTE, 0);
      expect(r.key).toBe('FormattedDate.InHours');
      expect(r.args).toEqual([2]);
      expect(r.updateInterval).toBe(40 * MINUTE * SECOND);
    });

    // REGRESSION: at an exact future boundary the label must refresh almost
    // immediately (the very next second the displayed whole-unit count drops),
    // not after a whole extra unit.
    test('in minutes at an exact boundary: must refresh quickly, not after a full minute', () => {
      // exactly 5m in the future -> "in 5 minutes". One second later absDiff is
      // 4m59s -> "in 4 minutes", so the next update must come well before a minute.
      const r = formatRelativeTime(5 * MINUTE, 0);
      expect(r.key).toBe('FormattedDate.InMinutes');
      expect(r.args).toEqual([5]);
      expect(r.updateInterval).toBeLessThan(MINUTE * SECOND);
      expect(r.updateInterval).toBeGreaterThan(0);
    });

    test('in hours at an exact boundary: must refresh quickly, not after a full hour', () => {
      const r = formatRelativeTime(2 * HOUR, 0);
      expect(r.key).toBe('FormattedDate.InHours');
      expect(r.args).toEqual([2]);
      expect(r.updateInterval).toBeLessThan(HOUR * SECOND);
      expect(r.updateInterval).toBeGreaterThan(0);
    });

    test('in days at an exact boundary: must refresh quickly, not after a full day', () => {
      const r = formatRelativeTime(3 * DAY, 0);
      expect(r.key).toBe('FormattedDate.InDays');
      expect(r.args).toEqual([3]);
      expect(r.updateInterval).toBeLessThan(DAY * SECOND);
      expect(r.updateInterval).toBeGreaterThan(0);
    });
  });
});

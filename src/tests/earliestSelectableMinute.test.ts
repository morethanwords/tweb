import {describe, expect, test} from 'vitest';
import {earliestSelectableMinuteMs, MILLIS_IN_MINUTE} from '@helpers/date';

describe('earliestSelectableMinuteMs', () => {
  // timestamp (ms) for `m` minutes + `s` seconds since an arbitrary epoch
  const t = (m: number, s = 0) => (m * 60 + s) * 1000;

  test('rounds the current partial minute UP to the next one (the seconds bug)', () => {
    // minTimeDate floored to 16:12:00, real now 16:12:30 → 16:13:00
    expect(earliestSelectableMinuteMs(t(12, 0), t(12, 30))).toBe(t(13, 0));
  });

  test('an exact minute boundary stays on that minute', () => {
    expect(earliestSelectableMinuteMs(t(12, 0), t(12, 0))).toBe(t(12, 0));
  });

  test('never falls behind the clock when minTime is in the past', () => {
    // minTime 7 min ago, now mid-minute → next full minute from now
    expect(earliestSelectableMinuteMs(t(5, 0), t(12, 30))).toBe(t(13, 0));
  });

  test('honours a future lead time, rounded up', () => {
    // minTime = now + 10 min + 30 s → ceil → next full minute
    expect(earliestSelectableMinuteMs(t(22, 30), t(12, 30))).toBe(t(23, 0));
  });

  test('result is always minute-aligned and never before now', () => {
    const cases: [number, number][] = [
      [t(12, 0), t(12, 30)],
      [t(5, 0), t(12, 30)],
      [t(22, 30), t(12, 30)],
      [t(0, 1), t(0, 59)]
    ];
    for(const [minTime, now] of cases) {
      const result = earliestSelectableMinuteMs(minTime, now);
      expect(result % MILLIS_IN_MINUTE).toBe(0);
      expect(result).toBeGreaterThanOrEqual(now);
    }
  });
});

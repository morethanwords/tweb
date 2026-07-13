import {describe, expect, test} from 'vitest';
import isGiveawayUntilDateValid from '@helpers/giveaway/isGiveawayUntilDateValid';

describe('isGiveawayUntilDateValid', () => {
  const now = 1000;
  const periodMax = 604800; // 7 days

  test('default init (3 days from now) is valid', () => {
    expect(isGiveawayUntilDateValid(now + 3 * 86400, now, periodMax)).toBe(true);
  });

  test('a past date is invalid', () => {
    expect(isGiveawayUntilDateValid(999, now, periodMax)).toBe(false);
  });

  test('exactly now is invalid (must be strictly in the future)', () => {
    expect(isGiveawayUntilDateValid(now, now, periodMax)).toBe(false);
  });

  test('exactly at the max boundary is valid (inclusive)', () => {
    expect(isGiveawayUntilDateValid(now + periodMax, now, periodMax)).toBe(true);
  });

  test('one second past the max boundary is invalid', () => {
    expect(isGiveawayUntilDateValid(now + periodMax + 1, now, periodMax)).toBe(false);
  });
});

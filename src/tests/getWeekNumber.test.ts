import {getWeekNumber} from '@helpers/date';

// Reference ISO-8601 week numbers (https://en.wikipedia.org/wiki/ISO_week_date).
// Use noon to stay clear of any DST/timezone edge in the local-date constructor.
function d(s: string) {
  return new Date(s + 'T12:00:00');
}

describe('getWeekNumber', () => {
  test('returns the ISO week number, not a value scaled by 1000', () => {
    // 2017-01-02 is the Monday of ISO week 1 of 2017.
    expect(getWeekNumber(d('2017-01-02'))).toBe(1);
  });

  test('Sunday belongs to the previous ISO year week 52', () => {
    // 2017-01-01 is a Sunday → ISO week 52 of 2016.
    expect(getWeekNumber(d('2017-01-01'))).toBe(52);
  });

  test('mid-year week number', () => {
    // 2024-06-21 falls in ISO week 25 of 2024.
    expect(getWeekNumber(d('2024-06-21'))).toBe(25);
  });

  test('year-end day that rolls into next ISO year week 1', () => {
    // 2024-12-31 is a Tuesday → ISO week 1 of 2025.
    expect(getWeekNumber(d('2024-12-31'))).toBe(1);
  });

  test('first ISO week of 2021', () => {
    // 2021-01-04 is the Monday of ISO week 1 of 2021.
    expect(getWeekNumber(d('2021-01-04'))).toBe(1);
  });

  test('week number stays within the valid 1..53 range for every day of a year', () => {
    const start = d('2023-01-01');
    for(let i = 0; i < 365; ++i) {
      const date = new Date(start.getTime() + i * 86400000);
      const week = getWeekNumber(date);
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
    }
  });

  test('two days in the same ISO week share a week number', () => {
    // Monday and Sunday of the same ISO week.
    expect(getWeekNumber(d('2024-06-17'))).toBe(getWeekNumber(d('2024-06-23')));
  });
});

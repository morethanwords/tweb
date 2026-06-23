import {fillTipDates, DateData} from '@helpers/date';

describe('fillTipDates longDate separator consistency', () => {
  test('consistent separators (01.02.2020) produce a date tip', () => {
    const dates: DateData[] = [];
    fillTipDates('01.02.2020', dates);
    expect(dates.length).toBe(1);
  });

  test('mismatched separators (01.02/2020) are rejected', () => {
    const dates: DateData[] = [];
    fillTipDates('01.02/2020', dates);
    expect(dates.length).toBe(0);
  });

  test('mismatched separators (01/02-2020) are rejected', () => {
    const dates: DateData[] = [];
    fillTipDates('01/02-2020', dates);
    expect(dates.length).toBe(0);
  });
});

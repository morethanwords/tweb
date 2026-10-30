import {getMonths, getWeekDays} from '@helpers/date';

// A fresh formatter per call, so each one picks up the timezone the test sets.
vi.mock('@lib/langPack', () => ({
  default: {
    getDateTimeFormat: (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', options)
  }
}));

const ZONES = ['America/Los_Angeles', 'UTC', 'Asia/Tokyo'];

const tz = process.env.TZ;
afterEach(() => {
  process.env.TZ = tz;
});

describe('getWeekDays', () => {
  // The schedule it labels (OpeningHours.getDaysHours) starts on Monday whatever
  // the timezone, so the labels have to as well.
  test.each(ZONES)('starts on Monday in %s', (zone) => {
    process.env.TZ = zone;
    expect(getWeekDays()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  });
});

describe('getMonths', () => {
  // The birthday popup saves the month a name stands at here (index + 1), and the
  // chat names a month by its number from the same list.
  test.each(ZONES)('runs from January to December in %s', (zone) => {
    process.env.TZ = zone;
    expect(getMonths()).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]);
  });
});

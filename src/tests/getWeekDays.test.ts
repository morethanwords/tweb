import {getWeekDays} from '@helpers/date';

// A fresh formatter per call, so each one picks up the timezone the test sets.
vi.mock('@lib/langPack', () => ({
  default: {
    getDateTimeFormat: (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', options)
  }
}));

describe('getWeekDays', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  // The schedule it labels (OpeningHours.getDaysHours) starts on Monday whatever
  // the timezone, so the labels have to as well.
  test.each(['America/Los_Angeles', 'UTC', 'Asia/Tokyo'])('starts on Monday in %s', (zone) => {
    process.env.TZ = zone;
    expect(getWeekDays()).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  });
});

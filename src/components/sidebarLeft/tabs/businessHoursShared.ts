import {ONE_DAY_MINUTES} from '@helpers/date';
import OpeningHours from '@helpers/openingHours';
import {i18n} from '@lib/langPack';

/**
 * A single open interval of one weekday, in minutes from that day's midnight.
 * `end` may run past `ONE_DAY_MINUTES` for a day that closes after midnight.
 *
 * Structurally the same shape as `OpeningHours.Period`, so it feeds
 * `OpeningHours.isFull` / `fromDaysHours` directly.
 */
export type BusinessPeriod = {
  start: number,
  end: number
};

/** The whole schedule, Monday first — the shape `OpeningHours.getDaysHours` returns. */
export type BusinessDays = BusinessPeriod[][];

/** Android's `OpeningHoursDayActivity.is24()`: exactly one period covering the day. */
export function isFullDay(periods: readonly BusinessPeriod[]) {
  return periods.length === 1 && periods[0].start === 0 && periods[0].end === ONE_DAY_MINUTES - 1;
}

export function copyBusinessDays(days: BusinessDays): BusinessDays {
  return days.map((periods) => periods.map((period) => ({start: period.start, end: period.end})));
}

export function periodsEqual(a: readonly BusinessPeriod[], b: readonly BusinessPeriod[]) {
  return a.length === b.length && a.every((period, index) => (
    period.start === b[index].start && period.end === b[index].end
  ));
}

export function businessDaysEqual(a: BusinessDays, b: BusinessDays) {
  return a.length === b.length && a.every((periods, day) => periodsEqual(periods, b[day]));
}

/** `Closed` / `Open 24 hours` / `9:00 AM - 6:00 PM` — the day row's value. */
export function formatDayPeriods(periods: readonly BusinessPeriod[]) {
  if(!periods.length) {
    return i18n('BusinessHoursDayClosed');
  }

  if(OpeningHours.isFull(periods as BusinessPeriod[])) {
    return i18n('BusinessHoursDayFullOpened');
  }

  return periods.map((period) => new OpeningHours.Period(period.start, period.end).toString()).join(', ');
}

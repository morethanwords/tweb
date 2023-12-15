import {TChartData} from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DAYS_SHORT = WEEK_DAYS.map((month) => month.slice(0, 3));

export function statsFormatDayHour(value: number, data: TChartData) {
  return statsFormatDayHourFull(value, data);
}

let utcDiff: number;
export function statsFormatDayHourFull(value: number, data: TChartData) {
  if(utcDiff === undefined) {
    utcDiff = new Date().getTimezoneOffset() * 60e3;
  }

  return data.getLabelTime(86400e3 + +value * 3600e3 + utcDiff);
}

export function statsFormatDay(value: number, data: TChartData) {
  return data.getLabelDate(value, {isShort: true, displayYear: false});
}

export function statsFormatMin(value: number, data: TChartData) {
  return data.getLabelTime(value);
}

export function statsFormatText(value: number | string) {
  return '' + value;
}

export function getLabelDate(
  value: number,
  {
    isShort,
    isMonthShort = true,
    displayWeekDay,
    displayYear = true,
    displayHours
  }: {
    isShort?: boolean,
    isMonthShort?: boolean,
    displayWeekDay?: boolean,
    displayYear?: boolean,
    displayHours?: boolean
  } = {}
) {
  const date = new Date(value);
  const weekDaysArray = isShort ? WEEK_DAYS_SHORT : WEEK_DAYS;

  let string = `${date.getUTCDate()} ${(isMonthShort ? MONTHS_SHORT : MONTHS)[date.getUTCMonth()]}`;
  if(displayWeekDay) {
    string = `${weekDaysArray[date.getUTCDay()]}, ` + string;
  }
  if(displayYear) {
    string += ` ${date.getUTCFullYear()}`;
  }
  if(displayHours) {
    string += `, ${('0' + date.getUTCHours()).slice(-2)}:${('0' + date.getUTCMinutes()).slice(-2)}`
  }

  return string;
}

export function getLabelTime(value: number) {
  return new Date(value).toString().match(/(\d+:\d+):/)[1];
}

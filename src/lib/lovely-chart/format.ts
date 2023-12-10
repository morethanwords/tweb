import {MONTHS_SHORT, WEEK_DAYS, WEEK_DAYS_SHORT} from './constants';
import {StatisticsGraph} from './types';

export function statsFormatDayHour(labels: StatisticsGraph['labels'], data: StatisticsGraph) {
  return labels.map((value) => ({
    value,
    text: statsFormatDayHourFull(value, data)
  }));
}

let utcDiff: number;
export function statsFormatDayHourFull(value: number | string, data: StatisticsGraph) {
  if(utcDiff === undefined) {
    utcDiff = new Date().getTimezoneOffset() * 60e3;
  }

  return data.getLabelTime({value: 86400e3 + +value * 3600e3 + utcDiff, text: ''});
}

export function statsFormatDay(labels: StatisticsGraph['labels'], data: StatisticsGraph) {
  return labels.map((value) => {
    return {
      value,
      text: data.getLabelDate({value, text: ''}, {isShort: true, displayYear: false})
    };
  });
}

export function statsFormatMin(labels: StatisticsGraph['labels'], data: StatisticsGraph) {
  return labels.map((value) => ({
    value,
    text: data.getLabelTime({value, text: ''})
  }));
}

export function statsFormatText(labels: StatisticsGraph['labels']) {
  return labels.map((value, i) => ({
    value: i,
    text: value
  }));
}

export function humanize(value: number, decimals = 1) {
  if(value >= 1e9) {
    return keepThreeDigits(value / 1e9, decimals) + 'B';
  } else if(value >= 1e6) {
    return keepThreeDigits(value / 1e6, decimals) + 'M';
  } else if(value >= 1e3) {
    return keepThreeDigits(value / 1e3, decimals) + 'K';
  }

  return value;
}

// TODO perf
function keepThreeDigits(value: number, decimals: number) {
  return value
  .toFixed(decimals)
  .replace(/(\d{3,})\.\d+/, '$1')
  .replace(/\.0+$/, '');
}

export function formatInteger(n: number | string) {
  return String(n).replace(/\d(?=(\d{3})+$)/g, '$& ');
}

export function getLabelDate(
  label: StatisticsGraph['xLabels'][0],
  {
    isShort,
    displayWeekDay,
    displayYear = true,
    displayHours
  }: {
    isShort?: boolean,
    displayWeekDay?: boolean,
    displayYear?: boolean,
    displayHours?: boolean
  } = {}
) {
  const {value} = label;
  const date = new Date(value);
  const weekDaysArray = isShort ? WEEK_DAYS_SHORT : WEEK_DAYS;

  let string = `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
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

export function getLabelTime(label: StatisticsGraph['xLabels'][0]) {
  return new Date(label.value).toString().match(/(\d+:\d+):/)[1];
}

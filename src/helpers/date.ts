/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import I18n, {i18n} from '../lib/langPack';
import {days, months} from './date/common';
import capitalizeFirstLetter from './string/capitalizeFirstLetter';

export const monthsLocalized = months.slice();
export const daysLocalized = days.slice();

export const ONE_DAY = 86400;
export const ONE_DAY_MINUTES = 1440;
export const ONE_WEEK = 604800;
export const ONE_WEEK_MINUTES = 10080;

export function getWeekDays() {
  const dateTimeFormat = I18n.getDateTimeFormat({weekday: 'long'});
  const date = new Date(Date.UTC(2017, 0, 2));
  const out: string[] = [];
  for(let i = 0; i < 7; ++i) {
    out.push(capitalizeFirstLetter(dateTimeFormat.format(date)));
    date.setDate(date.getDate() + 1);
  }
  return out;
}

export function getMonths() {
  const dateTimeFormat = I18n.getDateTimeFormat({month: 'long'});
  const date = new Date(Date.UTC(2017, 0, 1));
  const out: string[] = [];
  for(let i = 0; i < 12; ++i) {
    out.push(capitalizeFirstLetter(dateTimeFormat.format(date)));
    date.setMonth(date.getMonth() + 1);
  }
  return out;
}

export function fillLocalizedDates() {
  monthsLocalized.splice(0, monthsLocalized.length, ...getMonths());
  daysLocalized.splice(0, daysLocalized.length, ...getWeekDays());
}

// https://stackoverflow.com/a/6117889
export const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / ONE_DAY) + 1) / 7);
};

export function formatDate(date: Date, today?: Date) {
  if(!today) {
    today = new Date();
    today.setHours(0, 0, 0, 0);
  }

  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long'
  };

  if(date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }

  return new I18n.IntlDateElement({
    date,
    options
  }).element;
}

export function formatDateAccordingToTodayNew(time: Date) {
  const today = new Date();
  const now = today.getTime() / 1000 | 0;
  const timestamp = time.getTime() / 1000 | 0;

  const options: Intl.DateTimeFormatOptions = {};
  if((now - timestamp) < ONE_DAY && today.getDate() === time.getDate()) { // if the same day
    options.hour = options.minute = '2-digit';
  } else if(today.getFullYear() !== time.getFullYear()) { // different year
    options.year = options.day = 'numeric';
    options.month = '2-digit';
  } else if((now - timestamp) < (ONE_DAY * 7) && getWeekNumber(today) === getWeekNumber(time)) { // current week
    options.weekday = 'short';
  } else { // same year
    options.month = 'short';
    options.day = 'numeric';
  }

  return new I18n.IntlDateElement({
    date: time,
    options
  }).element;
}

const formatTimeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit'
};

export function formatFullSentTimeRaw(timestamp: number, options: {
  capitalize?: boolean
  noToday?: boolean,
  combined?: boolean
} = {}) {
  if(options.combined) {
    options.noToday = true;
  }

  const date = new Date();
  const time = new Date(timestamp * 1000);
  const now = date.getTime() / 1000 | 0;
  const diff = now - timestamp;

  const timeEl = options.combined ? undefined : formatTime(time);

  let dateEl: HTMLElement;
  if(!options.noToday && diff < ONE_DAY && date.getDate() === time.getDate()) { // if the same day
    dateEl = i18n(options.capitalize ? 'Date.Today' : 'Peer.Status.Today');
  } else if(!options.noToday && diff > 0 && diff < (ONE_DAY * 2) && new Date(date.getTime() - ONE_DAY * 1000).getDate() === time.getDate()) { // yesterday
    dateEl = i18n(options.capitalize ? 'Yesterday' : 'Peer.Status.Yesterday');

    if(options.capitalize) {
      dateEl.style.textTransform = 'capitalize';
    }
  } else if(date.getFullYear() !== time.getFullYear()) { // different year
    dateEl = new I18n.IntlDateElement({
      date: time,
      options: {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(options.combined ? formatTimeOptions: {})
      }
    }).element;
    // dateStr = months[time.getMonth()].slice(0, 3) + ' ' + time.getDate() + ', ' + time.getFullYear();
  } else {
    dateEl = new I18n.IntlDateElement({
      date: time,
      options: {
        month: 'short',
        day: 'numeric',
        ...(options.combined ? formatTimeOptions: {})
      }
    }).element;
    // dateStr = months[time.getMonth()].slice(0, 3) + ' ' + time.getDate();
  }

  return {dateEl, timeEl};
}

export function formatFullSentTime(timestamp: number, capitalize = true, noToday = false) {
  const {dateEl, timeEl} = formatFullSentTimeRaw(timestamp, {
    capitalize,
    noToday
  });

  const fragment = document.createDocumentFragment();
  fragment.append(dateEl, ' ', i18n('ScheduleController.at'), ' ', timeEl);
  return fragment;
}

export function formatTime(date: Date) {
  return new I18n.IntlDateElement({
    date,
    options: formatTimeOptions
  }).element;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.formatDateAccordingToTodayNew = formatDateAccordingToTodayNew);

export function formatMonthsDuration(months: number, bold?: boolean) {
  const isYears = months >= 12 && !(months % 12);
  return i18n(
    bold ? (isYears ? 'BoldYears' : 'BoldMonths') : (isYears ? 'Years' : 'Months'),
    [isYears ? months / 12 : months]
  );
}

// https://github.com/DrKLO/Telegram/blob/d52b2c921abd3c1e8d6368858313ad0cb0468c07/TMessagesProj/src/main/java/org/telegram/ui/Adapters/FiltersView.java
const minYear = 2013;
const yearPattern = new RegExp('20[0-9]{1,2}');
const anyLetterRegExp = `\\p{L}`;
const monthPattern = new RegExp(`(${anyLetterRegExp}{3,})`, 'iu');
const monthYearOrDayPattern = new RegExp(`(${anyLetterRegExp}{3,}) ([0-9]{0,4})`, 'iu');
const yearOrDayAndMonthPattern = new RegExp(`([0-9]{0,4}) (${anyLetterRegExp}{2,})`, 'iu');
const shortDate = new RegExp('^([0-9]{1,4})(\\.| |/|\\-)([0-9]{1,4})$', 'i');
const longDate = new RegExp('^([0-9]{1,2})(\\.| |/|\\-)([0-9]{1,2})(\\.| |/|\\-)([0-9]{1,4})$', 'i');
const numberOfDaysEachMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export type DateData = {
  title: string,
  minDate: number,
  maxDate: number,
};
export function fillTipDates(query: string, dates: DateData[]) {
  const q = query.trim().toLowerCase();

  if(q.length < 3) {
    return;
  }

  if(['today', I18n.format('Peer.Status.Today', true)].some((haystack) => haystack.indexOf(q) === 0)) {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    date.setFullYear(year, month, day);
    date.setHours(0, 0, 0);

    const minDate = date.getTime();
    date.setFullYear(year, month, day + 1);
    date.setHours(0, 0, 0);

    const maxDate = date.getTime() - 1;
    dates.push({
      title: I18n.format('Date.Today', true),
      minDate,
      maxDate
    });
    return;
  }

  if(['yesterday', I18n.format('Peer.Status.Yesterday', true)].some((haystack) => haystack.indexOf(q) === 0)) {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    date.setFullYear(year, month, day);
    date.setHours(0, 0, 0);

    const minDate = date.getTime() - 86400000;
    date.setFullYear(year, month, day + 1);
    date.setHours(0, 0, 0);

    const maxDate = date.getTime() - 86400001;
    dates.push({
      title: capitalizeFirstLetter(I18n.format('Yesterday', true)),
      minDate,
      maxDate
    });
    return;
  }

  const dayOfWeek = getDayOfWeek(q);
  if(dayOfWeek >= 0) {
    const date = new Date();
    const now = date.getTime();
    const currentDay = date.getDay();
    const distance = dayOfWeek - currentDay;
    date.setDate(date.getDate() + distance);
    if(date.getTime() > now) {
      date.setTime(date.getTime() - 604800000);
    }
    const year = date.getFullYear()
    const month = date.getMonth();
    const day = date.getDate();
    date.setFullYear(year, month, day);
    date.setHours(0, 0, 0);

    const minDate = date.getTime();
    date.setFullYear(year, month, day + 1);
    date.setHours(0, 0, 0);

    const maxDate = date.getTime() - 1;
    dates.push({
      title: formatWeekLong(minDate),
      minDate,
      maxDate
    });
    return;
  }

  let matches: any[];
  if((matches = shortDate.exec(q)) !== null) {
    const g1 = matches[1];
    const g2 = matches[3];
    const k = parseInt(g1);
    const k1 = parseInt(g2);
    if(k > 0 && k <= 31) {
      if(k1 >= minYear && k <= 12) {
        const selectedYear = k1;
        const month = k - 1;
        createForMonthYear(dates, month, selectedYear);
        return;
      } else if(k1 <= 12) {
        const day = k - 1;
        const month = k1 - 1;
        createForDayMonth(dates, day, month);
      }
    } else if(k >= minYear && k1 <= 12) {
      const selectedYear = k;
      const month = k1 - 1;
      createForMonthYear(dates, month, selectedYear);
    }

    return;
  }

  if((matches = longDate.exec(q)) !== null) {
    const g1 = matches[1];
    const g2 = matches[3];
    const g3 = matches[5];
    if(!matches[2] === matches[4]) {
      return;
    }

    const day = parseInt(g1);
    const month = parseInt(g2) - 1;
    let year = parseInt(g3);
    if(year >= 10 && year <= 99) {
      year += 2000;
    }

    const currentYear = new Date().getFullYear();
    if(validDateForMonth(day - 1, month) && year >= minYear && year <= currentYear) {
      const date = new Date();
      date.setFullYear(year, month, day);
      date.setHours(0, 0, 0);

      const minDate = date.getTime();
      date.setFullYear(year, month, day + 1);
      date.setHours(0, 0, 0);

      const maxDate = date.getTime() - 1;
      dates.push({
        title: formatterYearMax(minDate),
        minDate,
        maxDate
      });
      return;
    }

    return;
  }

  if((matches = monthYearOrDayPattern.exec(q)) !== null) {
    const g1 = matches[1];
    const g2 = matches[2];
    const month = getMonth(g1);
    if(month >= 0) {
      const k = +g2 || new Date().getUTCFullYear();
      if(k > 0 && k <= 31) {
        const day = k - 1;
        createForDayMonth(dates, day, month);
        return;
      } else if(k >= minYear) {
        const selectedYear = k;
        createForMonthYear(dates, month, selectedYear);
        return;
      }
    }
  }

  if((matches = yearOrDayAndMonthPattern.exec(q)) !== null) {
    const g1 = matches[1];
    const g2 = matches[2];
    const month = getMonth(g2);
    if(month >= 0) {
      const k = +g1;
      if(k > 0 && k <= 31) {
        const day = k - 1;
        createForDayMonth(dates, day, month);
        return;
      } else if(k >= minYear) {
        const selectedYear = k;
        createForMonthYear(dates, month, selectedYear);
      }
    }
  }

  if((matches = monthPattern.exec(q)) !== null) {
    const g1 = matches[1];
    const month = getMonth(g1);
    if(month >= 0) {
      const currentYear = new Date().getFullYear();
      for(let i = currentYear; i >= minYear; --i) {
        createForMonthYear(dates, month, i);
      }
    }
  }

  if((matches = yearPattern.exec(q)) !== null) {
    let selectedYear = +matches[0];
    const currentYear = new Date().getFullYear();
    if(selectedYear < minYear) {
      selectedYear = minYear;
      for(let i = currentYear; i >= selectedYear; i--) {
        const date = new Date();
        date.setFullYear(i, 0, 1);
        date.setHours(0, 0, 0);

        const minDate = date.getTime();
        date.setFullYear(i + 1, 0, 1);
        date.setHours(0, 0, 0);

        const maxDate = date.getTime() - 1;
        dates.push({
          title: '' + i,
          minDate,
          maxDate
        });
      }
    } else if(selectedYear <= currentYear) {
      const date = new Date();
      date.setFullYear(selectedYear, 0, 1);
      date.setHours(0, 0, 0);

      const minDate = date.getTime();
      date.setFullYear(selectedYear + 1, 0, 1);
      date.setHours(0, 0, 0);

      const maxDate = date.getTime() - 1;
      dates.push({
        title: '' + selectedYear,
        minDate,
        maxDate
      });
    }

    return;
  }
}

function createForMonthYear(dates: DateData[], month: number, selectedYear: number) {
  const currentYear = new Date().getFullYear();
  const today = Date.now();
  if(selectedYear >= minYear && selectedYear <= currentYear) {
    const date = new Date();
    date.setFullYear(selectedYear, month, 1);
    date.setHours(0, 0, 0);
    const minDate = date.getTime();
    if(minDate > today) {
      return;
    }
    date.setMonth(date.getMonth() + 1);
    const maxDate = date.getTime() - 1;

    dates.push({
      title: formatterMonthYear(minDate),
      minDate,
      maxDate
    });
  }
}

function createForDayMonth(dates: DateData[], day: number, month: number) {
  if(validDateForMonth(day, month)) {
    const currentYear = new Date().getFullYear();
    const today = Date.now();

    for(let i = currentYear; i >= minYear; i--) {
      if(month === 1 && day === 28 && !isLeapYear(i)) {
        continue;
      }

      const date = new Date();
      date.setFullYear(i, month, day + 1);
      date.setHours(0, 0, 0);

      const minDate = date.getTime();
      if(minDate > today) {
        continue;
      }

      date.setFullYear(i, month, day + 2);
      date.setHours(0, 0, 0);
      const maxDate = date.getTime() - 1;
      if(i === currentYear) {
        dates.push({
          title: formatterDayMonth(minDate),
          minDate,
          maxDate
        });
      } else {
        dates.push({
          title: formatterYearMax(minDate),
          minDate,
          maxDate
        });
      }
    }
  }
}

function formatterMonthYear(timestamp: number) {
  const date = new Date(timestamp);
  return monthsLocalized[date.getMonth()]/* .slice(0, 3) */ + ' ' + date.getFullYear();
}

function formatterDayMonth(timestamp: number) {
  const date = new Date(timestamp);
  return monthsLocalized[date.getMonth()]/* .slice(0, 3) */ + ' ' + date.getDate();
}

function formatterYearMax(timestamp: number) {
  const date = new Date(timestamp);
  return ('0' + date.getDate()).slice(-2) + '.' + ('0' + (date.getMonth() + 1)).slice(-2) + '.' + date.getFullYear();
}

function formatWeekLong(timestamp: number) {
  const date = new Date(timestamp);
  return daysLocalized[date.getDay()];
}

function validDateForMonth(day: number, month: number) {
  if(month >= 0 && month < 12) {
    if(day >= 0 && day < numberOfDaysEachMonth[month]) {
      return true;
    }
  }
  return false;
}

function isLeapYear(year: number) {
  return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

function getMonth(q: string) {
  q = q.toLowerCase();
  for(let i = 0; i < 12; i++) {
    if([months[i], monthsLocalized[i]].some((month) => month.toLowerCase().indexOf(q) === 0)) {
      return i;
    }
  }
  return -1;
}

function getDayOfWeek(q: string) {
  const c = new Date();
  if(q.length <= 3) {
    return -1;
  }

  for(let i = 0; i < 7; i++) {
    c.setDate(c.getDate() + 1);

    if(formatWeekLong(c.getTime()).toLowerCase().indexOf(q) === 0) {
      return c.getDay();
    }
  }
  return -1;
}

MOUNT_CLASS_TO.fillTipDates = fillTipDates;

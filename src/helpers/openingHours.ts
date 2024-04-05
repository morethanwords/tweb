import {BusinessWeeklyOpen, BusinessWorkHours} from '../layer';
import I18n from '../lib/langPack';
import {ONE_DAY_MINUTES, ONE_WEEK_MINUTES, formatTime} from './date';
import copy from './object/copy';

class Period {
  // from 0 to 2 * 24 * 60
  constructor(public start: number, public end: number) {
  }

  public toString() {
    return Period.timeToString(this.start) + ' - ' + Period.timeToString(this.end);
  }

  public static timeToString(time: number, includeNextDay = true) {
    const min = time % 60;
    const hours = (time - min) / 60 % 24;
    const rightNow = new Date();
    rightNow.setHours(hours, min);
    const str = formatTime(rightNow).textContent;
    if(time > ONE_DAY_MINUTES && includeNextDay) {
      return I18n.format('BusinessHoursNextDay', true, [str]);
    }
    return str;
  }
}

export default class OpeningHours {
  static Period = Period;

  // https://github.com/DrKLO/Telegram/blob/a906f12aaec2768969c77650a7e4b377baa6cf2a/TMessagesProj/src/main/java/org/telegram/ui/Business/OpeningHoursActivity.java#L201
  static adaptWeeklyOpen(hours: BusinessWeeklyOpen[], utcOffset: number) {
    const array: BusinessWeeklyOpen[] = copy(hours);

    const array2: BusinessWeeklyOpen[] = new Array();
    for(let i = 0; i < array.length; ++i) {
      const weekly = array[i];
      let newWeekly: BusinessWeeklyOpen = {...weekly};

      if(utcOffset !== 0) {
        const start = weekly.start_minute % ONE_DAY_MINUTES;
        const end = start + (weekly.end_minute - weekly.start_minute);
        if(start === 0 && (end === ONE_DAY_MINUTES || end === (ONE_DAY_MINUTES - 1))) {
          newWeekly.start_minute = weekly.start_minute;
          newWeekly.end_minute = weekly.end_minute;
          array2.push(newWeekly);
          continue;
        }
      }

      newWeekly.start_minute = weekly.start_minute + utcOffset;
      newWeekly.end_minute = weekly.end_minute + utcOffset;
      array2.push(newWeekly);

      if(newWeekly.start_minute < 0) {
        if(newWeekly.end_minute < 0) {
          newWeekly.start_minute += ONE_WEEK_MINUTES;
          newWeekly.end_minute += ONE_WEEK_MINUTES;
        } else {
          newWeekly.start_minute = 0;

          newWeekly = {...weekly};
          newWeekly.start_minute = ONE_WEEK_MINUTES + weekly.start_minute + utcOffset;
          newWeekly.end_minute = (ONE_WEEK_MINUTES - 1);
          array2.push(newWeekly);
        }
      } else if(newWeekly.end_minute > ONE_WEEK_MINUTES) {
        if(newWeekly.start_minute > ONE_WEEK_MINUTES) {
          newWeekly.start_minute -= ONE_WEEK_MINUTES;
          newWeekly.end_minute -= ONE_WEEK_MINUTES;
        }/*  else {
          newWeekly.end_minute = ONE_WEEK_MINUTES - 1;

          newWeekly = {...weekly};
          newWeekly.start_minute = 0;
          newWeekly.end_minute = weekly.end_minute + utcOffset - (ONE_WEEK_MINUTES - 1);
          array2.push(newWeekly);
        } */
      }
    }

    array2.sort((a, b) => a.start_minute - b.start_minute);
    return array2;
  }

  /**
   * @returns periods starting from Monday
   */
  static getDaysHours(hours: BusinessWeeklyOpen[]) {
    const days: Period[][] = new Array(7);
    for(let i = 0; i < days.length; ++i) {
      days[i] = [];
    }
    for(let i = 0; i < hours.length; ++i) {
      const period = hours[i];
      const day = Math.floor((period.start_minute / ONE_DAY_MINUTES) % 7);
      const start = period.start_minute % ONE_DAY_MINUTES;
      const end = start + (period.end_minute - period.start_minute);
      days[day].push(new Period(start, end));
    }
    for(let i = 0; i < 7; ++i) {
      const start = ONE_DAY_MINUTES * i;
      const end = ONE_DAY_MINUTES * (i + 1);

      let m = start;
      for(let j = 0; j < hours.length; ++j) {
        const period = hours[j];
        if(period.start_minute <= m && period.end_minute >= m) {
          m = period.end_minute + 1;
        }
      }

      const isFull = m >= end;
      if(isFull) {
        const prevDay = (7 + i - 1) % 7;
        if(days[prevDay].length && days[prevDay][days[prevDay].length - 1].end >= ONE_DAY_MINUTES) {
          days[prevDay][days[prevDay].length - 1].end = ONE_DAY_MINUTES - 1;
        }
        days[i].length = 0;
        days[i].push(new Period(0, ONE_DAY_MINUTES - 1));
      } else {
        const nextDay = (i + 1) % 7;
        if(days[i].length && days[nextDay].length) {
          const todayLast = days[i][days[i].length - 1];
          const tomorrowFirst = days[nextDay][0];
          if(todayLast.end > ONE_DAY_MINUTES && todayLast.end - ONE_DAY_MINUTES + 1 === tomorrowFirst.start) {
            todayLast.end = ONE_DAY_MINUTES - 1;
            tomorrowFirst.start = 0;
          }
        }
      }
    }
    return days;
  }

  static is24x7(hours: BusinessWorkHours) {
    if(!hours || !hours.weekly_open.length) return false;
    let last = 0;
    for(let i = 0; i < hours.weekly_open.length; ++i) {
      const period = hours.weekly_open[i];
      if(period.start_minute > last + 1) return false;
      last = period.end_minute;
    }
    return last >= ONE_WEEK_MINUTES - 1;
  }

  static isOpenNow(adapted_weekly_open: BusinessWeeklyOpen[]) {
    const date = new Date();

    const nowWeekday = (7 + date.getDay() - 1) % 7;
    const nowHours = date.getHours();
    const nowMinutes = date.getMinutes();

    let openNow = false;
    const nowPeriodTime = nowMinutes + nowHours * 60 + nowWeekday * ONE_DAY_MINUTES;
    for(let i = 0; i < adapted_weekly_open.length; ++i) {
      const weeklyPeriod = adapted_weekly_open[i];
      if(
        nowPeriodTime >= weeklyPeriod.start_minute && nowPeriodTime <= weeklyPeriod.end_minute ||
        (nowPeriodTime + ONE_WEEK_MINUTES) >= weeklyPeriod.start_minute && (nowPeriodTime + ONE_WEEK_MINUTES) <= weeklyPeriod.end_minute ||
        (nowPeriodTime - ONE_WEEK_MINUTES) >= weeklyPeriod.start_minute && (nowPeriodTime - ONE_WEEK_MINUTES) <= weeklyPeriod.end_minute
      ) {
        openNow = true;
        break;
      }
    }

    return {openNow, nowWeekday, nowHours, nowPeriodTime};
  }

  static isFull(periods: Period[]) {
    if(!periods || !periods.length) return false;
    let lastTime = 0;
    for(let i = 0; i < periods.length; ++i) {
      const p = periods[i];
      if(lastTime < p.start) {
        return false;
      }
      lastTime = p.end;
    }
    return lastTime === (ONE_DAY_MINUTES - 1) || lastTime === ONE_DAY_MINUTES;
  }
}

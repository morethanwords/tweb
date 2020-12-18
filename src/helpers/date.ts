export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ONE_DAY = 86400;

// https://stackoverflow.com/a/6117889
export const getWeekNumber = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / ONE_DAY) + 1) / 7);
};

export const formatDateAccordingToToday = (time: Date) => {
  const date = new Date();
  const now = date.getTime() / 1000 | 0;
  const timestamp = time.getTime() / 1000 | 0;

  let timeStr: string;
  if((now - timestamp) < ONE_DAY && date.getDate() == time.getDate()) { // if the same day
    timeStr = ('0' + time.getHours()).slice(-2) + ':' + ('0' + time.getMinutes()).slice(-2);
  } else if(date.getFullYear() != time.getFullYear()) { // different year
    timeStr = time.getDate() + '.' + ('0' + (time.getMonth() + 1)).slice(-2) + '.' + ('' + time.getFullYear()).slice(-2);
  } else if((now - timestamp) < (ONE_DAY * 7) && getWeekNumber(date) == getWeekNumber(time)) { // current week
    timeStr = days[time.getDay()].slice(0, 3);
  } else { // same year
    timeStr = months[time.getMonth()].slice(0, 3) + ' ' + ('0' + time.getDate()).slice(-2);
  }

  return timeStr;
};

export const getFullDate = (date: Date, options: Partial<{
  noTime: true, 
  noSeconds: true,
  monthAsNumber: true,
  leadingZero: true
}> = {}) => {
  const joiner = options.monthAsNumber ? '.' : ' ';
  const time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2) + (options.noSeconds ? '' : ':' + ('0' + date.getSeconds()).slice(-2));

  return (options.leadingZero ? ('0' + date.getDate()).slice(-2) : date.getDate()) + 
    joiner + (options.monthAsNumber ? ('0' + (date.getMonth() + 1)).slice(-2) : months[date.getMonth()]) + 
    joiner + date.getFullYear() + 
    (options.noTime ? '' : ', ' + time);
};

export function tsNow(seconds?: true) {
  const t = Date.now();
  return seconds ? Math.floor(t / 1000) : t;
}
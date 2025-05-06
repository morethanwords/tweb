import {months} from './common';

export const getFullDate = (date: Date, options: Partial<{
  noTime: boolean,
  noSeconds: boolean,
  monthAsNumber: boolean,
  leadingZero: boolean,
  shortYear: boolean,
  timeJoiner: string
}> = {}) => {
  const joiner = options.monthAsNumber ? '.' : ' ';
  const time = ('0' + date.getHours()).slice(-2) + ':' +
    ('0' + date.getMinutes()).slice(-2) +
    (options.noSeconds ? '' : ':' + ('0' + date.getSeconds()).slice(-2));
  const fullYear = date.getFullYear();

  return (options.leadingZero ? ('0' + date.getDate()).slice(-2) : date.getDate()) +
    joiner + (options.monthAsNumber ? ('0' + (date.getMonth() + 1)).slice(-2) : months[date.getMonth()]) +
    joiner + (('' + fullYear).slice(options.shortYear ? 2 : 0)) +
    (options.noTime ? '' : (options.timeJoiner || ', ') + time);
};

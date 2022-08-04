/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import eachTimeout from './eachTimeout';

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachMinute(callback: () => any, runFirst = true) {
  return eachTimeout(callback, () => (60 - new Date().getSeconds()) * 1000, runFirst);
}

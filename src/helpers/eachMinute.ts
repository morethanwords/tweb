/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import eachTimeout from '@helpers/eachTimeout';

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachMinute(callback: () => any, runFirst?: boolean) {
  return eachTimeout(callback, () => (60 - new Date().getSeconds()) * 1000, runFirst);
}

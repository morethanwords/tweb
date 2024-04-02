/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import eachTimeout from './eachTimeout';

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachSecond(callback: () => any, runFirst?: boolean) {
  return eachTimeout(callback, () => 1000 - new Date().getMilliseconds(), runFirst);
}

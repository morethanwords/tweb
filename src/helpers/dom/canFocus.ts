/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_MOBILE_SAFARI} from '../../environment/userAgent';

export function canFocus(isFirstInput: boolean) {
  return !IS_MOBILE_SAFARI || !isFirstInput;
}

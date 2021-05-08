/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { isMobileSafari } from "../userAgent";

export function canFocus(isFirstInput: boolean) {
  return !isMobileSafari || !isFirstInput;
}

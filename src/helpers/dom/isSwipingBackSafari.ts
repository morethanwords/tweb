/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {IS_MOBILE_SAFARI} from '../../environment/userAgent';

export default function isSwipingBackSafari(e: TouchEvent | MouseEvent) {
  return IS_MOBILE_SAFARI && e instanceof TouchEvent && e.touches[0].clientX < 30;
}

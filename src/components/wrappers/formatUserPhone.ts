/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatPhoneNumber} from '../../helpers/formatPhoneNumber';

export default function formatUserPhone(phone: string) {
  return '+' + formatPhoneNumber(phone).formatted;
}

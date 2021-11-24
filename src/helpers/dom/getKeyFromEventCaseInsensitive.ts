/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getKeyFromEvent from "./getKeyFromEvent";
import { capitalizeFirstLetter } from "../string";

export default function getKeyFromEventCaseInsensitive(e: KeyboardEvent) {
  return capitalizeFirstLetter(getKeyFromEvent(e));
}

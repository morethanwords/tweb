/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Dialog } from "../../appMessagesManager";
import type getDialogIndexKey from "./getDialogIndexKey";

export default function setDialogIndex(
  dialog: Dialog, 
  indexKey: ReturnType<typeof getDialogIndexKey>,
  index: number
) {
  return dialog[indexKey] = index;
}

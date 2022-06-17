/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { Dialog } from "../../../../layer";
import getDialogIndexKey from "./getDialogIndexKey";

export default function getDialogIndex(
  dialog: Dialog.dialog, 
  indexKey: ReturnType<typeof getDialogIndexKey> = getDialogIndexKey(dialog.folder_id)
) {
  return dialog && dialog[indexKey];
}

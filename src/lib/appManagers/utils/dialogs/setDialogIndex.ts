/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AnyDialog} from '@lib/storages/dialogs';
import type {Dialog} from '@appManagers/appMessagesManager';
import type getDialogIndexKey from '@appManagers/utils/dialogs/getDialogIndexKey';

export default function setDialogIndex(
  dialog: AnyDialog,
  indexKey: ReturnType<typeof getDialogIndexKey>,
  index: number
) {
  return (dialog as Dialog)[indexKey] = index;
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Dialog, ForumTopic, SavedDialog} from '../../../../layer';
import type {REAL_FOLDER_ID} from '../../constants';
import type {MonoforumDialog} from '../../../storages/monoforumDialogs';
import getDialogIndexKey from './getDialogIndexKey';

export default function getDialogIndex(
  dialog: Dialog.dialog | ForumTopic.forumTopic | SavedDialog.savedDialog | MonoforumDialog,
  indexKey = getDialogIndexKey((dialog as Dialog)?.folder_id as REAL_FOLDER_ID)
) {
  return dialog?.[indexKey as 'index_0'];
}

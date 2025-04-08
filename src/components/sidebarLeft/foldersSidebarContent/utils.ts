
import {FOLDER_ID_ALL} from '../../../lib/mtproto/mtproto_config';
import type {AppManagers} from '../../../lib/appManagers/managers';
import {MyDialogFilter} from '../../../lib/storages/filters';
import {DialogFilter} from '../../../layer';
import assumeType from '../../../helpers/assumeType';

import {FolderItemPayload} from './types';

export async function getNotificationCountForFilter(filterId: number, managers: AppManagers) {
  const {unreadUnmutedCount, unreadCount} = await managers.dialogsStorage.getFolderUnreadCount(filterId);

  return {
    count: filterId === FOLDER_ID_ALL ? unreadUnmutedCount : unreadCount,
    muted: !unreadUnmutedCount && !!unreadCount
  };
}

export function getIconForFilter(filter: MyDialogFilter): Icon {
  if(filter.id === FOLDER_ID_ALL) return 'round_chats_filled';
  const matchedIcons: Icon[] = [];

  assumeType<DialogFilter.dialogFilter>(filter);
  if(filter.pFlags.contacts) matchedIcons.push('person');
  if(filter.pFlags.bots) matchedIcons.push('bot_filled');
  if(filter.pFlags.broadcasts) matchedIcons.push('channel_filled');
  if(filter.pFlags.groups) matchedIcons.push('group_filled');
  if(filter.pFlags.non_contacts) matchedIcons.push('noncontacts');

  if(matchedIcons.length === 1) return matchedIcons[0];
  return 'limit_folders';
}

export async function getFolderItemsInOrder(folderItems: FolderItemPayload[], managers: AppManagers) {
  const filters = new Map<number, MyDialogFilter>();

  const filtersPromises = folderItems
  .filter((item) => item.id)
  .map((item) => managers.filtersStorage.getFilter(item.id));
  const filtersArr = await Promise.all(filtersPromises);
  for(const filter of filtersArr) {
    filters.set(filter.id, filter);
  }

  return folderItems.sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return filters.get(a.id)?.localId - filters.get(b.id)?.localId;
  });
}


import {FOLDER_ID_ALL} from '@appManagers/constants';
import type {AppManagers} from '@lib/managers';
import {MyDialogFilter} from '@lib/storages/filters';
import {DialogFilter} from '@layer';
import assumeType from '@helpers/assumeType';

import {FolderItemPayload} from '@components/sidebarLeft/foldersSidebarContent/types';
import extractEmojiFromFilterTitle, {ExtractEmojiFromFilterTitleResult} from '@components/sidebarLeft/foldersSidebarContent/extractEmojiFromFilterTitle';
import {i18n} from '@lib/langPack';

export function getFolderTitle(filter: MyDialogFilter) {
  let cleanTitle: ExtractEmojiFromFilterTitleResult;

  const titleRest = filter.id === FOLDER_ID_ALL ? {
    name: i18n('FilterAllChats')
  } : {
    title: (cleanTitle = extractEmojiFromFilterTitle(filter.title)).text
  };

  const iconRest: Pick<FolderItemPayload, 'iconDocId' | 'emojiIcon'> = {
    iconDocId: cleanTitle?.docId,
    emojiIcon: cleanTitle?.emoji
  };

  return {
    icon: getIconForFilter(filter),
    ...titleRest,
    ...iconRest,
    dontAnimate: !!filter?.pFlags?.title_noanimate
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

import {createMemo, createRoot, createSignal} from 'solid-js';
import type {MyDialogFilter} from '@lib/storages/filters';
import type {AnyDialog} from '@lib/storages/dialogs';
import {REAL_FOLDERS} from '@appManagers/constants';
import getDialogIndexKey from '@appManagers/utils/dialogs/getDialogIndexKey';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import {DialogColors} from '@appManagers/utils/peers/dialogColors';
import {appState} from '@stores/appState';
import usePremium from '@stores/premium';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {useMediaSizes} from '@helpers/mediaSizes';

/** The peer colours a folder tag can wear, as the clients count them */
export const FOLDER_TAG_COLORS_COUNT = DialogColors.length;

/** The colour of a folder's tag, or nothing for a folder that has none */
export function getFolderTagColor(filter: MyDialogFilter) {
  const color = filter?.color;
  // * a colour past the palette wraps around, as on Android and Desktop - a new folder made on
  // * Android picks one of eight at random
  return color === undefined || color < 0 ? undefined : color % FOLDER_TAG_COLORS_COUNT;
}

/**
 * The folders whose tags a chat wears, in the order the folders go: every one with a colour that
 * has the chat, except `excludeFilterId` - the folder the list belongs to, whose tag would only
 * repeat the tab it is open in. All chats and the archive have no tag of their own.
 */
export function getDialogFolderTags(
  dialog: AnyDialog,
  filters: MyDialogFilter[],
  excludeFilterId?: number
) {
  if(!dialog) {
    return [];
  }

  return filters.filter((filter) => {
    return filter.id !== excludeFilterId &&
      getDialogIndex(dialog, getDialogIndexKey(filter.localId)) !== undefined;
  });
}

const store = createRoot(() => {
  const premium = usePremium();
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const mediaSizes = useMediaSizes();
  const [forumOpen, setForumOpen] = createSignal(false);

  // * `appSidebarLeft.isCollapsed`, as a signal: the floating sidebar keeps the class, and is wide
  const chatListNarrow = createMemo(() => {
    return forumOpen() || (isSidebarCollapsed() && !mediaSizes.isLessThanFloatingLeftSidebar);
  });

  // * the switch is Premium's: an account without it does not see the tags even with the flag on,
  // * as on Android, iOS and Web A
  const shown = createMemo(() => !!appState.filtersTagsEnabled && premium());

  // * the state's copy of the folders is the one the dialogs' indexes are made for: its local ids
  // * are renumbered on a reorder, the folder tabs keep theirs
  const filters = createMemo(() => {
    return (appState.filtersArr || [])
    .filter((filter) => !REAL_FOLDERS.has(filter.id) && getFolderTagColor(filter) !== undefined)
    .sort((a, b) => a.localId - b.localId);
  });

  return {shown, filters, chatListNarrow, setForumOpen};
});

/** Whether the chat list shows folder tags at all - the account's switch, and Premium */
export function useFolderTagsShown() {
  return store.shown;
}

/** The folders that have a tag, in their order */
export function useFolderTagFilters() {
  return store.filters;
}

/**
 * Whether the chat list is down to its avatars: a forum open over it, or the sidebar collapsed
 * (`appDialogsManager.isChatListNarrow` reads it). Its rows have no room for a tag then, and go back
 * to their height.
 */
export function useChatListNarrow() {
  return store.chatListNarrow;
}

/** Whether a forum is open over the chat list - `appDialogsManager.forumTab` says so as it changes */
export function setChatListForumOpen(open: boolean) {
  store.setForumOpen(open);
}

import {createEffect, createMemo, createRoot, createSignal, untrack} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import type {MyDialogFilter} from '@lib/storages/filters';
import type {AppManagers} from '@lib/managers';

export type StoredFolder = {
  id: number,
  notifications?: {
    count: number,
    muted: boolean
  },
  chatsCount: number | null,
  filter: MyDialogFilter
};

async function getNotificationCountForFilter(filterId: number, managers: AppManagers) {
  const {
    unreadUnmutedCount,
    unreadCount,
    unreadMentionsCount
  } = await managers.dialogsStorage.getFolderUnreadCount(filterId);

  return {
    count: filterId === FOLDER_ID_ALL ? unreadUnmutedCount : unreadCount,
    muted: !unreadUnmutedCount && !!unreadCount && !unreadMentionsCount
  };
}

async function getFolderItemsInOrder(folderItems: StoredFolder[], managers: AppManagers) {
  const filters = new Map<number, MyDialogFilter>();

  const filtersPromises = folderItems
  .filter((item) => item.id)
  .map((item) => managers.filtersStorage.getFilter(item.id));

  const filtersArr = (
    await Promise.all(filtersPromises)
  ).filter(Boolean);

  for(const filter of filtersArr) {
    filters.set(filter.id, filter);
  }

  return folderItems.sort((a, b) => {
    if(!a.id || !b.id) return 0;
    return filters.get(a.id)?.localId - filters.get(b.id)?.localId;
  });
}

const useFoldersStore = createRoot(() => {
  const [selectedFolderId, _setSelectedFolderId] = createSignal<number>(FOLDER_ID_ALL);
  const [folderItems, setFolderItems] = createStore<StoredFolder[]>([]);
  const selectedFolderIndex = createMemo(() => folderItems.findIndex(({id}) => id === selectedFolderId()));

  let setSelectedFolderId: (index: number, dontAnimate?: boolean) => any;
  const [onClick, setOnClick] = createSignal<typeof setSelectedFolderId>();

  createEffect(() => {
    setSelectedFolderId = onClick();
  });

  function updateFolderItem(folderId: number, payload: Partial<StoredFolder>) {
    const idx = folderItems.findIndex((item) => item.id === folderId);
    if(idx === -1) {
      return;
    }

    const folderItem = folderItems[idx];
    setFolderItems(idx, reconcile({...folderItem, ...payload}));
  }

  async function updateFolderNotifications(folderId: number) {
    updateFolderItem(folderId, {
      notifications: await getNotificationCountForFilter(folderId, rootScope.managers)
    });
  }

  function updateAllFolderNotifications() {
    for(const folderItem of folderItems) {
      if(!folderItem.id) continue;
      updateFolderNotifications(folderItem.id);
    }
  }

  async function makeFolderItemPayload(filter: MyDialogFilter): Promise<StoredFolder> {
    const [notifications, folder] = await Promise.all([
      getNotificationCountForFilter(filter.id, rootScope.managers),
      rootScope.managers.dialogsStorage.getFolder(filter.id)
    ]);

    return {
      id: filter.id,
      notifications: notifications,
      chatsCount: folder?.dialogs?.length || 0,
      filter
    };
  }

  async function updateOrAddFolder(filter: MyDialogFilter) {
    const items = [...folderItems];
    const existingItem = items.find((item) => item.id === filter.id);

    if(existingItem) {
      updateFolderItem(filter.id, await makeFolderItemPayload(filter));
      return;
    }

    const [payload, orderedFolderItems] = await Promise.all([
      makeFolderItemPayload(filter),
      getFolderItemsInOrder(items, rootScope.managers)
    ]);

    items.push(payload);
    setFolderItems(orderedFolderItems);
  }

  function deleteFolder(filterId: number) {
    const items = [...folderItems];
    const existingItemIndex = items.findIndex((item) => item.id === filterId);

    if(existingItemIndex === -1) return;

    items.splice(existingItemIndex, 1);
    const length = items.length;
    setFolderItems(items);

    const selectedId = untrack(selectedFolderId);
    if(length >= selectedId || selectedId === filterId) {
      setSelectedFolderId(0);
    }
  }

  function updateItemsOrder(order: number[]) {
    order = [...order];
    indexOfAndSplice(order, FOLDER_ID_ARCHIVE);

    const items = [...folderItems];

    items.sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);

      if(aIndex === -1) return -1;
      if(bIndex === -1) return 1;

      return aIndex - bIndex;
    });

    setFolderItems(items);
  }

  let hydrated = false;
  async function hydrateFilters(filters: MyDialogFilter[]) {
    if(hydrated) {
      return;
    }

    hydrated = true;
    const folderFilters = filters.filter((filter) => filter.id !== FOLDER_ID_ARCHIVE);
    const items = await Promise.all(folderFilters.map(makeFolderItemPayload));
    const orderedItems = await getFolderItemsInOrder(items, rootScope.managers);
    setFolderItems(orderedItems);
    initListeners();
  }

  function initListeners() {
    rootScope.addEventListener('dialog_flush', ({dialog}) => {
      if(!dialog) return;
      updateAllFolderNotifications();
    });

    rootScope.addEventListener('folder_unread', (filter) => {
      if(filter.id < 0) return;
      updateFolderNotifications(filter.id);
    });

    rootScope.addEventListener('filter_update', (filter) => {
      if(REAL_FOLDERS.has(filter.id)) return;
      updateOrAddFolder(filter);
    });

    rootScope.addEventListener('filter_delete', (filter) => {
      deleteFolder(filter.id);
    });

    rootScope.addEventListener('filter_order', (order) => {
      updateItemsOrder(order);
    });

    rootScope.addEventListener('filter_joined', (filter) => {
      setSelectedFolderId(filter.id);
    });

    rootScope.addEventListener('premium_toggle', async(isPremium) => {
      if(isPremium) {
        return;
      }

      const isFolderAvailable = await rootScope.managers.filtersStorage.isFilterIdAvailable(selectedFolderId());
      if(!isFolderAvailable) {
        setSelectedFolderId(FOLDER_ID_ALL);
      }
    });
  }

  return {
    selectedFolderId,
    setSelectedFolderId: _setSelectedFolderId,
    selectedFolderIndex,
    folderItems,
    hydrateFilters,
    onClick,
    setOnClick
  };
});

export default function useFolders() {
  return useFoldersStore;
}

import {createEffect, createMemo, createRoot, createSignal, untrack} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import type {MyDialogFilter} from '@lib/storages/filters';
import type {ReadingManagers} from '@lib/managers';

export type StoredFolder = {
  id: number,
  notifications?: {
    count: number,
    muted: boolean
  },
  chatsCount: number | null,
  filter: MyDialogFilter
};

async function getNotificationCountForFilter(filterId: number, managers: ReadingManagers) {
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

const useFoldersStore = createRoot(() => {
  const [selectedFolderId, _setSelectedFolderId] = createSignal<number>(FOLDER_ID_ALL);
  const [folderItems, setFolderItems] = createStore<StoredFolder[]>([]);
  const selectedFolderIndex = createMemo(() => folderItems.findIndex(({id}) => id === selectedFolderId()));

  let setSelectedFolderId: (index: number, dontAnimate?: boolean) => any;
  const [onClick, setOnClick] = createSignal<typeof setSelectedFolderId>();

  createEffect(() => {
    setSelectedFolderId = onClick();
  });

  // * the folders' events come in bursts - a reload is updates, removals and an order at once - while what a tab
  // * shows of a folder is read from the worker in between. So what comes back is written onto the tabs as they are
  // * then, never onto a copy taken before the read, and only while it is still the latest word on its folder:
  // * every event of a folder, and a hydration, marks it, and what was asked for before its last mark is dropped
  let lastMark = 0;
  const marks = new Map<number, number>();
  const markFolder = (folderId: number) => {
    const mark = ++lastMark;
    marks.set(folderId, mark);
    return mark;
  };

  const isLatestMark = (folderId: number, mark: number) => marks.get(folderId) === mark;

  // * the folders' order as the events have left it, taken as they come - with a place for a folder still being
  // * read. A new folder is the last one until an order says otherwise, as the worker places it
  let order: number[] = [];
  const sortByOrder = (items: StoredFolder[]) => {
    return items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  };

  function updateFolderItem(folderId: number, payload: Partial<StoredFolder>) {
    const idx = folderItems.findIndex((item) => item.id === folderId);
    if(idx === -1) {
      return;
    }

    const folderItem = folderItems[idx];
    setFolderItems(idx, reconcile({...folderItem, ...payload}));
  }

  async function updateFolderNotifications(folderId: number) {
    const mark = marks.get(folderId);
    const notifications = await getNotificationCountForFilter(folderId, rootScope.managers);
    if(isLatestMark(folderId, mark)) {
      updateFolderItem(folderId, {notifications});
    }
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
    const mark = markFolder(filter.id);
    if(!order.includes(filter.id)) {
      order.push(filter.id);
    }

    const payload = await makeFolderItemPayload(filter);
    if(!isLatestMark(filter.id, mark)) {
      return;
    }

    if(folderItems.some((item) => item.id === filter.id)) {
      updateFolderItem(filter.id, payload);
    } else {
      setFolderItems(sortByOrder([...folderItems, payload]));
    }
  }

  function deleteFolder(filterId: number) {
    // * before anything else: the folder may be on its way in still, and is not to come
    markFolder(filterId);
    indexOfAndSplice(order, filterId);

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

  function updateItemsOrder(newOrder: number[]) {
    order = newOrder.filter((folderId) => folderId !== FOLDER_ID_ARCHIVE);
    setFolderItems(sortByOrder([...folderItems]));
  }

  let lastHydrationId = 0;
  let listenersInited = false;
  async function hydrateFilters(filters: MyDialogFilter[]) {
    const hydrationId = ++lastHydrationId;
    const folderFilters = filters
    .filter((filter) => filter.id !== FOLDER_ID_ARCHIVE)
    .sort((a, b) => a.localId - b.localId);

    // * the hydration is the word on every folder known: the ones it has are written, the rest go - each unless an
    // * event of its own comes after
    const marked = folderFilters.map((filter) => markFolder(filter.id));
    const hydratedIds = folderFilters.map((filter) => filter.id);
    const leaving = new Map<number, number>();
    for(const folderId of [...order, ...folderItems.map((item) => item.id)]) {
      if(!hydratedIds.includes(folderId) && !leaving.has(folderId)) {
        leaving.set(folderId, markFolder(folderId));
      }
    }

    order = [...hydratedIds, ...leaving.keys()];

    const items = await Promise.all(folderFilters.map(makeFolderItemPayload));
    if(hydrationId !== lastHydrationId) {
      return;
    }

    const gone = new Set<number>();
    leaving.forEach((mark, folderId) => {
      if(isLatestMark(folderId, mark)) {
        gone.add(folderId);
        indexOfAndSplice(order, folderId);
      }
    });

    const nextItems = folderItems.filter((item) => !gone.has(item.id));
    items.forEach((item, idx) => {
      if(!isLatestMark(item.id, marked[idx])) {
        return;
      }

      const existingIdx = nextItems.findIndex((nextItem) => nextItem.id === item.id);
      if(existingIdx === -1) {
        nextItems.push(item);
      } else {
        nextItems[existingIdx] = item;
      }
    });

    setFolderItems(sortByOrder(nextItems));
    if(!listenersInited) {
      listenersInited = true;
      initListeners();
    }
  }

  // * the tab goes to another account: these folders are not its, and whatever is still being read for them -
  // * a hydration included - is for the previous account; the lists they open are gone already
  function resetForAccountSwitch() {
    ++lastHydrationId;
    marks.clear();
    order = [];
    setFolderItems([]);
    _setSelectedFolderId(FOLDER_ID_ALL);
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

    const onFilterUpsert = (filter: MyDialogFilter) => {
      if(REAL_FOLDERS.has(filter.id)) return;
      return updateOrAddFolder(filter);
    };

    rootScope.addEventListener('filter_update', onFilterUpsert);
    rootScope.addEventListener('filter_new', onFilterUpsert);

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

      const folderId = untrack(selectedFolderId);
      const isFolderAvailable = await rootScope.managers.filtersStorage.isFilterIdAvailable(folderId);
      // * another folder picked meanwhile is the user's choice
      if(!isFolderAvailable && untrack(selectedFolderId) === folderId) {
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
    resetForAccountSwitch,
    onClick,
    setOnClick
  };
});

export default function useFolders() {
  return useFoldersStore;
}

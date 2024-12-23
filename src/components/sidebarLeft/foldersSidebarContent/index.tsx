import {createRoot, createSignal, For, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import {Middleware} from '../../../helpers/middleware';
import ListenerSetter from '../../../helpers/listenerSetter';
import {logger} from '../../../lib/logger';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '../../../lib/mtproto/mtproto_config';
import {i18n} from '../../../lib/langPack';
import {MyDialogFilter} from '../../../lib/storages/filters';
import indexOfAndSplice from '../../../helpers/array/indexOfAndSplice';
import createContextMenu from '../../../helpers/dom/createContextMenu';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import pause from '../../../helpers/schedulers/pause';
import type SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';

import {getFolderItemsInOrder, getIconForFilter, getNotificationCountForFilter} from './utils';
import type {FolderItemPayload} from './types';
import FolderItem from './folderItem';

const log = logger('folders-sidebar');


export function FoldersSidebarContent() {
  const {
    rootScope,
    appSidebarLeft,
    AppChatFoldersTab,
    AppEditFolderTab
  } = useHotReloadGuard();

  const [selectedFolderId, setSelectedFolderId] = createSignal<number>(FOLDER_ID_ALL);
  const [folderItems, setFolderItems] = createSignal<FolderItemPayload[]>([]);

  let menuRef: HTMLDivElement;
  let folderItemsContainer: HTMLDivElement

  function updateFolderItem(folderId: number, payload: Partial<FolderItemPayload>) {
    setFolderItems((prev) =>
      prev.map((folderItem) => (folderItem.id === folderId ? {...folderItem, ...payload} : folderItem))
    );
  }

  async function updateFolderNotifications(folderId: number) {
    updateFolderItem(folderId, {
      notifications: await getNotificationCountForFilter(folderId, rootScope.managers)
    });
  }

  async function updateAllFolderNotifications() {
    const items = folderItems();

    for(const folderItem of items) {
      if(!folderItem.id) continue;
      updateFolderNotifications(folderItem.id);
    }
  }

  async function makeFolderItemPayload(filter: MyDialogFilter): Promise<FolderItemPayload> {
    function wrapTitle(title: string) {
      const span = document.createElement('span');
      // Needs to be in an actual element
      span.append(wrapEmojiText(title));
      return span;
    }
    return {
      id: filter.id,
      name: filter.id === FOLDER_ID_ALL ? i18n('FilterAllChats') : wrapTitle(filter.title),
      icon: getIconForFilter(filter),
      notifications: await getNotificationCountForFilter(filter.id, rootScope.managers),
      chatsCount: (await rootScope.managers.dialogsStorage.getFolder(filter.id))?.dialogs?.length || 0
    };
  }


  async function updateOrAddFolder(filter: MyDialogFilter) {
    const items = [...folderItems()];
    const existingItem = items.find((item) => item.id === filter.id);

    if(existingItem) {
      updateFolderItem(filter.id, await makeFolderItemPayload(filter));
      return;
    }

    items.push(await makeFolderItemPayload(filter));
    const orderedFolderItems = await getFolderItemsInOrder(items, rootScope.managers);
    setFolderItems(orderedFolderItems);
  }

  async function deleteFolder(filterId: number) {
    const items = folderItems();
    const existingItemIndex = items.findIndex((item) => item.id === filterId);

    if(existingItemIndex === -1) return;

    items.splice(existingItemIndex, 1);
    setFolderItems([...items]);
  }

  async function updateItemsOrder(order: number[]) {
    order = [...order];
    indexOfAndSplice(order, FOLDER_ID_ARCHIVE);

    const items = [...folderItems()];

    items.sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);

      if(aIndex === -1) return -1;
      if(bIndex === -1) return 1;

      return aIndex - bIndex;
    });

    setFolderItems(items);;
  }

  async function closeTabsBefore(clb: () => void) {
    appSidebarLeft.closeSearch();
    appSidebarLeft.closeAllTabs() && await pause(200);
    clb();
  }

  function setSelectedFolder(folderId: number) {
    setSelectedFolderId(folderId);
    appSidebarLeft.closeAllTabs();
    appSidebarLeft.closeSearch();
    rootScope.dispatchEvent('changing_folder_from_sidebar', folderId);
  }

  async function openSettingsForFilter(filterId: number) {
    if(REAL_FOLDERS.has(filterId)) return;
    const filter = await rootScope.managers.filtersStorage.getFilter(filterId)

    closeTabsBefore(() => {
      const tab = appSidebarLeft.createTab(AppEditFolderTab);
      tab.setInitFilter(filter);
      tab.open();
    });
  }

  onMount(() => {
    const listenerSetter = new ListenerSetter();

    appSidebarLeft.createToolsMenu(menuRef, true);
    menuRef.classList.add('sidebar-tools-button', 'is-visible');

    let clickFilterId: number;

    const contextMenu = createContextMenu({
      buttons: [{
        icon: 'edit',
        text: 'FilterEdit',
        onClick: () => {
          openSettingsForFilter(clickFilterId);
        },
        verify: () => clickFilterId !== FOLDER_ID_ALL
      }, {
        icon: 'edit',
        text: 'FilterEditAll',
        onClick: () => {
          closeTabsBefore(() => {
            appSidebarLeft.createTab(AppChatFoldersTab).open();
          });
        },
        verify: () => clickFilterId === FOLDER_ID_ALL
      }, {
        icon: 'readchats',
        text: 'MarkAllAsRead',
        onClick: () => {
          rootScope.managers.dialogsStorage.markFolderAsRead(clickFilterId);
        },
        verify: async() => !!(await rootScope.managers.dialogsStorage.getFolderUnreadCount(clickFilterId)).unreadCount
      }, {
        icon: 'delete',
        className: 'danger',
        text: 'Delete',
        onClick: () => {
          AppEditFolderTab.deleteFolder(clickFilterId);
        },
        verify: () => clickFilterId !== FOLDER_ID_ALL
      }],
      listenTo: folderItemsContainer,
      findElement: (e) => findUpClassName(e.target, 'folders-sidebar__folder-item'),
      onOpen: (e, target) => {
        clickFilterId = +target.dataset.filterId;
      }
    });

    (async() => {
      const filters = await rootScope.managers.filtersStorage.getDialogFilters();
      const folderFilters = filters.filter(filter => filter.id !== FOLDER_ID_ARCHIVE);

      const folderItems = await Promise.all(folderFilters.map(makeFolderItemPayload));
      const orderedFolderItems = await getFolderItemsInOrder(folderItems, rootScope.managers);

      setFolderItems(orderedFolderItems);
    })()

    listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
      if(!dialog) return;
      updateAllFolderNotifications();
    });

    listenerSetter.add(rootScope)('folder_unread', (filter) => {
      if(filter.id < 0) return;
      updateFolderNotifications(filter.id);
    });

    listenerSetter.add(rootScope)('filter_update', (filter) => {
      log('filter_update', filter);
      if(REAL_FOLDERS.has(filter.id)) return;
      updateOrAddFolder(filter);
    });

    listenerSetter.add(rootScope)('filter_delete', (filter) => {
      deleteFolder(filter.id);
    });

    listenerSetter.add(rootScope)('filter_order', (order) => {
      updateItemsOrder(order);
    });

    listenerSetter.add(rootScope)('changing_folder_from_chatlist', (id) => {
      log('changing_folder_from_chatlist', id);
      setSelectedFolderId(id);
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      contextMenu.destroy();
    });
  });

  return (
    <>
      <FolderItem ref={(el) => (menuRef = el)} class='folders-sidebar__menu-button' icon='menu' />

      <div ref={folderItemsContainer}>
        <For each={folderItems()}>{(folderItem) => (
          <FolderItem
            {...folderItem}
            selected={selectedFolderId() === folderItem.id}
            onClick={() => setSelectedFolder(folderItem.id)}
            onAddFoldersClick={() => openSettingsForFilter(folderItem.id)}
          />
        )}</For>
      </div>

      {appSidebarLeft.createNewBtnMenu(false, true)}
    </>
  );
}

export function renderFoldersSidebarContent(element: HTMLElement, HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider, middleware: Middleware) {
  createRoot((dispose) => {
    render(() => <HotReloadGuardProvider><FoldersSidebarContent /></HotReloadGuardProvider>, element);
    middleware.onDestroy(() => dispose());
  });
}

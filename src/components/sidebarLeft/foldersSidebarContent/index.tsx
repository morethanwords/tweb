import {createEffect, createRoot, createSelector, createSignal, For, onCleanup, onMount} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {render} from 'solid-js/web';

import createFolderContextMenu from '../../../helpers/dom/createFolderContextMenu';
import indexOfAndSplice from '../../../helpers/array/indexOfAndSplice';
import createMiddleware from '../../../helpers/solid/createMiddleware';
import ListenerSetter from '../../../helpers/listenerSetter';
import Animated from '../../../helpers/solid/animations';
import {Middleware} from '../../../helpers/middleware';
import pause from '../../../helpers/schedulers/pause';

import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '../../../lib/mtproto/mtproto_config';
import type SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import {MyDialogFilter} from '../../../lib/storages/filters';
import {i18n} from '../../../lib/langPack';

import wrapFolderTitle from '../../wrappers/folderTitle';
import Scrollable from '../../scrollable2';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple'; ripple; // keep

import {getFolderItemsInOrder, getIconForFilter, getNotificationCountForFilter} from './utils';
import type {FolderItemPayload} from './types';
import FolderItem from './folderItem';


export function FoldersSidebarContent(props: {
  notificationsElement: HTMLElement
}) {
  const {
    rootScope,
    appSidebarLeft,
    AppChatFoldersTab,
    AppEditFolderTab,
    showLimitPopup
  } = useHotReloadGuard();

  const middlewareHelper = createMiddleware();

  const [selectedFolderId, setSelectedFolderId] = createSignal<number>(FOLDER_ID_ALL);
  const [folderItems, setFolderItems] = createStore<FolderItemPayload[]>([]);
  const [addFoldersOffset, setAddFoldersOffset] = createSignal(0);
  const [canShowAddFolders, setCanShowAddFolders] = createSignal(false);

  const showAddFolders = () => canShowAddFolders() &&
    selectedFolderId() &&
    !REAL_FOLDERS.has(selectedFolderId()) &&
    folderItems.find((item) => item.id === selectedFolderId())?.chatsCount === 0;

  const [folderItemRefs, setFolderItemRefs] = createStore<Record<number, HTMLDivElement>>({});

  const isSelected = createSelector(selectedFolderId);

  let menuRef: HTMLDivElement;
  let folderItemsContainer: HTMLDivElement;

  function updateFolderItem(folderId: number, payload: Partial<FolderItemPayload>) {
    const idx = folderItems.findIndex((item) => item.id === folderId);
    if(idx === -1) {
      return;
    }

    const folderItem = folderItems[idx];
    folderItem.middlewareHelper?.destroy();
    setFolderItems(idx, reconcile({...folderItem, ...payload}));
  }

  async function updateFolderNotifications(folderId: number) {
    updateFolderItem(folderId, {
      notifications: await getNotificationCountForFilter(folderId, rootScope.managers)
    });
  }

  async function updateAllFolderNotifications() {
    const items = folderItems;

    for(const folderItem of items) {
      if(!folderItem.id) continue;
      updateFolderNotifications(folderItem.id);
    }
  }

  async function makeFolderItemPayload(filter: MyDialogFilter): Promise<FolderItemPayload> {
    function wrapTitle(title: DocumentFragment) {
      const span = document.createElement('span');
      // Needs to be in an actual element
      span.append(title);
      return span;
    }

    const _middlewareHelper = middlewareHelper.get().create();

    const [notifications, folder, title] = await Promise.all([
      getNotificationCountForFilter(filter.id, rootScope.managers),
      rootScope.managers.dialogsStorage.getFolder(filter.id),
      filter.id === FOLDER_ID_ALL ? i18n('FilterAllChats') : wrapFolderTitle(filter.title, _middlewareHelper.get()).then(wrapTitle)
    ]);

    return {
      id: filter.id,
      name: title,
      icon: getIconForFilter(filter),
      notifications: notifications,
      chatsCount: folder?.dialogs?.length || 0,
      middlewareHelper: _middlewareHelper
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

  async function deleteFolder(filterId: number) {
    const items = [...folderItems];
    const existingItemIndex = items.findIndex((item) => item.id === filterId);

    if(existingItemIndex === -1) return;

    const item = items[existingItemIndex];
    item.middlewareHelper?.destroy();
    items.splice(existingItemIndex, 1);
    setFolderItems(items);
  }

  async function updateItemsOrder(order: number[]) {
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

  async function setSelectedFolder(folderId: number) {
    const isFilterAvailable = await rootScope.managers.filtersStorage.isFilterIdAvailable(folderId);
    if(!isFilterAvailable) {
      showLimitPopup('folders');
      return false;
    }

    setSelectedFolderId(folderId);
    const hasSomethingOpen = appSidebarLeft.hasSomethingOpenInside();
    appSidebarLeft.closeEverythingInside();

    hasSomethingOpen && await pause(300);
    rootScope.dispatchEventSingle('changing_folder_from_sidebar', {id: folderId});
  }

  let contextMenu: ReturnType<typeof createFolderContextMenu>;
  onMount(() => {
    const listenerSetter = new ListenerSetter();

    appSidebarLeft.createToolsMenu(menuRef, true);
    menuRef.classList.add('sidebar-tools-button', 'is-visible');
    menuRef.append(props.notificationsElement);

    contextMenu = createFolderContextMenu({
      appSidebarLeft,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: rootScope.managers,
      className: 'folders-sidebar__folder-item',
      listenTo: folderItemsContainer
    });

    (async() => {
      const filters = await rootScope.managers.filtersStorage.getDialogFilters();
      const folderFilters = filters.filter((filter) => filter.id !== FOLDER_ID_ARCHIVE);

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
      setSelectedFolderId(id);
    });

    onCleanup(() => {
      listenerSetter.removeAll();
      contextMenu.destroy();
    });
  });

  const updateCanShowAddFolders = () => {
    const selectedItem = folderItemRefs[selectedFolderId()];

    if(!selectedItem) return;
    const containerRect = folderItemsContainer.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();
    const offset = itemRect.top + itemRect.height / 2 - containerRect.top;
    const MARGIN_PX = 50;
    setCanShowAddFolders(offset > MARGIN_PX && offset < containerRect.height - MARGIN_PX);
    setAddFoldersOffset(offset);
  };

  createEffect(updateCanShowAddFolders);

  let openingChatFolders = false;
  return (
    <>
      <FolderItem ref={(el) => (menuRef = el)} class="folders-sidebar__menu-button" icon="menu" />

      <div class="folders-sidebar__scrollable-position">
        <Scrollable
          ref={folderItemsContainer}
          class="folders-sidebar__scrollable"
          onScroll={updateCanShowAddFolders}
          withBorders="both"
        >
          <For each={folderItems}>{(folderItem) => {
            const {id} = folderItem;

            onCleanup(() => {
              setFolderItemRefs({[id]: undefined});
            });

            return (
              <FolderItem
                {...folderItem}
                ref={(el) => setFolderItemRefs({[id]: el})}
                selected={isSelected(id)}
                onClick={() => setSelectedFolder(id)}
              />
            );
          }}</For>
        </Scrollable>

        <Animated type="cross-fade" mode="add-remove">
          {showAddFolders() && <div
            use:ripple
            class="folders-sidebar__add-folders-button"
            onClick={() => contextMenu.openSettingsForFilter(selectedFolderId())}
            style={{
              '--offset': addFoldersOffset()
            }}
          >
            <IconTsx icon="plus" class="folders-sidebar__add-folders-button-icon" />
            <div class="folders-sidebar__add-folders-button-name">
              {i18n('ChatList.Filter.Include.AddChat')}
            </div>
          </div>}
        </Animated>
      </div>

      <FolderItem
        class="folders-sidebar__menu-button"
        icon="equalizer"
        onClick={() => {
          if(openingChatFolders || appSidebarLeft.getTab(AppChatFoldersTab)) return;
          openingChatFolders = true;
          appSidebarLeft.closeTabsBefore(() => {
            const tab = appSidebarLeft.createTab(AppChatFoldersTab);
            tab.open().finally(() => {
              openingChatFolders = false;
            });
          });
        }}
      />
    </>
  );
}

export function renderFoldersSidebarContent(
  element: HTMLElement,
  notificationsElement: HTMLElement,
  HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider,
  middleware: Middleware
) {
  createRoot((dispose) => {
    render(() => (
      <HotReloadGuardProvider>
        <FoldersSidebarContent notificationsElement={notificationsElement} />
      </HotReloadGuardProvider>
    ), element);

    middleware.onDestroy(() => dispose());
  });
}

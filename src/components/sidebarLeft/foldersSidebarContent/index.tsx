import {createEffect, createMemo, createRoot, createSignal, For, onCleanup, onMount} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
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

import Scrollable from '../../scrollable2';
import Animated from '../../../helpers/solid/animations';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';

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
  const [folderItems, setFolderItems] = createStore<FolderItemPayload[]>([]);
  const [scrollAmount, setScrollAmount] = createSignal(0);
  const [addFoldersOffset, setAddFoldersOffset] = createSignal(0);
  const [canShowAddFolders, setCanShowAddFolders] = createSignal(false);

  const hasScroll = createMemo(() => scrollAmount() > 0);
  const showAddFolders = () => canShowAddFolders() && selectedFolderId() && !REAL_FOLDERS.has(selectedFolderId()) &&
     folderItems.find(item => item.id === selectedFolderId())?.chatsCount === 0;

  const [folderItemRefs, setFolderItemRefs] = createStore<Record<number, HTMLDivElement>>({});

  let menuRef: HTMLDivElement;
  let folderItemsContainer: HTMLDivElement;
  let showAddFoldersButton: HTMLDivElement;

  function updateFolderItem(folderId: number, payload: Partial<FolderItemPayload>) {
    const idx = folderItems.findIndex((item) => item.id === folderId);
    const folderItem = folderItems[idx];
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
    function wrapTitle(title: string) {
      const span = document.createElement('span');
      // Needs to be in an actual element
      span.append(wrapEmojiText(title));
      return span;
    }

    const [notifications, folder] = await Promise.all([
      getNotificationCountForFilter(filter.id, rootScope.managers),
      rootScope.managers.dialogsStorage.getFolder(filter.id)
    ]);

    return {
      id: filter.id,
      name: filter.id === FOLDER_ID_ALL ? i18n('FilterAllChats') : wrapTitle(filter.title),
      icon: getIconForFilter(filter),
      notifications: notifications,
      chatsCount: folder?.dialogs?.length || 0
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
    const items = folderItems;
    const existingItemIndex = items.findIndex((item) => item.id === filterId);

    if(existingItemIndex === -1) return;

    items.splice(existingItemIndex, 1);
    setFolderItems([...items]);
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

  async function closeTabsBefore(clb: () => void) {
    appSidebarLeft.closeEverythingInside() && await pause(200);
    clb();
  }

  async function setSelectedFolder(folderId: number) {
    setSelectedFolderId(folderId);
    const hasSomethingOpen = appSidebarLeft.hasSomethingOpenInside();
    appSidebarLeft.closeEverythingInside();

    hasSomethingOpen && await pause(300);
    rootScope.dispatchEvent('changing_folder_from_sidebar', {id: folderId});
  }

  async function openSettingsForFilter(filterId: number) {
    if(REAL_FOLDERS.has(filterId)) return;
    const filter = await rootScope.managers.filtersStorage.getFilter(filterId);

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

    const scrollListener = () => {
      setScrollAmount(folderItemsContainer.scrollTop);
    };

    folderItemsContainer.addEventListener('scroll', scrollListener);

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
      folderItemsContainer.removeEventListener('scroll', scrollListener);
    });
  });

  createEffect(() => {
    if(showAddFolders()) ripple(showAddFoldersButton);
  });

  createEffect(() => {
    scrollAmount();
    const selectedItem = folderItemRefs[selectedFolderId()];

    if(!selectedItem) return;
    const containerRect = folderItemsContainer.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();
    const offset = itemRect.top + itemRect.height / 2 - containerRect.top;
    const MARGIN_PX = 50;
    setCanShowAddFolders(offset > MARGIN_PX && offset < containerRect.height - MARGIN_PX);
    setAddFoldersOffset(offset);
  });

  return (
    <>
      <FolderItem ref={(el) => (menuRef = el)} class="folders-sidebar__menu-button" icon="menu" />

      <div
        class="folders-sidebar__scrollable-position"
        classList={{
          'folders-sidebar__scrollable-position--has-scroll': hasScroll()
        }}
      >
        <Scrollable ref={folderItemsContainer}>
          <For each={folderItems}>{(folderItem) => {
            const {id} = folderItem;

            onCleanup(() => {
              setFolderItemRefs({[id]: undefined});
            });

            return (
              <FolderItem
                {...folderItem}
                ref={(el) => setFolderItemRefs({[id]: el})}
                selected={selectedFolderId() === id}
                onClick={() => setSelectedFolder(id)}
              />
            );
          }}</For>
        </Scrollable>

        <Animated type="cross-fade" mode="add-remove">
          {showAddFolders() && <div
            ref={showAddFoldersButton}
            class="folders-sidebar__add-folders-button"
            onClick={() => openSettingsForFilter(selectedFolderId())}
            style={{
              '--offset': addFoldersOffset()
            }}
          >
            <IconTsx icon="plus" />
            <div class="folders-sidebar__add-folders-button-name">
              {i18n('ChatList.Filter.Include.AddChat')}
            </div>
          </div>}
        </Animated>
      </div>
    </>
  );
}

export function renderFoldersSidebarContent(element: HTMLElement, HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider, middleware: Middleware) {
  createRoot((dispose) => {
    render(() => <HotReloadGuardProvider><FoldersSidebarContent /></HotReloadGuardProvider>, element);
    middleware.onDestroy(() => dispose());
  });
}

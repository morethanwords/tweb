import {batch, createEffect, createRoot, createSelector, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {render} from 'solid-js/web';
import indexOfAndSplice from '../../../helpers/array/indexOfAndSplice';
import createFolderContextMenu from '../../../helpers/dom/createFolderContextMenu';
import ListenerSetter from '../../../helpers/listenerSetter';
import {Middleware} from '../../../helpers/middleware';
import pause from '../../../helpers/schedulers/pause';
import Animated from '../../../helpers/solid/animations';
import {i18n} from '../../../lib/langPack';
import {logger, LogTypes} from '../../../lib/logger';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '../../../lib/mtproto/mtproto_config';
import {useHotReloadGuard} from '../../../lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import {MyDialogFilter} from '../../../lib/storages/filters';
import useHasFoldersSidebar from '../../../stores/foldersSidebar';
import {IconTsx} from '../../iconTsx';
import ripple from '../../ripple';
import Scrollable from '../../scrollable2';
import extractEmojiFromFilterTitle, {ExtractEmojiFromFilterTitleResult} from './extractEmojiFromFilterTitle';
import FolderItem from './folderItem';
import type {FolderItemPayload} from './types';
import {getFolderItemsInOrder, getIconForFilter, getNotificationCountForFilter} from './utils';
ripple; // keep


const log = logger('FoldersSidebarContent', LogTypes.Debug);


export type FoldersSidebarControls = {
  hydrateFilters: (filters: MyDialogFilter[]) => void;
};

export function FoldersSidebarContent(props: {
  filters: MyDialogFilter[];
  isFiltersInited: boolean;
  notificationsElement: HTMLElement;
}) {
  log.debug('Rendering FoldersSidebarContent');
  onCleanup(() => log.debug('Cleaning up FoldersSidebarContent'));

  const {
    rootScope,
    appSidebarLeft,
    AppChatFoldersTab,
    AppEditFolderTab,
    showLimitPopup
  } = useHotReloadGuard();

  const [selectedFolderId, setSelectedFolderId] = createSignal<number>(FOLDER_ID_ALL);
  const [folderItems, setFolderItems] = createStore<FolderItemPayload[]>([]);
  const [addFoldersOffset, setAddFoldersOffset] = createSignal(0);
  const [canShowAddFolders, setCanShowAddFolders] = createSignal(false);
  const [menuTarget, setMenuTarget] = createSignal<HTMLDivElement>();

  const showAddFolders = () => canShowAddFolders() &&
    selectedFolderId() &&
    !REAL_FOLDERS.has(selectedFolderId()) &&
    folderItems.find((item) => item.id === selectedFolderId())?.chatsCount === 0;

  const [folderItemRefs, setFolderItemRefs] = createStore<Record<number, HTMLDivElement>>({});

  const isSelected = createSelector(selectedFolderId);

  let folderItemsContainer: HTMLDivElement;

  function updateFolderItem(folderId: number, payload: Partial<FolderItemPayload>) {
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

  async function updateAllFolderNotifications() {
    const items = folderItems;

    for(const folderItem of items) {
      if(!folderItem.id) continue;
      updateFolderNotifications(folderItem.id);
    }
  }

  async function makeFolderItemPayload(filter: MyDialogFilter): Promise<FolderItemPayload> {
    const [notifications, folder] = await Promise.all([
      getNotificationCountForFilter(filter.id, rootScope.managers),
      rootScope.managers.dialogsStorage.getFolder(filter.id)
    ]);

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
      id: filter.id,
      icon: getIconForFilter(filter),
      notifications: notifications,
      chatsCount: folder?.dialogs?.length || 0,
      dontAnimate: filter.pFlags?.title_noanimate,
      ...titleRest,
      ...iconRest
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

  createEffect(() => {
    if(!menuTarget()) return;

    appSidebarLeft.createToolsMenu(menuTarget(), true);
    menuTarget().classList.add('sidebar-tools-button', 'is-visible');
    menuTarget().append(props.notificationsElement);
  });

  let contextMenu: ReturnType<typeof createFolderContextMenu>;
  onMount(() => {
    const listenerSetter = new ListenerSetter();

    contextMenu = createFolderContextMenu({
      appSidebarLeft,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: rootScope.managers,
      className: 'folders-sidebar__folder-item',
      listenTo: folderItemsContainer
    });

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

  createEffect(() => {
    if(!props.isFiltersInited) return;

    const folderFilters = props.filters.filter((filter) => filter.id !== FOLDER_ID_ARCHIVE);

    let cleaned = false;
    onCleanup(() => void (cleaned = true));

    (async() => {
      const folderItems = await Promise.all(folderFilters.map(makeFolderItemPayload));
      const orderedFolderItems = await getFolderItemsInOrder(folderItems, rootScope.managers);

      if(!cleaned) setFolderItems(orderedFolderItems);
    })();
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
      <FolderItem ref={setMenuTarget} class="folders-sidebar__menu-button" icon="menu" />

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
): FoldersSidebarControls {
  const [hasFoldersSidebar] = useHasFoldersSidebar();

  const {
    filters: [filters, setFilters],
    isFiltersInited: [isFiltersInited, setIsFiltersInited]
  } = createRoot((dispose) => {
    middleware.onDestroy(() => dispose());

    return {
      filters: createSignal<MyDialogFilter[]>([]),
      isFiltersInited: createSignal(false)
    };
  });

  createRoot((dispose) => {
    render(() => (
      <HotReloadGuardProvider>
        <Show when={hasFoldersSidebar()}>
          <FoldersSidebarContent notificationsElement={notificationsElement} filters={filters()} isFiltersInited={isFiltersInited()} />
        </Show>
      </HotReloadGuardProvider>
    ), element);

    middleware.onDestroy(() => dispose());
  });

  return {
    hydrateFilters: (filters) => batch(() => {
      setFilters(filters);
      setIsFiltersInited(true);
    })
  };
}

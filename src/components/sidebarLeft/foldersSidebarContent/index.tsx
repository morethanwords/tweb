import {createEffect, createSelector, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {render} from 'solid-js/web';
import createFolderContextMenu from '@helpers/dom/createFolderContextMenu';
import {keepMe} from '@helpers/keepMe';
import {Middleware} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import Animated from '@helpers/solid/animations';
import {logger, LogTypes} from '@lib/logger';
import {REAL_FOLDERS} from '@appManagers/constants';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import useHasFoldersSidebar from '@stores/foldersSidebar';
import useFolders from '@stores/folders';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import Scrollable from '@components/scrollable2';
import FolderItem from '@components/sidebarLeft/foldersSidebarContent/folderItem';
import {getFolderTitle} from '@components/sidebarLeft/foldersSidebarContent/utils';

keepMe(ripple);

const log = logger('FoldersSidebarContent', LogTypes.Debug);

export function FoldersSidebarContent(props: {
  notificationsElement: HTMLElement;
}) {
  log.debug('Rendering FoldersSidebarContent');
  onCleanup(() => log.debug('Cleaning up FoldersSidebarContent'));

  const {
    rootScope,
    appSidebarLeft,
    AppChatFoldersTab,
    AppEditFolderTab,
    i18n
  } = useHotReloadGuard();

  const {selectedFolderId, onClick, folderItems} = useFolders();
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

  async function _onClick(folderId: number) {
    const index = folderItems.findIndex(({filter}) => filter.id === folderId);
    if(!(await onClick()(index))) {
      return false;
    }

    const hasSomethingOpen = appSidebarLeft.hasSomethingOpenInside();
    appSidebarLeft.closeEverythingInside();
    hasSomethingOpen && await pause(300);
  }

  createEffect(() => {
    const _menuTarget = menuTarget();
    if(!_menuTarget) return;

    appSidebarLeft.createToolsMenu(_menuTarget);
    _menuTarget.classList.add('sidebar-tools-button', 'is-visible');
    _menuTarget.append(props.notificationsElement);
  });

  let contextMenu: ReturnType<typeof createFolderContextMenu>;
  onMount(() => {
    contextMenu = createFolderContextMenu({
      appSidebarLeft,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: rootScope.managers,
      className: 'folders-sidebar__folder-item',
      listenTo: folderItemsContainer
    });

    onCleanup(() => {
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
                {...getFolderTitle(folderItem.filter)}
                ref={(el) => setFolderItemRefs({[id]: el})}
                selected={isSelected(id)}
                onClick={() => _onClick(id)}
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
  const [hasFoldersSidebar] = useHasFoldersSidebar();

  const dispose = render(() => (
    <HotReloadGuardProvider>
      <Show when={hasFoldersSidebar()}>
        <FoldersSidebarContent
          notificationsElement={notificationsElement}
        />
      </Show>
    </HotReloadGuardProvider>
  ), element);
  middleware.onDestroy(dispose);
}

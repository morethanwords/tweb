import {createEffect, createSelector, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import {createStore} from 'solid-js/store';
import {render} from 'solid-js/web';
import createFolderContextMenu from '@helpers/dom/createFolderContextMenu';
import {keepMe} from '@helpers/keepMe';
import {Middleware} from '@helpers/middleware';
import pause from '@helpers/schedulers/pause';
import Animated from '@helpers/solid/animations';
import classNames from '@helpers/string/classNames';
import {logger, LogTypes} from '@lib/logger';
import {REAL_FOLDERS} from '@appManagers/constants';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import useHasFoldersSidebar from '@stores/foldersSidebar';
import useFolders from '@stores/folders';
import appChatBackground from '@components/chat/bubbles/chatBackground';
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

  // Tracks whether a gradient renderer is currently active. When false (image-only wallpapers)
  // we fall back to backdrop-filter via a CSS class so the bar still has some translucency.
  const [hasGradient, setHasGradient] = createSignal(false);
  // Night-style dark patterns darken the visible chat via a black mask, but the mirror copies only
  // the (bright) raw gradient — so the bar needs an extra-dark tint to match. Tinted/light don't.
  const [isDarkPattern, setIsDarkPattern] = createSignal(false);
  let backgroundCanvas: HTMLCanvasElement;

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

    appSidebarLeft.createToolsMenu(_menuTarget, {top: 8, left: 48});
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

    // Mirror the chat-background gradient into our own canvas — cheap stand-in for
    // backdrop-filter: blur(40px). The bar always sits over the chat background, so the visible
    // result of a heavy blur over that area is mathematically close to the gradient itself
    // (the high-frequency pattern blurs to a near-constant tint that we approximate via the
    // dark overlay). Falls back to backdrop-filter when no gradient is active.
    let detachMirror: (() => void) | undefined;
    const unsubscribeRenderer = appChatBackground.onActiveGradientRendererChange((renderer, meta) => {
      detachMirror?.();
      detachMirror = undefined;
      if(renderer && backgroundCanvas) {
        detachMirror = renderer.attachMirror(backgroundCanvas);
        setHasGradient(true);
      } else {
        setHasGradient(false);
      }
      setIsDarkPattern(!!meta?.isDarkMaskPattern);
    });

    onCleanup(() => {
      contextMenu.destroy();
      unsubscribeRenderer();
      detachMirror?.();
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
      <div class={classNames(
        'folders-sidebar__background',
        !hasGradient() && 'folders-sidebar__background--no-gradient',
        isDarkPattern() && 'folders-sidebar__background--dark-pattern'
      )}>
        <canvas ref={backgroundCanvas} class="folders-sidebar__background-gradient" />
        <div class="folders-sidebar__background-tint" />
      </div>
      <FolderItem ref={setMenuTarget} class="folders-sidebar__menu-button is-first" icon="menu" />

      <div class="folders-sidebar__scrollable-position">
        <Scrollable
          ref={folderItemsContainer}
          class="folders-sidebar__scrollable no-scrollbar"
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
        class="folders-sidebar__menu-button is-last"
        icon="equalizer"
        onClick={() => {
          if(openingChatFolders || appSidebarLeft.getTab(AppChatFoldersTab)) return;
          openingChatFolders = true;
          appSidebarLeft.closeTabsBefore(() => {
            const tab = appSidebarLeft.createTab(AppChatFoldersTab);
            tab.open(AppChatFoldersTab.getInitArgs()).finally(() => {
              openingChatFolders = false;
            });
          });
        }}
      />
    </>
  );
}

export function renderFoldersSidebarContent(
  parentEl: HTMLElement,
  notificationsElement: HTMLElement,
  HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider,
  middleware: Middleware
) {
  const [hasFoldersSidebar] = useHasFoldersSidebar();

  const foldersSidebar = document.createElement('div');
  foldersSidebar.id = 'folders-sidebar';
  foldersSidebar.className = 'folders-sidebar sidebar-left-common';
  parentEl.insertBefore(foldersSidebar, parentEl.firstChild);

  const dispose = render(() => (
    <HotReloadGuardProvider>
      <Show when={hasFoldersSidebar()}>
        <FoldersSidebarContent
          notificationsElement={notificationsElement}
        />
      </Show>
    </HotReloadGuardProvider>
  ), foldersSidebar);

  middleware.onDestroy(() => {
    dispose();
    foldersSidebar.remove();
  });
}

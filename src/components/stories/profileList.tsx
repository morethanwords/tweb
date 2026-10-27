import {Accessor, createEffect, createSignal, For, JSX, createMemo, on, onCleanup, untrack, createReaction, Show, Switch, Match} from 'solid-js';
import {getOverlayRoot} from '@helpers/appWindow';
import {Portal} from 'solid-js/web';
import {Document, MessageMedia, Photo, StoryItem} from '@layer';
import wrapStoryGridItem from '@components/stories/gridItem';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import {StoriesContext, useStories, createStoriesStore, StoriesContextState, StoriesContextActions} from '@components/stories/store';
import Sortable, {PRESSABLE_DRAG_THRESHOLD, SortableAxis} from '@helpers/dom/sortable';
import getSortableRun from '@helpers/dom/sortableRun';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import getInlineArrowKeys from '@helpers/dom/getInlineArrowKeys';
import {isElementRTL} from '@helpers/dom/isDocumentRTL';
import createMiddleware from '@helpers/solid/createMiddleware';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import type {ScrollableBase} from '@components/scrollable';
import {AppManagers} from '@lib/managers';
import Icon from '@components/icon';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import I18n, {i18n} from '@lib/langPack';
import Modes from '@config/modes';
import classNames from '@helpers/string/classNames';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {PreloaderTsx} from '@components/putPreloader';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import Scrollable from '@components/scrollable';
import {AnimationList} from '@helpers/solid/animationList';
import {doubleRaf} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n';
import ButtonTsx from '@components/buttonTsx';
import {StoriesSelection, toastStoryPinnedToProfile} from './selection';
import {ButtonMenuSync} from '@components/buttonMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import cancelClickOrNextIfNotClick from '@helpers/dom/cancelClickOrNextIfNotClick';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import SidebarSlider from '../slider';
import InputField from '@components/inputField';
import confirmationPopup from '@components/confirmationPopup';
import showChooseStoryPopup from '@components/popups/chooseStoryPopup';
import {createAddToAlbumSubmenuTrigger, openCreateAlbumPopup} from '@components/stories/albums';
import showStoriesStealthModePopup from '@components/popups/storiesStealthMode';
import {toastNew} from '@components/toast';
import {IconTsx} from '@components/iconTsx';
import LottieAnimation from '@components/lottieAnimation';
import Tabs from '@components/tabs';
import lottieLoader from '@lib/lottie/lottieLoader';
import {copyTextToClipboard} from '@helpers/clipboard';
import {handleShareStory, makeStoryLink} from './share';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import verifyMenuItem from '@helpers/verifyMenuItem';

const ALL_ALBUMS_ID = -1;
const ADD_ALBUM_ID = -2;

const TEST_ONE = false;
const TEST_TWO = false;

/** Carried by a story tile or an album chip that can be dragged to a new place right now */
const REORDERABLE_CLASS_NAME = 'is-reorderable';
const ALBUM_CHIP_CLASS_NAME = 'stories-album-chip';

/**
 * The mode the owner of a profile's stories rearranges them in, as on iOS and Android: the stories
 * of an album, and the albums themselves. Each move is saved as it is dropped, so leaving the mode
 * has nothing left to save. The stories pinned to the top are not among them, unlike there: the
 * server keeps those newest first whatever order it is sent.
 */
type StoriesReorder = {
  active: Accessor<boolean>,
  start: () => void,
  stop: () => void,
  /** whether the stories of the list shown now can be moved: those of an album */
  canMoveStories: () => boolean,
  /** the album's stories, in their new order - of the album they were dragged in, which may be left by now */
  moveStories: (albumId: number, ids: number[]) => void,
  moveAlbums: (ids: number[]) => void
};

function createStoriesReorder({peerId, state, actions, selection, managers}: {
  peerId: PeerId,
  state: StoriesContextState,
  actions: StoriesContextActions,
  selection?: StoriesSelection,
  managers: AppManagers
}): StoriesReorder {
  const [active, setActive] = createSignal(false);
  let navigationItem: NavigationItem;

  const stop = () => {
    if(navigationItem) {
      appNavigationController.removeItem(navigationItem);
      navigationItem = undefined;
    }

    setActive(false);
  };

  onCleanup(stop);

  // * a selection started from the header's menu takes the bar and the presses over
  createEffect(() => {
    if(selection?.selecting()) {
      untrack(stop);
    }
  });

  const onError = () => toastNew({langPackKey: 'Error.AnError'});

  return {
    active,
    start: () => {
      if(active()) {
        return;
      }

      if(selection?.isSelecting) {
        selection.cancelSelection();
      }

      setActive(true);
      // * Escape and the back gesture leave it, as they leave a selection
      if(!IS_MOBILE_SAFARI) {
        appNavigationController.pushItem(navigationItem = {
          type: 'multiselect',
          onPop: () => {
            navigationItem = undefined;
            setActive(false);
          }
        });
      }
    },
    stop,
    canMoveStories: () => state.albumId !== undefined,
    moveStories: (albumId, ids) => {
      if(state.albumId === albumId) {
        actions.reorder({stories: ids});
      }

      managers.appStoriesManager.reorderAlbumStories(peerId, albumId, ids)?.catch(onError);
    },
    moveAlbums: (ids) => {
      actions.reorder({albums: ids});
      managers.appStoriesManager.reorderAlbums(peerId, ids)?.catch(onError);
    }
  };
}

/**
 * Whether a touch starts on a story tile that is being rearranged: what follows is a drag across the grid,
 * which a swipe between the tabs or albums around it must leave alone
 */
export function isStoryReorderTarget(target: EventTarget) {
  return !!(target as HTMLElement).closest?.(`.search-super-item.${REORDERABLE_CLASS_NAME}`);
}

/** The ids of a run of items, `dataset[key]`, with the one at `from` put at `to` */
function moveInRun(items: HTMLElement[], from: number, to: number, key: 'mid' | 'value') {
  const ids = items.map((item) => +item.dataset[key]);
  ids.splice(to, 0, ...ids.splice(from, 1));
  return ids;
}

/**
 * Lets the elements of a list be put in a new order by dragging them while the reorder is on, and
 * with the layer, by Alt and an arrow along the line - one place at a time, focus kept on the moved
 * element. Only the ones carrying `REORDERABLE_CLASS_NAME` take part, and only in their run.
 */
function attachStoriesReorder({list, axis, scrollable, reorder, key, onMove}: {
  list: HTMLElement,
  axis: SortableAxis,
  scrollable: Pick<ScrollableBase, 'container'>,
  reorder: StoriesReorder,
  key: 'mid' | 'value',
  onMove: (ids: number[]) => void
}) {
  const sortable = new Sortable({
    list,
    axis,
    scrollable,
    middleware: createMiddleware().get(),
    // * a press on a tile opens the story and on a chip the album: a click is not a drag
    threshold: PRESSABLE_DRAG_THRESHOLD,
    // * the list renders its order from the store, which is put in the new one on the drop
    moveInDom: false,
    sortableClassName: REORDERABLE_CLASS_NAME,
    enabled: reorder.active,
    onSort: (prevIdx, newIdx, {items, from, to}) => onMove(moveInRun(items, from, to, key))
  });

  // * Escape or back can end the mode with an element still held: it goes back, and nothing is saved
  createEffect(on(reorder.active, (active) => {
    if(!active) {
      sortable.cancel();
    }
  }, {defer: true}));

  const onKeyDown = (e: KeyboardEvent) => {
    if(!Modes.a11y || !reorder.active() || !e.altKey || e.defaultPrevented) {
      return;
    }

    const {next, previous} = getInlineArrowKeys(isElementRTL(list));
    const step = e.key === next ? 1 : e.key === previous ? -1 : 0;
    const item = findUpAsChild(e.target as HTMLElement, list);
    if(!step || !item?.classList.contains(REORDERABLE_CLASS_NAME)) {
      return;
    }

    e.preventDefault();
    const items = getSortableRun(item, REORDERABLE_CLASS_NAME);
    const from = items.indexOf(item);
    const to = from + step;
    if(to < 0 || to >= items.length) {
      return;
    }

    onMove(moveInRun(items, from, to, key));
    // * the element is moved in the document, which takes the focus off it
    item.focus();
  };

  list.addEventListener('keydown', onKeyDown);
  onCleanup(() => list.removeEventListener('keydown', onKeyDown));
}

class StoriesContextMenu {
  private buttons: ButtonMenuItemOptionsVerifiable[];
  private element: HTMLElement;
  private target: HTMLElement;
  private peerId: PeerId;
  private mid: number;
  private isSelected: boolean;
  private storyItem: StoryItem.storyItem;

  constructor(
    private attachTo: HTMLElement,
    private selection: StoriesSelection | undefined,
    private listenerSetter: ListenerSetter,
    private state: StoriesContextState,
    private reorder?: StoriesReorder
  ) {
    attachContextMenuListener({
      element: attachTo,
      callback: (e) => {
        // * a long press is what picks a tile up while they are being rearranged
        if(reorder?.active()) {
          return;
        }

        if(this.init) {
          this.init();
          this.init = null;
        }

        let item: HTMLElement;
        try {
          item = findUpClassName(e.target, 'search-super-item');
        } catch(e) {}

        if(!item) return;

        if(!('touches' in e)) e.preventDefault(); // cross-realm-safe mouse check (Document PiP window)
        if(this.element.classList.contains('active')) {
          return false;
        }
        if(!('touches' in e)) e.cancelBubble = true;

        const r = async() => {
          this.target = item;
          this.peerId = item.dataset.peerId.toPeerId();
          this.mid = +item.dataset.mid;
          this.isSelected = selection?.isMidSelected(this.peerId, this.mid);
          this.storyItem = await rootScope.managers.appStoriesManager.getStoryById(this.peerId, this.mid);

          const f = await Promise.all(this.buttons.map(async(button) => {
            const good = await verifyMenuItem(button);
            button.element.classList.toggle('hide', !good);
            return good;
          }));

          if(!f.some((v) => v)) {
            return;
          }

          item.classList.add('menu-open');

          positionMenu(e, this.element);
          contextMenuController.openBtnMenu(this.element, () => {
            item.classList.remove('menu-open');
          });
        };

        r();
      },
      listenerSetter
    });
  }

  private init() {
    const managers = bindManagersToSession(rootScope.managers);
    const getSelectedIds = () => {
      if(this.selection && this.selection.isSelecting) {
        return this.selection.getSelectedStoryIds(this.peerId);
      }
      return [this.storyItem.id];
    }
    const hasRightsOnSelected = (right: 'send' | 'edit' | 'delete' | 'archive' | 'pin') => {
      const ids = getSelectedIds();
      return managers.appStoriesManager.hasRightsMany(this.peerId, ids, right);
    }

    this.buttons = [{
      icon: 'archive',
      text: 'Archive',
      onClick: () => managers.appStoriesManager.togglePinned(this.peerId, [this.storyItem.id], false).then(() => toastStoryPinnedToProfile(managers, this.peerId, false)),
      verify: () => !this.state.albumId && this.storyItem?.pFlags.pinned && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: () => managers.appStoriesManager.togglePinned(this.peerId, [this.storyItem.id], true).then(() => toastStoryPinnedToProfile(managers, this.peerId, true)),
      verify: () => !this.state.albumId && this.storyItem && !this.storyItem.pFlags.pinned && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      onClick: () => managers.appStoriesManager.togglePinnedToTop(this.peerId, [this.storyItem.id], true).catch((err: ApiError) => {
        if(err.type === 'STORY_ID_TOO_MANY') {
          toastNew({langPackKey: 'StoriesPinLimit', langPackArguments: [+err.message]});
        }
      }),
      verify: () => !this.state.albumId && this.state.pinned && this.storyItem?.pinnedIndex === undefined && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: () => managers.appStoriesManager.togglePinnedToTop(this.peerId, [this.storyItem.id], false),
      verify: () => !this.state.albumId && this.state.pinned && this.storyItem?.pinnedIndex !== undefined && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'menu',
      text: 'Stories.Reorder',
      onClick: () => this.reorder.start(),
      verify: () => !!this.reorder && this.state.canEdit && this.reorder.canMoveStories()
    }, createAddToAlbumSubmenuTrigger({
      getPeerId: () => this.peerId,
      getStoryIds: getSelectedIds,
      getAlbums: () => this.state.peer?.albums,
      verify: () => !this.state.albumId && !!(this.state.peer?.albums?.length) && hasRightsOnSelected('edit'),
      listenerSetter: this.listenerSetter
    }), {
      icon: 'crossround',
      text: 'Stories.Albums.RemoveFromAlbum',
      onClick: () => {
        const albumId = this.state.albumId;
        const storyIds = getSelectedIds()
        if(this.selection.isSelecting) this.selection.cancelSelection();
        rootScope.managers.appStoriesManager.updateAlbum(this.peerId, albumId, {deleteStories: storyIds}).then(() => {
          toastNew({langPackKey: 'Stories.Albums.Removed', langPackArguments: [storyIds.length]});
        }).catch(() => {
          toastNew({langPackKey: 'Error.AnError'});
        });
      },
      verify: () => this.state.albumId !== undefined && hasRightsOnSelected('edit')
    }, {
      icon: 'link',
      text: 'CopyLink',
      onClick: async() => {
        const username = await rootScope.managers.appPeersManager.getPeerUsername(this.peerId);
        copyTextToClipboard(makeStoryLink(username, this.storyItem.id));
        toastNew({langPackKey: 'LinkCopied'});
      },
      verify: async() => {
        const username = await rootScope.managers.appPeersManager.getPeerUsername(this.peerId);
        return !!username;
      }
    }, {
      icon: 'forward',
      text: 'ShareFile',
      onClick: async() => {
        handleShareStory({
          story: this.storyItem,
          peerId: this.peerId
        });
      },
      verify: async() => {
        const username = await rootScope.managers.appPeersManager.getPeerUsername(this.peerId);
        if(!username) return false;

        const story = this.storyItem;
        return !!story.pFlags.public && (!story.pFlags.noforwards || !!username)
      }
    }, {
      icon: 'eyecross',
      text: 'Stories.StealthMode.View',
      onClick: () => {
        const {peerId} = this;
        const id = this.storyItem.id;
        showStoriesStealthModePopup({
          onActivate: () => {
            hotReloadGuard.createStoriesViewerWithPeer({peerId, id});
          }
        });
      },
      verify: () => this.peerId !== rootScope.myId
    }, {
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: () => this.selection.toggleByElement(this.target),
      verify: () => !!this.selection && !this.isSelected && this.state.canEdit
    }, {
      icon: 'select',
      text: 'Message.Context.Selection.Clear',
      onClick: () => this.selection.cancelSelection(),
      verify: () => !!this.selection && this.isSelected
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: () => this.selection.onDeleteStoriesClick([this.storyItem.id], this.peerId),
      verify: () => managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'delete')
    }];

    this.element = ButtonMenuSync({buttons: this.buttons, listenerSetter: this.listenerSetter});
    this.element.classList.add('search-contextmenu', 'contextmenu');
    getOverlayRoot().append(this.element);

    this.buttons.forEach((button) => button.onOpen?.());
  }
}

function StoriesAlbums(props: {
  selection?: StoriesSelection,
  onAlbumChange: (albumId: number | undefined) => void,
  peerId: PeerId,
  reorder?: StoriesReorder
}) {
  const [stories] = useStories();
  const reorder = props.reorder;
  const hasAlbums = () => stories.ready && stories.peer.albums && stories.peer.albums.length > 0;
  const chosenAlbumId = () => stories.albumId === undefined ? ALL_ALBUMS_ID : stories.albumId;

  const handleChange = (value: string) => {
    const albumId = Number(value);
    if(albumId === ADD_ALBUM_ID) {
      openCreateAlbumPopup(props.peerId).then((albumId) => {
        if(albumId !== undefined) props.onAlbumChange(albumId);
      });
      return false;
    }
    if(props.selection?.isSelecting) props.selection.cancelSelection()
    props.onAlbumChange(albumId === ALL_ALBUMS_ID ? undefined : albumId);
  }

  return (
    <Show when={hasAlbums()}>
      <ChipTabs
        class="search-super-content-stories-albums"
        value={chosenAlbumId().toString()}
        onChange={handleChange}
        view="surface"
        center
        needIntersectionObserver
        scrollableRef={reorder && ((list) => attachStoriesReorder({
          list,
          axis: 'x',
          scrollable: {container: list},
          reorder,
          key: 'value',
          onMove: reorder.moveAlbums
        }))}
        contextMenuButtons={async(id_) => {
          const id = Number(id_);
          // * a long press is what picks a chip up while they are being rearranged
          if(id === ALL_ALBUMS_ID || id === ADD_ALBUM_ID || reorder?.active()) return [];

          const album = stories.peer.albums?.find((a) => a.album_id === id);
          if(!album) return [];

          return [
            {
              icon: 'link',
              text: 'CopyLink',
              onClick: async() => {
                const username = await rootScope.managers.appPeersManager.getPeerUsername(props.peerId);
                copyTextToClipboard(`https://t.me/${username}/a/${id}`);
                toastNew({langPackKey: 'LinkCopied'});
              },
              verify: async() => {
                const username = await rootScope.managers.appPeersManager.getPeerUsername(props.peerId);
                return !!username;
              }
            },
            {
              icon: 'add',
              text: 'Stories.Albums.AddStories',
              verify: () => stories.canEdit,
              onClick: () => openAddToAlbumPopup(props.peerId, id)
            },
            {
              icon: 'edit',
              text: 'Stories.Albums.Rename',
              verify: () => stories.canEdit,
              onClick: async() => {
                const managers = bindManagersToSession(rootScope.managers);
                const inputField = new InputField({
                  maxLength: 64,
                  placeholder: 'Stories.Albums.CreatePlaceholder',
                  required: true
                });
                inputField.value = album.title;

                try {
                  await confirmationPopup({
                    titleLangKey: 'Stories.Albums.RenameTitle',
                    inputField,
                    button: {langKey: 'Edit'}
                  });
                } catch(e) {
                  return;
                }

                if(inputField.value === album.title) return;
                managers.appStoriesManager.updateAlbum(props.peerId, id, {title: inputField.value}).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'});
                });
              }
            },
            {
              icon: 'menu',
              text: 'Stories.Reorder',
              verify: () => !!reorder && stories.canEdit,
              onClick: () => reorder.start()
            },
            {
              icon: 'delete',
              text: 'Stories.Albums.Delete',
              verify: () => stories.canEdit,
              danger: true,
              onClick: async() => {
                const managers = bindManagersToSession(rootScope.managers);
                try {
                  await confirmationPopup({
                    titleLangKey: 'Stories.Albums.Delete',
                    descriptionLangKey: 'Stories.Albums.DeleteConfirm',
                    button: {langKey: 'Delete', isDanger: true}
                  });
                } catch(e) {
                  return;
                }

                managers.appStoriesManager.deleteAlbum(props.peerId, id).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'});
                });
              }
            }
          ];
        }}
      >
        <ChipTab value={ALL_ALBUMS_ID.toString()}>
          {i18n('StoryAlbumAll')}
        </ChipTab>
        <For each={stories.peer.albums}>
          {(album) => (
            <ChipTab
              class={classNames(ALBUM_CHIP_CLASS_NAME, reorder?.active() && REORDERABLE_CLASS_NAME)}
              value={album.album_id.toString()}
            >
              <span class="stories-album-chip-title">
                {wrapEmojiText(album.title)}
              </span>
            </ChipTab>
          )}
        </For>
        <Show when={stories.canEdit}>
          <ChipTab value={ADD_ALBUM_ID.toString()}>
            <IconTsx icon="add" />
            <I18nTsx key="Stories.Albums.AddAlbum" />
          </ChipTab>
        </Show>
      </ChipTabs>
    </Show>
  );
}

async function openAddToAlbumPopup(peerId: PeerId, albumId: number) {
  const managers = bindManagersToSession(rootScope.managers);
  const result = await new Promise<{added: number[], removed: number[]} | null>((resolve) => {
    showChooseStoryPopup({peerId, albumId, onFinish: resolve});
  });

  if(!result) return;
  const {added, removed} = result;
  if(!added.length && !removed.length) return;
  managers.appStoriesManager.updateAlbum(peerId, albumId, {
    addStories: added.length ? added : undefined,
    deleteStories: removed.length ? removed : undefined
  }).catch(() => {
    toastNew({langPackKey: 'Error.AnError'});
  });
}

function StoriesGrid(props: {
  scrollable: Scrollable,
  onReady?: () => void,
  peerId: PeerId,
  selection?: StoriesSelection,
  pinned: boolean,
  archive?: boolean,
  reorder?: StoriesReorder,
  onSetAlbumAnimated?: (fn: (albumId: number | undefined) => void) => void
}) {
  const [stories, actions] = useStories();
  const reorder = props.reorder;
  const [viewerId, setViewerId] = createSignal<number>();
  const items = new Map<number, HTMLElement>();

  createReaction(() => {
    props.onReady?.();
  })(() => stories.ready);

  createEffect(() => {
    const id = viewerId();
    if(!id) {
      return;
    }

    const onExit = () => {
      setViewerId(undefined);
    };

    const target = createMemo(() => {
      const storyId = stories.peer.stories[stories.peer.index].id;
      return items.get(storyId);
    });

    untrack(() => {
      const peer = stories.peer;
      const index = peer.stories.findIndex((story) => story.id === id);
      actions.set({peer, index});
    });

    hotReloadGuard.createStoriesViewer({
      onExit,
      target,
      splitByDays: true
    });
  });

  const Item = (storyItem: StoryItem) => {
    const {container, div, media, thumb} = wrapStoryGridItem({
      peerId: stories.peer.peerId,
      storyItem: storyItem as StoryItem.storyItem,
      onClick: () => {
        // * the tiles are being rearranged, not watched
        if(reorder?.active()) {
          return;
        }

        setViewerId(storyItem.id);
      },
      own: () => stories.canEdit,
      pinned: () => props.pinned && !stories.albumId && (storyItem as StoryItem.storyItem).pinnedIndex !== undefined
    });

    createEffect(() => {
      div.classList.toggle(REORDERABLE_CLASS_NAME, !!reorder?.active() && reorder.canMoveStories());
    });

    createEffect(() => {
      const t = thumb();
      const m = media();
      const element = m || t;
      if(!element) {
        return;
      }

      items.set(storyItem.id, element);
      onCleanup(() => {
        items.delete(storyItem.id);
      });

      if(stories.peer.stories.length === 1) {
        const messageMedia = (storyItem as StoryItem.storyItem).media;
        const media = (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo || (messageMedia as MessageMedia.messageMediaDocument).document as Document.document;
        const gotThumb = getMediaThumbIfNeeded({
          photo: media,
          cacheContext: {type: 'x', url: '', downloaded: 0},
          useBlur: true,
          ignoreCache: true,
          onlyStripped: true
        });
        if(gotThumb && element.parentElement) {
          const thumb = gotThumb.image as HTMLCanvasElement;
          element.parentElement.prepend(thumb);

          // need img for clone animation to work
          gotThumb.loadPromise.then(() => {
            const img = document.createElement('img');
            img.alt = '';
            img.className = thumb.className;
            img.src = thumb.toDataURL();
            thumb.replaceWith(img);
          });

          onCleanup(() => {
            thumb.remove();
          });
        }
      }
    });

    // * on the tile itself: a video's own element is not on it until it plays
    let archiveIcon: HTMLElement;
    createEffect(() => {
      if(props.archive && !(storyItem as StoryItem.storyItem).pFlags.pinned) {
        archiveIcon ??= Icon('hide', 'grid-item-archived');
        div.append(archiveIcon);
      } else if(archiveIcon) {
        archiveIcon.remove();
      }
    });

    if(props.selection?.isSelecting) {
      props.selection.toggleElementCheckbox(div, true);
    }

    return container;
  };

  const isEmpty = () => stories.peer?.stories?.length === 0;
  const isLoading = () => !stories.ready || (!stories.loaded && isEmpty())

  const SLIDE_DURATION = 250;
  const SLIDE_EASING = 'cubic-bezier(.4, 0, .2, 1)';

  const [direction, setDirection] = createSignal(0);
  let scrollDiff = 0;

  const slideKeyframes = (_element: Element, removed: boolean): Keyframe[] => {
    // * the album chips run the other way in RTL, and the albums slide in from the side of theirs
    const dir = direction() * (I18n.getIsRTL() ? -1 : 1);
    const yOffset = scrollDiff ? ` translateY(${scrollDiff}px)` : '';
    if(removed) {
      // AnimationList reverses these for exit; Y offset compensates scroll change
      return [
        {transform: `translateX(${-dir * 100}%)${yOffset}`},
        {transform: `translateX(0)${yOffset}`}
      ];
    }
    return [{transform: `translateX(${dir * 100}%)`}, {transform: 'translateX(0)'}];
  };

  const scrollPositions = new Map<number | undefined, number>();
  let wrapperRef!: HTMLDivElement;

  const getScrollBase = () => {
    const searchSuper = wrapperRef?.closest('.search-super') as HTMLElement;
    if(!searchSuper) return 0;
    // 0 for "my stories" tab
    return searchSuper.offsetTop === 0 ? 0 : searchSuper.offsetTop - 56;
  };

  const setAlbumIdAnimated = (albumId: number | undefined) => {
    const albums = stories.peer?.albums;
    const oldIndex = stories.albumId === undefined ? -1 :
      (albums?.findIndex((a) => a.album_id === stories.albumId) ?? -1);
    const newIndex = albumId === undefined ? -1 :
      (albums?.findIndex((a) => a.album_id === albumId) ?? -1);
    const dir = newIndex > oldIndex ? 1 : newIndex < oldIndex ? -1 : 0;

    const scrollable = props.scrollable.container;
    const scrollBase = getScrollBase();
    const oldScrollTop = scrollable.scrollTop;
    const oldScroll = oldScrollTop - scrollBase;
    if(oldScroll >= 0) {
      scrollPositions.set(stories.albumId, Math.max(0, oldScroll));
    }

    if(dir) setDirection(dir);
    actions.setAlbumId(albumId);

    // restore scroll immediately (before paint) and compensate via keyframes Y offset
    const newScroll = scrollPositions.get(albumId) ?? 0;
    const targetScrollTop = scrollBase + newScroll;
    if(oldScroll >= 0) {
      scrollDiff = targetScrollTop - oldScrollTop;
      scrollable.scrollTop = targetScrollTop;
    } else {
      scrollDiff = 0;
      const searchSuper = wrapperRef?.closest('.search-super') as HTMLElement;
      if(searchSuper) {
        fastSmoothScroll({
          element: searchSuper,
          container: scrollable,
          position: 'center',
          axis: 'y',
          getElementPosition: ({elementPosition}) => {
            return elementPosition - 24;
          }
        });
      }
    }
  };

  props.onSetAlbumAnimated?.(setAlbumIdAnimated);

  // memo keyed on albumId: creates a new element per album so AnimationList can animate the swap
  const albumContent = createMemo(() => {
    stories.albumId;
    return untrack(() => (
      <div class="stories-album-content">
        <Switch>
          <Match when={isLoading()}>
            <div class="grid-album-placeholder">
              <PreloaderTsx />
            </div>
          </Match>
          <Match when={isEmpty() && stories.albumId !== undefined}>
            <div class="grid-album-placeholder">
              <LottieAnimation
                lottieLoader={lottieLoader}
                name="UtyanStories"
                class="sticker-container"
              />
              <I18nTsx key="Stories.Albums.EmptyTitle" class="title" />
              <I18nTsx key="Stories.Albums.EmptySubtitle" class="subtitle" />
              <ButtonTsx
                class="btn-primary btn-color-primary btn-control"
                text="Stories.Albums.AddToAlbum"
                onClick={() => openAddToAlbumPopup(props.peerId, stories.albumId)}
              />
            </div>
          </Match>
          <Match when={true}>
            <div
              ref={(list) => reorder && stories.albumId !== undefined && attachStoriesReorder({
                list,
                axis: 'grid',
                scrollable: props.scrollable,
                reorder,
                key: 'mid',
                // * the grid is the album's own: a drop that lands after another is chosen still goes to it
                onMove: reorder.moveStories.bind(null, stories.albumId)
              })}
              class="grid"
              classList={{two: stories.peer.stories.length === 2, one: stories.peer.stories.length === 1}}
            >
              <For each={stories.peer.stories}>{Item}</For>
            </div>
          </Match>
        </Switch>
      </div>
    ));
  });

  return (
    <div ref={wrapperRef} class="stories-album-wrapper">
      <AnimationList
        animationOptions={{duration: SLIDE_DURATION, easing: SLIDE_EASING}}
        keyframes={slideKeyframes}
        mode="replacement"
      >
        {albumContent()}
      </AnimationList>
    </div>
  );
}

function StoriesSelectionToolbar(props: {
  selection: StoriesSelection,
  albumId?: number,
  peerId?: PeerId,
  pinned?: boolean,
  mount?: HTMLElement,
  reorder?: StoriesReorder
}) {
  const shown = () => props.selection.selecting() || !!props.reorder?.active();
  // * the bar fades out with what it was showing, not with what it shows when there is nothing
  const reordering = createMemo<boolean>((was) => {
    const selecting = props.selection.selecting(), reordering = !!props.reorder?.active();
    return selecting || reordering ? reordering : was;
  }, false);

  const reorderContent = (
    <div class="search-super-selection-container">
      <div class="search-super-selection-count search-super-reorder-title">
        <I18nTsx key="Stories.Reorder" />
      </div>
      <ButtonTsx
        icon="check"
        class="btn-icon primary"
        aria-label={I18n.format('Done', true)}
        onClick={() => props.reorder.stop()}
      />
    </div>
  );

  const selectionContent = (
    <div class="search-super-selection-container">
      <ButtonTsx
        icon="close"
        class="search-super-selection-cancel btn-icon"
        aria-label={I18n.format('Close', true)}
        onClick={() => props.selection.cancelSelection()}
      />
      <div class="search-super-selection-count">
        <I18nTsx key="StoriesCount" args={[String(props.selection.count())]} />
      </div>
      <Show when={props.albumId !== undefined}>
        <ButtonTsx
          icon="crossround"
          class="search-super-selection-remove btn-icon"
          aria-label={I18n.format('Stories.Albums.RemoveFromAlbum', true)}
          onClick={() => {
            const mids = props.selection.selectedMids.get(props.peerId);
            if(mids?.size) {
              const count = mids.size;
              rootScope.managers.appStoriesManager.updateAlbum(props.peerId, props.albumId, {deleteStories: [...mids]}).then(() => {
                toastNew({langPackKey: 'Stories.Albums.Removed', langPackArguments: [count]});
              }).catch(() => {
                toastNew({langPackKey: 'Error.AnError'});
              });
            }
            props.selection.cancelSelection();
          }}
        />
      </Show>
      <Show when={props.pinned && !props.albumId && !props.selection.cantPin()}>
        <ButtonTsx
          icon="pin"
          class="search-super-selection-pintotop btn-icon"
          aria-label={I18n.format('PinMessage', true)}
          onClick={() => props.selection.onPinStoriesToTopClick(undefined, true)}
        />
      </Show>
      <Show when={!props.selection.cantPin()}>
        <ButtonTsx
          icon={props.selection.isStoriesArchive ? 'unarchive' : 'archive'}
          class="search-super-selection-pin btn-icon"
          aria-label={I18n.format(props.selection.isStoriesArchive ? 'Unarchive' : 'Archive', true)}
          onClick={() => props.selection.onPinStoriesClick(undefined, props.selection.isStoriesArchive)}
        />
      </Show>
      <Show when={!props.selection.cantDelete()}>
        <ButtonTsx
          icon="delete"
          class="search-super-selection-delete btn-icon danger"
          aria-label={I18n.format('Delete', true)}
          onClick={() => props.selection.onDeleteStoriesClick()}
        />
      </Show>
    </div>
  );

  const content = (
    <Show when={reordering()} fallback={selectionContent}>
      {reorderContent}
    </Show>
  );

  // * the plate shows the bar only while it goes `forwards`, as the transitions of a selection leave it
  if(props.mount) {
    const setShown = (selecting: boolean) => {
      props.mount.classList.toggle('is-selecting', selecting);
      props.mount.classList.toggle('forwards', selecting);
      props.mount.classList.toggle('backwards', !selecting);
    };

    let wasShown = false;
    createEffect(() => setShown(wasShown = shown()));
    // * the mount is the profile's own tab row, which outlives the list: it is handed back as it is when
    // * nothing is selected
    onCleanup(() => {
      if(wasShown) {
        setShown(false);
      }
    });

    return <Portal mount={props.mount}>{content}</Portal>;
  }

  // with nowhere to mount into, the toolbar brings the plate the search tabs would have sat on
  return (
    <Tabs.MenuShell
      class="search-super-tabs-scrollable sticky is-single search-super-selection-plate"
      classList={{'is-selecting': shown(), 'forwards': shown(), 'backwards': !shown()}}
    >
      {content}
    </Tabs.MenuShell>
  );
}

export function profileStoriesButtonMenu(props: {
  peerId: PeerId,
  slider: SidebarSlider,
  verify: () => boolean,
  isArchive?: boolean,
  onAlbumCreated?: (albumId: number) => void,
  canEdit?: () => boolean | Promise<boolean>,
}): ButtonMenuItemOptionsVerifiable[] {
  return [{
    icon: 'archive',
    text: 'MyStories.ShowArchive',
    onClick: () => {
      props.slider.createTab(hotReloadGuard.tabs.AppMyStoriesTab).open({
        ...hotReloadGuard.tabs.AppMyStoriesTab.getInitArgs(),
        isArchive: true,
        chatId: props.peerId.isAnyChat() ? props.peerId.toChatId() : undefined
      });
    },
    verify: () => Promise.resolve(props.canEdit?.() ?? true).then((canEdit) => (
      props.verify() &&
      !props.isArchive &&
      canEdit
    ))
  }, {
    icon: 'folder',
    text: 'Stories.Albums.CreateAlbum',
    onClick: async() => {
      const albumId = await openCreateAlbumPopup(props.peerId);
      if(albumId !== undefined) props.onAlbumCreated?.(albumId);
    },
    verify: () => Promise.resolve(props.canEdit?.() ?? true).then((canEdit) => (
      props.verify() &&
      !props.isArchive &&
      canEdit
    ))
  }];
}

export function StoriesProfileList(props: {
  class?: string,
  peerId: PeerId
  pinned?: boolean
  archive?: boolean
  initialAlbumId?: number
  scrollable: Scrollable
  listenerSetter: ListenerSetter
  withSelection?: boolean
  forPicker?: boolean
  selectionMount?: HTMLElement
  onCountChange?: (count: number) => void
  onReady?: () => void
  onLoad?: (loaded: boolean) => void
}) {
  const contextValue = createStoriesStore({
    peerId: props.peerId,
    pinned: props.pinned,
    archive: props.archive,
    initialAlbumId: props.initialAlbumId,
    manualLoad: true,
    onLoad: props.onLoad
  });
  const [state, actions] = contextValue;

  createEffect(() => {
    const count = state.peer?.count ?? 0;
    if(state.albumId === undefined) {
      props.onCountChange?.(count);
    }
  });

  const managers = bindManagersToSession(rootScope.managers);
  const selection = props.withSelection ? new StoriesSelection({
    container: props.scrollable.container,
    managers,
    listenerSetter: props.listenerSetter,
    isArchive: props.archive,
    chatId: props.peerId.isAnyChat() ? props.peerId.toChatId() : undefined,
    forPicker: props.forPicker
  }) : undefined;

  // * a profile's own stories, where the bar that leaves the mode has a place
  const reorder = props.pinned && selection && !props.forPicker ? createStoriesReorder({
    peerId: props.peerId,
    state,
    actions,
    selection,
    managers
  }) : undefined;

  let setAlbumAnimated!: (albumId: number | undefined) => void;
  let containerRef!: HTMLDivElement;

  const render = (
    <StoriesContext.Provider value={contextValue}>
      <div ref={containerRef} class="search-super-content-container search-super-content-stories">
        {props.pinned && !props.forPicker && (
          <StoriesAlbums
            selection={selection}
            onAlbumChange={(id) => setAlbumAnimated?.(id)}
            peerId={props.peerId}
            reorder={reorder}
          />
        )}
        <StoriesGrid
          scrollable={props.scrollable}
          onReady={() => {
            new StoriesContextMenu(
              containerRef,
              selection,
              props.listenerSetter,
              state,
              reorder
            );

            if(selection) {
              attachClickEvent(containerRef, (e) => {
                if(selection.isSelecting) {
                  const item = findUpClassName(e.target, 'search-super-item');
                  if(!item) return;
                  selection.cancelElementClick(e, item, cancelClickOrNextIfNotClick);
                  selection.toggleByElement(item);
                }
              }, {capture: true, passive: false, listenerSetter: props.listenerSetter});
            }
            props.onReady?.();
          }}
          peerId={props.peerId}
          selection={selection}
          pinned={props.pinned}
          archive={props.archive}
          reorder={reorder}
          onSetAlbumAnimated={(fn) => setAlbumAnimated = fn}
        />
        {selection && !props.forPicker && (
          <StoriesSelectionToolbar
            selection={selection}
            albumId={state.albumId}
            peerId={props.peerId}
            pinned={props.pinned}
            mount={props.selectionMount}
            reorder={reorder}
          />
        )}
      </div>
    </StoriesContext.Provider>
  );

  return {
    render,
    state,
    actions,
    selection,
    setAlbum: (albumId: number | undefined, skipAnimation = false) => {
      if(!skipAnimation) {
        setAlbumAnimated(albumId);
        return;
      }
      actions.setAlbumId(albumId);
    }
  }
}

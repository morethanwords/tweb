/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, For, JSX, createMemo, onCleanup, untrack, createReaction, Show, Switch, Match} from 'solid-js';
import {Portal} from 'solid-js/web';
import {createStoriesViewer} from '@components/stories/viewer';
import {Document, MessageMedia, Photo, StoryItem} from '@layer';
import {wrapStoryMedia} from '@components/stories/preview';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import {StoriesContext, useStories, createStoriesStore, StoriesContextState} from '@components/stories/store';
import Icon from '@components/icon';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {PreloaderTsx} from '@components/putPreloader';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import Scrollable from '@components/scrollable';
import {AnimationList} from '@helpers/solid/animationList';
import {doubleRaf} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n';
import ButtonTsx from '@components/buttonTsx';
import {StoriesSelection, toastStoryPinnedToProfile} from './selection';
import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import CheckboxField from '@components/checkboxField';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import rootScope from '@lib/rootScope';
import ListenerSetter from '@helpers/listenerSetter';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import cancelClickOrNextIfNotClick from '@helpers/dom/cancelClickOrNextIfNotClick';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import AppMyStoriesTab from '../sidebarLeft/tabs/myStories';
import SidebarSlider from '../slider';
import InputField from '@components/inputField';
import confirmationPopup from '@components/confirmationPopup';
import PopupElement from '@components/popups';
import PopupChooseStory from '@components/popups/chooseStoryPopup';
import createSubmenuTrigger from '@components/createSubmenuTrigger';
import {toastNew} from '@components/toast';
import {IconTsx} from '@components/iconTsx';
import {copyTextToClipboard} from '@helpers/clipboard';
import {handleShareStory} from './share';
import wrapPeerTitle from '../wrappers/peerTitle';

const ALL_ALBUMS_ID = -1;
const ADD_ALBUM_ID = -2;

const TEST_ONE = false;
const TEST_TWO = false;

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
    private state: StoriesContextState
  ) {
    attachContextMenuListener({
      element: attachTo,
      callback: (e) => {
        if(this.init) {
          this.init();
          this.init = null;
        }

        let item: HTMLElement;
        try {
          item = findUpClassName(e.target, 'search-super-item');
        } catch(e) {}

        if(!item) return;

        if(e instanceof MouseEvent) e.preventDefault();
        if(this.element.classList.contains('active')) {
          return false;
        }
        if(e instanceof MouseEvent) e.cancelBubble = true;

        const r = async() => {
          this.target = item;
          this.peerId = item.dataset.peerId.toPeerId();
          this.mid = +item.dataset.mid;
          this.isSelected = selection?.isMidSelected(this.peerId, this.mid);
          this.storyItem = await rootScope.managers.appStoriesManager.getStoryById(this.peerId, this.mid);

          const f = await Promise.all(this.buttons.map(async(button) => {
            const good = button.verify ? !!(await button.verify()) : true;
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
    const managers = rootScope.managers;
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
    }, createSubmenuTrigger({
      options: {
        icon: 'folder',
        text: 'Stories.Albums.AddToAlbum',
        verify: () => !this.state.albumId && !!(this.state.peer?.albums?.length) && hasRightsOnSelected('edit')
      },
      createSubmenu: async() => {
        const selectedIds = getSelectedIds();
        const selectedStories = await managers.appStoriesManager.getStoriesById(this.peerId, selectedIds);

        const buttons: ButtonMenuItemOptions[] = this.state.peer?.albums.map((album) => {
          const checkboxField = new CheckboxField({
            checked: selectedStories.every((story) => {
              return story?._ === 'storyItem' && !!story.albums?.includes(album.album_id);
            })
          });

          const span = document.createElement('span');
          span.classList.add('stories-album-title');
          span.append(wrapEmojiText(album.title));

          return {
            textElement: span,
            onClick: () => {
              const wasChecked = checkboxField.checked;
              checkboxField.checked = !wasChecked;
              rootScope.managers.appStoriesManager.updateAlbum(this.peerId, album.album_id, {
                [wasChecked ? 'deleteStories' : 'addStories']: selectedIds
              }).catch(() => {
                checkboxField.checked = wasChecked;
                toastNew({langPackKey: 'Error.AnError'});
              });
            },
            checkboxField,
            noCheckboxClickListener: true,
            keepOpen: true
          };
        });

        return ButtonMenuSync({buttons, listenerSetter: this.listenerSetter});
      }
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
        copyTextToClipboard(`https://t.me/${username}/s/${this.storyItem.id}`);
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
          peerId: this.peerId,
          onSend: async(toPeerId: PeerId) => {
            toastNew({
              langPackKey: toPeerId === rootScope.myId ? 'StorySharedToSavedMessages' : 'StorySharedTo',
              langPackArguments: [await wrapPeerTitle({peerId: toPeerId})]
            })
          }
        });
      },
      verify: async() => {
        const username = await rootScope.managers.appPeersManager.getPeerUsername(this.peerId);
        if(!username) return false;

        const story = this.storyItem;
        return !!story.pFlags.public && (!story.pFlags.noforwards || !!username)
      }
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
    document.body.append(this.element);

    this.buttons.forEach((button) => button.onOpen?.());
  }
}

async function openCreateAlbumPopup(peerId: PeerId): Promise<number | undefined> {
  const inputField = new InputField({
    maxLength: 64,
    placeholder: 'Stories.Albums.CreatePlaceholder',
    required: true
  });

  try {
    await confirmationPopup({
      titleLangKey: 'Stories.Albums.CreateTitle',
      inputField,
      button: {langKey: 'Create'}
    });
  } catch(e) {
    return;
  }

  const album = await rootScope.managers.appStoriesManager.createAlbum(peerId, inputField.value);
  return album.album_id;
}

function StoriesAlbums(props: {
  selection?: StoriesSelection,
  onAlbumChange: (albumId: number | undefined) => void,
  peerId: PeerId
}) {
  const [stories] = useStories();
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
        contextMenuButtons={async(id_) => {
          const id = Number(id_);
          if(id === ALL_ALBUMS_ID || id === ADD_ALBUM_ID) return [];

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
                rootScope.managers.appStoriesManager.updateAlbum(props.peerId, id, {title: inputField.value}).catch(() => {
                  toastNew({langPackKey: 'Error.AnError'});
                });
              }
            },
            {
              icon: 'delete',
              text: 'Stories.Albums.Delete',
              verify: () => stories.canEdit,
              danger: true,
              onClick: async() => {
                try {
                  await confirmationPopup({
                    titleLangKey: 'Stories.Albums.Delete',
                    descriptionLangKey: 'Stories.Albums.DeleteConfirm',
                    button: {langKey: 'Delete', isDanger: true}
                  });
                } catch(e) {
                  return;
                }

                rootScope.managers.appStoriesManager.deleteAlbum(props.peerId, id).catch(() => {
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
            <ChipTab class="stories-album-chip" value={album.album_id.toString()}>
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
  const popup = PopupElement.createPopup(PopupChooseStory, {peerId, albumId});
  popup.show();

  const result = await new Promise<{added: number[], removed: number[]} | null>((resolve) => {
    popup.addEventListener('finish', resolve);
  });

  if(!result) return;
  const {added, removed} = result;
  if(!added.length && !removed.length) return;
  rootScope.managers.appStoriesManager.updateAlbum(peerId, albumId, {
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
  onSetAlbumAnimated?: (fn: (albumId: number | undefined) => void) => void
}) {
  const [stories, actions] = useStories();
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

    createStoriesViewer({
      onExit,
      target,
      splitByDays: true
    });
  });

  const Item = (storyItem: StoryItem) => {
    const {container, div, media, thumb} = wrapStoryMedia({
      peerId: stories.peer.peerId,
      storyItem: storyItem as StoryItem.storyItem,
      forPreview: true,
      noAspecter: true,
      containerProps: {
        // @ts-ignore
        'data-mid': storyItem.id,
        'data-peer-id': stories.peer.peerId,
        'class': 'grid-item search-super-item',
        'onClick': () => {
          setViewerId(storyItem.id);
        }
      },
      childrenClassName: 'grid-item-media',
      noPlayButton: true
    });

    let icon: HTMLElement;
    let archiveIcon: HTMLElement;
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
        const thumb = gotThumb.image as HTMLCanvasElement;
        element.parentElement.prepend(thumb);

        // need img for clone animation to work
        gotThumb.loadPromise.then(() => {
          const img = document.createElement('img');
          img.className = thumb.className;
          img.src = thumb.toDataURL();
          thumb.replaceWith(img);
        });

        onCleanup(() => {
          thumb.remove();
        });
      }

      if(element.parentElement && props.pinned && !stories.albumId && (storyItem as StoryItem.storyItem).pinnedIndex !== undefined) {
        icon ??= Icon('pin2', 'grid-item-pin');
        element.parentElement.append(icon);
      } else if(icon) {
        icon.remove();
      }

      if(element.parentElement && props.archive && !(storyItem as StoryItem.storyItem).pFlags.pinned) {
        archiveIcon ??= Icon('hide', 'grid-item-archived');
        element.parentElement.append(archiveIcon);
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
    const dir = direction();
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
          axis: 'y'
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
  mount?: HTMLElement
}) {
  const content = (
    <div class="search-super-selection-container">
      <ButtonTsx
        icon="close"
        class="search-super-selection-cancel btn-icon"
        onClick={() => props.selection.cancelSelection()}
      />
      <div class="search-super-selection-count">
        <I18nTsx key="StoriesCount" args={[String(props.selection.count())]} />
      </div>
      <Show when={props.albumId !== undefined}>
        <ButtonTsx
          icon="crossround"
          class="search-super-selection-remove btn-icon"
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
          onClick={() => props.selection.onPinStoriesToTopClick(undefined, true)}
        />
      </Show>
      <Show when={!props.selection.cantPin()}>
        <ButtonTsx
          icon={props.selection.isStoriesArchive ? 'unarchive' : 'archive'}
          class="search-super-selection-pin btn-icon"
          onClick={() => props.selection.onPinStoriesClick(undefined, props.selection.isStoriesArchive)}
        />
      </Show>
      <Show when={!props.selection.cantDelete()}>
        <ButtonTsx
          icon="delete"
          class="search-super-selection-delete btn-icon danger"
          onClick={() => props.selection.onDeleteStoriesClick()}
        />
      </Show>
    </div>
  );

  if(props.mount) {
    createEffect(() => {
      const selecting = props.selection.selecting();
      props.mount.classList.toggle('is-selecting', selecting);
      props.mount.classList.toggle('backwards', !selecting);
    });
    return <Portal mount={props.mount}>{content}</Portal>;
  }

  return (
    <div
      class="search-super-tabs-scrollable menu-horizontal-scrollable sticky is-single"
      classList={{'is-selecting': props.selection.selecting(), 'backwards': !props.selection.selecting()}}
    >
      {content}
    </div>
  );
}

export function profileStoriesButtonMenu(props: {
  peerId: PeerId,
  slider: SidebarSlider,
  verify: () => boolean,
  isArchive?: boolean,
  onAlbumCreated?: (albumId: number) => void,
  canEdit?: () => boolean,
}): ButtonMenuItemOptionsVerifiable[] {
  return [{
    icon: 'archive',
    text: 'MyStories.ShowArchive',
    onClick: () => {
      const tab = props.slider.createTab(AppMyStoriesTab);
      tab.isArchive = true;
      if(props.peerId.isAnyChat()) {
        tab.chatId = props.peerId.toChatId();
      }
      tab.open();
    },
    verify: () => (
      props.verify() &&
      !props.isArchive &&
      (props.canEdit?.() ?? true)
    )
  }, {
    icon: 'folder',
    text: 'Stories.Albums.CreateAlbum',
    onClick: async() => {
      const albumId = await openCreateAlbumPopup(props.peerId);
      if(albumId !== undefined) props.onAlbumCreated?.(albumId);
    },
    verify: () => (
      props.verify() &&
      !props.isArchive &&
      (props.canEdit?.() ?? true)
    )
  }];
}

export function StoriesProfileList(props: {
  class?: string,
  peerId: PeerId
  pinned?: boolean
  archive?: boolean
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

  const selection = props.withSelection ? new StoriesSelection({
    container: props.scrollable.container,
    managers: rootScope.managers,
    listenerSetter: props.listenerSetter,
    isArchive: props.archive,
    chatId: props.peerId.isAnyChat() ? props.peerId.toChatId() : undefined,
    forPicker: props.forPicker
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
          />
        )}
        <StoriesGrid
          scrollable={props.scrollable}
          onReady={() => {
            new StoriesContextMenu(
              containerRef,
              selection,
              props.listenerSetter,
              state
            );

            if(selection) {
              attachClickEvent(containerRef, (e) => {
                if(selection.isSelecting) {
                  const item = findUpClassName(e.target, 'search-super-item');
                  if(!item) return;
                  cancelClickOrNextIfNotClick(e);
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
          onSetAlbumAnimated={(fn) => setAlbumAnimated = fn}
        />
        {selection && !props.forPicker && (
          <StoriesSelectionToolbar
            selection={selection}
            albumId={state.albumId}
            peerId={props.peerId}
            pinned={props.pinned}
            mount={props.selectionMount}
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

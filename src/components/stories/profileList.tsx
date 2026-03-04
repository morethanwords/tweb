/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect, createSignal, For, JSX, createMemo, onCleanup, untrack, createReaction, Show, Switch, Match} from 'solid-js';
import {createStoriesViewer} from '@components/stories/viewer';
import {Document, MessageMedia, Photo, StoryItem} from '@layer';
import {wrapStoryMedia} from '@components/stories/preview';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import {StoriesContext, useStories, createStoriesStore} from '@components/stories/store';
import Icon from '@components/icon';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {PreloaderTsx} from '@components/putPreloader';
import fastSmoothScroll from '@helpers/fastSmoothScroll';
import Scrollable from '@components/scrollable';
import {doubleRaf} from '@helpers/schedulers';
import {I18nTsx} from '@helpers/solid/i18n';
import ButtonTsx from '@components/buttonTsx';
import {StoriesSelection, toastStoryPinnedToProfile} from './selection';
import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
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

const ALL_ALBUMS_ID = -1;
const TEST_ONE = false;
const TEST_TWO = false;

class StoriesContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>})[];
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
    private pinned: boolean
  ) {
    const onContextMenu: Parameters<typeof attachContextMenuListener>[0]['callback'] = (e) => {
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
    };

    attachContextMenuListener({
      element: attachTo,
      callback: onContextMenu as any,
      listenerSetter
    });
  }

  private init() {
    const managers = rootScope.managers;
    this.buttons = [{
      icon: 'archive',
      text: 'Archive',
      onClick: () => managers.appStoriesManager.togglePinned(this.peerId, [this.storyItem.id], false).then(() => toastStoryPinnedToProfile(managers, this.peerId, false)),
      verify: () => this.storyItem?.pFlags.pinned && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: () => managers.appStoriesManager.togglePinned(this.peerId, [this.storyItem.id], true).then(() => toastStoryPinnedToProfile(managers, this.peerId, true)),
      verify: () => this.storyItem && !this.storyItem.pFlags.pinned && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      onClick: () => managers.appStoriesManager.togglePinnedToTop(this.peerId, [this.storyItem.id], true),
      verify: () => this.pinned && this.storyItem?.pinnedIndex === undefined && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: () => managers.appStoriesManager.togglePinnedToTop(this.peerId, [this.storyItem.id], false),
      verify: () => this.pinned && this.storyItem?.pinnedIndex !== undefined && managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: () => this.selection.toggleByElement(this.target),
      verify: () => !!this.selection && !this.isSelected
    }, {
      icon: 'select',
      text: 'Message.Context.Selection.Clear',
      onClick: () => this.selection.cancelSelection(),
      verify: () => !!this.selection && this.isSelected
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: () => this.selection?.onDeleteStoriesClick([this.storyItem.id], this.peerId) ??
        managers.appStoriesManager.deleteStories(this.peerId, [this.storyItem.id]),
      verify: () => managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'delete')
    }];

    this.element = ButtonMenuSync({buttons: this.buttons, listenerSetter: this.listenerSetter});
    this.element.classList.add('search-contextmenu', 'contextmenu');
    document.body.append(this.element);
  }
}

function StoriesAlbums(props: {
  onAlbumChange: (albumId: number | undefined) => void
}) {
  const [stories] = useStories();
  const hasAlbums = () => stories.ready && stories.peer.albums && stories.peer.albums.length > 0;
  const chosenAlbumId = () => stories.albumId === undefined ? ALL_ALBUMS_ID : stories.albumId;

  const handleChange = (value: string) => {
    const albumId = Number(value);
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
      >
        <ChipTab value={ALL_ALBUMS_ID.toString()}>
          {i18n('StoryAlbumAll')}
        </ChipTab>
        <For each={stories.peer.albums}>
          {(album) => (
            <ChipTab value={album.album_id.toString()}>
              {wrapEmojiText(album.title)}
            </ChipTab>
          )}
        </For>
      </ChipTabs>
    </Show>
  );
}

function StoriesGrid(props: {
  scrollable: Scrollable,
  onReady?: () => void,
  onAddToAlbum?: (albumId: number) => void,
  selection?: StoriesSelection,
  pinned: boolean,
  archive?: boolean,
  onSetAlbumAnimated?: (fn: (albumId: number | undefined) => void) => void
}) {
  const [stories, actions] = useStories();
  const [list, setList] = createSignal<JSX.Element>();
  const [length, setLength] = createSignal(0);
  const [viewerId, setViewerId] = createSignal<number>();
  const items = new Map<number, HTMLElement>();

  let restoreScrollTop: number | null = null;
  let pendingClone: HTMLElement | null = null;

  const onReady = () => {
    const list = <For each={stories.peer.stories}>{Item}</For>;

    createEffect(() => {
      const elements: JSX.Element[] = (list as any)();
      if(TEST_ONE) elements.length = 1;
      else if(TEST_TWO) elements.length = 2;
      const length = elements.length;
      setLength(length);
      setList(elements);
      if(restoreScrollTop !== null) {
        doubleRaf().then(() => {
          if(restoreScrollTop !== null && pendingClone) {
            const diff = restoreScrollTop - props.scrollable.container.scrollTop;
            props.scrollable.container.scrollTop = restoreScrollTop;
            pendingClone.style.setProperty('--offset', `${diff}px`);
            restoreScrollTop = null;
          }
        })
      }
    });

    props.onReady?.();
  };

  createReaction(onReady)(() => stories.ready);

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

      if(length() === 1) {
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

      if(element.parentElement && props.pinned && (storyItem as StoryItem.storyItem).pinnedIndex !== undefined) {
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
  const isLoading = () => !stories.loaded && isEmpty()

  let contentRef!: HTMLDivElement;
  const SLIDE_DURATION = 250;
  const SLIDE_EASING = 'cubic-bezier(.4, 0, .2, 1)';
  const scrollPositions = new Map<number, number>();

  const setAlbumIdAnimated = (albumId: number | undefined) => {
    const albums = stories.peer?.albums;
    const oldIndex = stories.albumId === undefined ? -1 :
      (albums?.findIndex((a) => a.album_id === stories.albumId) ?? -1);
    const newIndex = albumId === undefined ? -1 :
      (albums?.findIndex((a) => a.album_id === albumId) ?? -1);
    const direction = newIndex > oldIndex ? 1 : newIndex < oldIndex ? -1 : 0;

    const wrapper = contentRef.parentElement;
    const scrollable = props.scrollable.container;
    const searchSuper = wrapper.closest('.search-super') as HTMLElement;
    if(!direction || !contentRef || !scrollable || !searchSuper) {
      actions.setAlbumId(albumId);
      return;
    }

    // ! 0 for "my stories" tab
    const scrollBase = searchSuper.offsetTop === 0 ? 0 : searchSuper.offsetTop - 56
    const oldScroll = scrollable.scrollTop - scrollBase;
    const newScroll = scrollPositions.get(albumId) ?? 0;
    if(oldScroll >= 0) {
      scrollPositions.set(stories.albumId, Math.max(0, oldScroll));
      restoreScrollTop = scrollBase + newScroll;
    } else {
      fastSmoothScroll({
        element: searchSuper,
        container: scrollable,
        position: 'center',
        axis: 'y'
      })
    }

    // lock wrapper height so it doesn't collapse when content changes
    const wrapperHeight = wrapper.offsetHeight;
    wrapper.style.minHeight = wrapperHeight + 'px';

    // clone before state change
    const clone = contentRef.cloneNode(true) as HTMLDivElement;
    clone.classList.add('stories-album-clone');
    clone.style.setProperty('--offset', '0px');
    wrapper.append(clone);
    pendingClone = clone;
    // lock clone height
    clone.style.height = clone.offsetHeight + 'px';

    const cloneAnim = clone.animate([
      {transform: `translateX(0) translateY(var(--offset))`},
      {transform: `translateX(${-direction * 100}%) translateY(var(--offset))`}
    ], {duration: SLIDE_DURATION, easing: SLIDE_EASING, fill: 'forwards'});
    cloneAnim.onfinish = () => {
      clone.remove()
      pendingClone = null;
    };

    // now mutate state
    actions.setAlbumId(albumId);

    const anim = contentRef.animate([
      {transform: `translateX(${direction * 100}%)`},
      {transform: 'translateX(0)'}
    ], {duration: SLIDE_DURATION, easing: SLIDE_EASING});

    anim.onfinish = () => {
      wrapper.style.minHeight = '';
    };
  };

  props.onSetAlbumAnimated?.(setAlbumIdAnimated);

  return (
    <div class="stories-album-wrapper">
      <div ref={contentRef} class="stories-album-content">
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
              <Show when={props.onAddToAlbum}>
                <ButtonTsx
                  class="btn-primary btn-color-primary btn-control"
                  text="Stories.Albums.AddToAlbum"
                  onClick={() => props.onAddToAlbum(stories.albumId)}
                />
              </Show>
            </div>
          </Match>
          <Match when={true}>
            <div
              class="grid"
              classList={{two: length() === 2, one: length() === 1}}
            >
              {list()}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

function StoriesSelectionToolbar(props: {
  selection: StoriesSelection
}) {
  return (
    <div
      class="search-super-tabs-scrollable menu-horizontal-scrollable sticky is-single"
      classList={{'is-selecting': props.selection.selecting(), 'backwards': !props.selection.selecting()}}
    >
      <div class="search-super-selection-container">
        <ButtonTsx
          icon="close"
          class="search-super-selection-cancel btn-icon"
          onClick={() => props.selection.cancelSelection()}
        />
        <div class="search-super-selection-count">
          <I18nTsx key="StoriesCount" args={[String(props.selection.count())]} />
        </div>
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
    </div>
  );
}

export function profileStoriesButtonMenu(props: {
  peerId: PeerId,
  slider: SidebarSlider,
  verify: () => boolean,
  isArchive?: boolean,
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
      (props.peerId === rootScope.myId || rootScope.managers.appChatsManager.hasRights(props.peerId.toChatId(), 'edit_stories'))
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
  onCountChange?: (count: number) => void
  onAddToAlbum?: (albumId: number) => void
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
    chatId: props.peerId.isAnyChat() ? props.peerId.toChatId() : undefined
  }) : undefined;

  let setAlbumAnimated!: (albumId: number | undefined) => void;
  let containerRef!: HTMLDivElement;

  const render = (
    <StoriesContext.Provider value={contextValue}>
      <div ref={containerRef} class="search-super-content-container search-super-content-stories">
        {props.pinned && (
          <StoriesAlbums onAlbumChange={(id) => setAlbumAnimated?.(id)} />
        )}
        <StoriesGrid
          scrollable={props.scrollable}
          onReady={() => {
            new StoriesContextMenu(
              containerRef,
              selection,
              props.listenerSetter,
              props.pinned
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
          onAddToAlbum={props.onAddToAlbum}
          selection={selection}
          pinned={props.pinned}
          archive={props.archive}
          onSetAlbumAnimated={(fn) => setAlbumAnimated = fn}
        />
        {selection && (
          <StoriesSelectionToolbar selection={selection} />
        )}
      </div>
    </StoriesContext.Provider>
  );

  return {render, actions, selection, setAlbumAnimated};
}

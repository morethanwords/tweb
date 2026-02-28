/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {splitProps, createEffect, createSignal, For, JSX, createMemo, onCleanup, untrack, createComputed, createReaction, Show, on} from 'solid-js';
import {createStoriesViewer} from '@components/stories/viewer';
import {Document, MessageMedia, Photo, StoryItem} from '@layer';
import {wrapStoryMedia} from '@components/stories/preview';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import {SearchSelection} from '@components/chat/selection';
import {StoriesProvider, useStories, type StoriesContextActions} from '@components/stories/store';
import Icon from '@components/icon';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {putPreloader} from '@components/putPreloader';
import fastSmoothScroll from '../../helpers/fastSmoothScroll';
import Scrollable from '../scrollable';
import {doubleRaf, fastRaf} from '../../helpers/schedulers';

const TEST_ONE = false;
const TEST_TWO = false;

function _StoriesProfileList(props: {
  scrollable: Scrollable,
  onReady?: () => void,
  onLengthChange?: (length: number) => void,
  selection?: SearchSelection,
  pinned: boolean,
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
      props.onLengthChange?.(length);
    });

    props.onLengthChange && createEffect(() => {
      props.onLengthChange(stories.peer?.count);
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
        'onClick': (e) => {
          setViewerId(storyItem.id);
        }
      },
      childrenClassName: 'grid-item-media',
      noPlayButton: true
    });

    let icon: HTMLElement;
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
        const thumb = gotThumb.image;
        element.parentElement.prepend(thumb);

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
    });

    if(props.selection?.isSelecting) {
      props.selection.toggleElementCheckbox(div, true);
    }

    return container;
  };

  const isLoading = () => stories.peer?.stories?.length === 0;

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

    const scrollBase = searchSuper.offsetTop - 56
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
        <Show when={!isLoading()} fallback={
          <div class="grid-album-preloader">{putPreloader(undefined as HTMLElement, true)}</div>
        }>
          <div
            class="grid"
            classList={{two: length() === 2, one: length() === 1}}
          >
            {list()}
          </div>
        </Show>
      </div>
    </div>
  );
}

const ALL_ALBUMS_ID = -1;

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

export default function StoriesProfileList(props: Parameters<typeof StoriesProvider>[0] & Parameters<typeof _StoriesProfileList>[0]) {
  const [, rest] = splitProps(props, ['onReady', 'onLengthChange', 'selection']);

  let actionsRef!: StoriesContextActions;
  let setAlbumAnimated!: (albumId: number | undefined) => void;
  const dom = (
    <StoriesProvider {...rest}>
      <div>
        {((): null => {
          const [, actions] = useStories();
          actionsRef = actions;
          return null
        })()}
        {rest.pinned && (
          <StoriesAlbums onAlbumChange={(id) => setAlbumAnimated(id)} />
        )}
        <_StoriesProfileList
          {...props}
          pinned={rest.pinned}
          onSetAlbumAnimated={(fn) => setAlbumAnimated = fn}
        />
      </div>
    </StoriesProvider>
  );

  return {dom, actions: actionsRef, setAlbumAnimated};
}

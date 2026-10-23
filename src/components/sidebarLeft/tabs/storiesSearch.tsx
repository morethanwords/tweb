import {Component, createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, untrack} from 'solid-js';
import {GeoPoint, MediaArea, StoryItem} from '@layer';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import lottieLoader from '@lib/lottie/lottieLoader';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppStoriesSearchTab} from '@components/solidJsTabs/tabs';
import {createStoriesStore, StoriesContext, StoriesContextPeerState, StoriesSearch, useStories} from '@components/stories/store';
import wrapStoryGridItem from '@components/stories/gridItem';
import Section from '@components/section';
import Row from '@components/rowTsx';
import MapPreview from '@components/mapPreview';
import LottieAnimation from '@components/lottieAnimation';
import {PreloaderTsx} from '@components/putPreloader';
import {AvatarNewTsx} from '@components/avatarNew';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {I18nTsx} from '@helpers/solid/i18n';
import getPollCountryName from '@helpers/getPollCountryName';
import {setDirection} from '@helpers/dom/setInnerHTML';
import classNames from '@helpers/string/classNames';

import styles from '@components/sidebarLeft/tabs/storiesSearch.module.scss';

const AUTHOR_AVATAR_SIZE = 18;

const getKey = (peer: StoriesContextPeerState) => `${peer.peerId}_${peer.stories[0].id}`;

/** where the stories were posted from: its map, its name and its address */
function Place(props: {area: MediaArea}) {
  const geo = (props.area as MediaArea.mediaAreaGeoPoint).geo as GeoPoint.geoPoint;
  const venue = props.area._ === 'mediaAreaVenue' ? props.area : undefined;
  let address: string;
  if(venue) {
    address = venue.address;
  } else {
    const parts = (props.area as MediaArea.mediaAreaGeoPoint).address;
    address = parts && [
      parts.street,
      parts.city,
      parts.state,
      parts.country_iso2 && getPollCountryName(parts.country_iso2)
    ].filter(Boolean).join(', ');
  }

  return (
    <Section noDelimiter>
      <Show when={geo?._ === 'geoPoint'}>
        <MapPreview geo={geo} />
      </Show>
      <Row>
        <Row.Icon icon="location_filled" />
        <Row.Title>{venue?.title ? wrapEmojiText(venue.title) : i18n('ChatLocation')}</Row.Title>
        <Show when={address}>
          <Row.Subtitle>{wrapEmojiText(address)}</Row.Subtitle>
        </Show>
      </Row>
    </Section>
  );
}

function FoundStories(props: {search: StoriesSearch}) {
  const [tab] = useSuperTab<typeof AppStoriesSearchTab>();
  const [stories, actions] = useStories();
  const [viewerPeer, setViewerPeer] = createSignal<StoriesContextPeerState>();
  const items = new Map<string, HTMLElement>();

  // * the viewer goes through the stories found, in their order, and comes back to the grid
  createEffect(() => {
    const peer = viewerPeer();
    if(!peer) {
      return;
    }

    untrack(() => actions.set({peer, index: 0}));
    const target = createMemo(() => stories.peer && items.get(getKey(stories.peer)));
    hotReloadGuard.createStoriesViewer({
      onExit: () => setViewerPeer(undefined),
      target,
      pinned: true
    });
  });

  // * and gets the next page while a few stories are left to it, as the grid does when scrolled to its end
  createEffect(() => {
    if(stories.hasViewer && !stories.loaded && stories.index >= stories.peers.length - 4) {
      actions.load();
    }
  });

  tab.scrollable.onScrolledBottom = () => {
    actions.load();
  };

  const Item = (peer: StoriesContextPeerState) => {
    const {container, media, thumb} = wrapStoryGridItem({
      peerId: peer.peerId,
      storyItem: peer.stories[0] as StoryItem.storyItem,
      onClick: () => setViewerPeer(peer),
      withAuthor: !props.search.peerId
    });

    createEffect(() => {
      const element = media() || thumb();
      if(!element) {
        return;
      }

      const key = getKey(peer);
      items.set(key, element);
      onCleanup(() => items.delete(key));
    });

    // * stories of everyone say whose each one is
    if(!props.search.peerId) {
      (container as HTMLElement).append((
        <div class={styles.author} aria-hidden="true">
          <AvatarNewTsx peerId={peer.peerId} size={AUTHOR_AVATAR_SIZE} />
          <PeerTitleTsx class={styles.authorName} peerId={peer.peerId} />
        </div>
      ) as HTMLElement);
    }

    return container;
  };

  const count = () => stories.peers.length;
  return (
    <Switch>
      <Match when={!stories.ready}>
        <div class={styles.placeholder}>
          <PreloaderTsx />
        </div>
      </Match>
      <Match when={!count()}>
        <Show when={!props.search.area}>
          <div class={styles.placeholder}>
            <LottieAnimation
              lottieLoader={lottieLoader}
              name="UtyanStories"
              class={styles.sticker}
            />
            <I18nTsx key="NoHashtagStoriesTitle" class={styles.placeholderTitle} />
          </div>
        </Show>
      </Match>
      <Match when={true}>
        <Section
          noDelimiter
          name={props.search.area ? i18n('LocationStories', [stories.foundCount]) : undefined}
          class="search-super-content-stories"
        >
          <div
            class={classNames('grid', styles.grid)}
            classList={{two: count() === 2, one: count() === 1}}
          >
            <For each={stories.peers}>{Item}</For>
          </div>
        </Section>
      </Match>
    </Switch>
  );
}

const StoriesSearchTab: Component = () => {
  const [tab] = useSuperTab<typeof AppStoriesSearchTab>();
  const {search} = tab.payload;
  const contextValue = createStoriesStore({search, manualLoad: true});
  const [stories, actions] = contextValue;

  onMount(() => {
    if(!search.hashtag) {
      return;
    }

    // * a hashtag is the title, and how many stories have it is under it
    const managers = bindManagersToSession(rootScope.managers);
    const title = document.createElement('span');
    title.textContent = search.hashtag;
    setDirection(title);
    tab.title.replaceChildren(title);
    if(search.peerId) {
      managers.appPeersManager.getPeerUsername(search.peerId).then((username) => {
        if(username) title.append('@' + username);
      });
    }

    const rows = (
      <div class="sidebar-header__rows">
        {tab.title}
        <div class="sidebar-header__subtitle">
          {stories.ready ? i18n('StoriesCount', [stories.foundCount]) : i18n('Loading')}
        </div>
      </div>
    ) as HTMLElement;
    tab.header.append(rows);
    onCleanup(() => rows.replaceWith(tab.title));
  });

  actions.load();

  return (
    <StoriesContext.Provider value={contextValue}>
      <Show when={search.area}>{(area) => <Place area={area()} />}</Show>
      <FoundStories search={search} />
    </StoriesContext.Provider>
  );
};

export default StoriesSearchTab;

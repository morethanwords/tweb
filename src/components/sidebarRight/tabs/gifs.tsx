import {Component, onCleanup, onMount} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {AppInlineBotsManager} from '@appManagers/appInlineBotsManager';
import InputSearch from '@components/inputSearch';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import GifsMasonry from '@components/gifsMasonry';
import mediaSizes from '@helpers/mediaSizes';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {NULL_PEER_ID} from '@appManagers/constants';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const ANIMATIONGROUP: AnimationItemGroup = 'GIFS-SEARCH';

const Gifs: Component = () => {
  const [tab] = useSuperTab();
  const {appSidebarRight, appImManager} = useHotReloadGuard();

  let inputSearch: InputSearch;
  let gifsDiv: HTMLDivElement;
  let masonry: GifsMasonry;
  let nextOffset = '';
  let loadedAll = false;
  let gifBotPeerId: PeerId;
  let searchPromise: ReturnType<AppInlineBotsManager['getInlineResults']>;

  const reset = () => {
    searchPromise = null;
    nextOffset = '';
    loadedAll = false;
    masonry.clear();
  };

  const search = async(query: string, newSearch = true) => {
    if(searchPromise || loadedAll) return;

    if(!gifBotPeerId) {
      gifBotPeerId = (await tab.managers.appUsersManager.resolveUsername('gif')).id.toPeerId(false);
    }

    try {
      searchPromise = tab.managers.appInlineBotsManager.getInlineResults(NULL_PEER_ID, gifBotPeerId, query, nextOffset);
      const {results, next_offset} = await searchPromise;

      if(inputSearch.value !== query) {
        return;
      }

      searchPromise = null;
      nextOffset = next_offset;
      if(newSearch) {
        gifsDiv.replaceChildren();
      }

      if(results.length) {
        results.forEach((result) => {
          if(result._ === 'botInlineMediaResult' && result.document) {
            masonry.add(result.document as MyDocument);
          }
        });
      } else {
        loadedAll = true;
      }

      tab.scrollable.onScroll();
    } catch(err) {
      searchPromise = null;
      console.error('gifs loading error:', err);
      throw err;
    }
  };

  const onGifsClick = async(e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'gif');
    if(!target) return;

    const fileId = target.dataset.docId;
    if(await appImManager.chat.input.sendMessageWithDocument({document: fileId, target})) {
      if(mediaSizes.isMobile) {
        appSidebarRight.onCloseBtnClick();
      }
    } else {
      console.warn('got no doc by id:', fileId);
    }
  };

  onMount(() => {
    tab.container.id = 'search-gifs-container';

    inputSearch = new InputSearch({
      placeholder: 'SearchGifsTitle',
      onChange: (value) => {
        reset();
        search(value);
      }
    });

    tab.title.replaceWith(inputSearch.container);

    gifsDiv = document.createElement('div');
    gifsDiv.classList.add('gifs-masonry');
    attachClickEvent(gifsDiv, onGifsClick, {listenerSetter: tab.listenerSetter});

    tab.scrollable.append(gifsDiv);

    masonry = new GifsMasonry(gifsDiv, ANIMATIONGROUP, tab.scrollable);

    appSidebarRight.toggleSidebar(true).then(() => {
      search('', true);

      tab.scrollable.onScrolledBottom = () => {
        search(inputSearch.value, false);
      };
    });
  });

  onCleanup(() => {
    reset();
    gifsDiv.replaceChildren();
    animationIntersector.checkAnimations(undefined, ANIMATIONGROUP);
    inputSearch.remove();
  });

  return null;
};

export default Gifs;

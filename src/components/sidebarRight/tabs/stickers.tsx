import {Component, onCleanup, onMount} from 'solid-js';
import InputSearch from '@components/inputSearch';
import LazyLoadQueue from '@components/lazyLoadQueue';
import showStickersPopup from '@components/popups/stickers';
import animationIntersector from '@components/animationIntersector';
import {StickerSet, StickerSetCovered} from '@layer';
import {i18n} from '@lib/langPack';
import findUpClassName from '@helpers/dom/findUpClassName';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import forEachReverse from '@helpers/array/forEachReverse';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import attachMediaPeekListeners from '@components/mediaPeek';
import wrapSticker from '@components/wrappers/sticker';
import {getStickerSetInputById, getStickerSetInputByStickerSet} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import isStickerSetAdded from '@lib/appManagers/utils/stickers/isStickerSetAdded';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

// * a trending set counts as seen once (all but a sliver of) it is on the screen
const READ_VISIBLE_RATIO = 0.95;

const Stickers: Component = () => {
  const [tab] = useSuperTab();
  const {appImManager, appSidebarRight} = useHotReloadGuard();

  // * an answer that comes after the tab closed renders nothing
  const middleware = tab.middlewareHelper.get();
  let inputSearch: InputSearch;
  let setsDiv: HTMLDivElement;
  const lazyLoadQueue = new LazyLoadQueue();
  // * the old trending sets loaded below the current ones: undefined once there are no more
  let oldFeaturedOffset = 0, loadingOldFeatured = false;
  let readObserver: IntersectionObserver;

  const renderSet = (set: StickerSet.stickerSet) => {
    const div = document.createElement('div');
    div.classList.add('sticker-set');

    const header = document.createElement('div');
    header.classList.add('sticker-set-header');

    const details = document.createElement('div');
    details.classList.add('sticker-set-details');
    details.innerHTML = '<div class="sticker-set-name"></div>';

    setInnerHTML(details.firstElementChild, wrapEmojiText(set.title));

    const countDiv = document.createElement('div');
    countDiv.classList.add('sticker-set-count');
    countDiv.append(i18n('Stickers', [set.count]));
    details.append(countDiv);

    const button = document.createElement('button');
    button.classList.add('btn-primary', 'btn-color-primary', 'sticker-set-button');
    const added = isStickerSetAdded(set);
    button.append(i18n(added ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));

    if(added) {
      button.classList.add('gray');
    }

    header.append(details, button);

    const stickersDiv = document.createElement('div');
    stickersDiv.classList.add('sticker-set-stickers');

    const count = Math.min(5, set.count);
    for(let i = 0; i < count; ++i) {
      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add('sticker-set-sticker');

      stickersDiv.append(stickerDiv);
    }

    tab.managers.appStickersManager.getStickerSet(getStickerSetInputById(set)).then((set) => {
      if(!middleware()) {
        return;
      }

      for(let i = 0; i < count; ++i) {
        const div = stickersDiv.children[i] as HTMLDivElement;
        const doc = set.documents[i];
        if(doc._ === 'documentEmpty') {
          continue;
        }

        wrapSticker({
          doc,
          div,
          lazyLoadQueue,
          group: 'STICKERS-SEARCH',
          play: true,
          loop: true,
          width: 68,
          height: 68,
          withLock: true
        });
      }
    });

    div.dataset.stickerSet = '' + set.id;
    div.dataset.access_hash = '' + set.access_hash;
    div.dataset.title = set.title;

    div.append(header, stickersDiv);

    setsDiv.append(div);
    return div;
  };

  const getRenderedSet = (id: StickerSet.stickerSet['id']) => {
    return setsDiv.querySelector<HTMLElement>(`.sticker-set[data-sticker-set="${id}"]`);
  };

  /**
   * Trending sets are shown — those not in the list yet rendered — as the user is to see them: each,
   * new or kept from before (a search's), is marked read once it is on the screen whole (as tdesktop's
   * readVisibleFeatured does); one read already the manager lets alone
   */
  const renderFeaturedSets = (coveredSets: StickerSetCovered[]) => {
    coveredSets.forEach((covered) => {
      const set = covered.set as StickerSet.stickerSet;
      readObserver.observe(getRenderedSet(set.id) || renderSet(set));
    });
  };

  // * the older trending sets, a page at a time as the list is scrolled to its end (tdesktop, Android)
  const loadOldFeatured = () => {
    const offset = oldFeaturedOffset;
    if(inputSearch.value || loadingOldFeatured || offset === undefined) {
      return;
    }

    loadingOldFeatured = true;
    tab.managers.appStickersManager.getOldFeaturedStickers(offset).then(({sets, nextOffset}) => {
      loadingOldFeatured = false;
      // * the list may have been searched in, or gone back to the start, or closed meanwhile
      if(!middleware() || inputSearch.value || oldFeaturedOffset !== offset) {
        return;
      }

      oldFeaturedOffset = nextOffset;
      renderFeaturedSets(sets);
      // * the end still in reach — a page that added little or nothing new — asks for the next one;
      // a page that did not come waits for the next scroll to the end
      tab.scrollable.checkForTriggers();
    }, () => {
      loadingOldFeatured = false;
    });
  };

  const filterRendered = (query: string, coveredSets: StickerSetCovered[]) => {
    coveredSets = coveredSets.slice();

    const children = Array.from(setsDiv.children) as HTMLElement[];
    forEachReverse(children, (el) => {
      const id = el.dataset.stickerSet;
      const index = coveredSets.findIndex((covered) => covered.set.id === id);

      if(index !== -1) {
        coveredSets.splice(index, 1);
      } else if(!query || !el.dataset.title.toLowerCase().includes(query.toLowerCase())) {
        // * a trending row not seen yet is watched no longer: it is gone
        readObserver.unobserve(el);
        el.remove();
      }
    });

    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');

    return coveredSets;
  };

  const renderFeatured = () => {
    return tab.managers.appStickersManager.getFeaturedStickers().then((coveredSets) => {
      if(!middleware() || inputSearch.value) {
        return;
      }

      // * whatever older sets were below are gone with the filter: they load again from the start
      oldFeaturedOffset = 0;
      filterRendered('', coveredSets);
      // * the rows kept are watched again too: a search may have rendered them anew, unwatched
      renderFeaturedSets(coveredSets);
      tab.scrollable.checkForTriggers();
    });
  };

  const search = (query: string) => {
    if(!query) {
      return renderFeatured();
    }

    return tab.managers.appStickersManager.searchStickerSets(query, false).then((coveredSets) => {
      if(!middleware() || inputSearch.value !== query) {
        return;
      }

      coveredSets = filterRendered(query, coveredSets);
      coveredSets.forEach((set) => {
        renderSet(set.set);
      });
    });
  };

  onMount(() => {
    tab.container.id = 'stickers-container';
    tab.container.classList.add('chatlist-container');

    inputSearch = new InputSearch({
      placeholder: 'StickersTab.SearchPlaceholder',
      onChange: (value) => {
        search(value);
      }
    });

    tab.title.replaceWith(inputSearch.container);

    setsDiv = document.createElement('div');
    setsDiv.classList.add('sticker-sets');
    tab.scrollable.append(setsDiv);

    readObserver = new IntersectionObserver((entries) => {
      const ids = entries
      .filter((entry) => entry.intersectionRatio >= READ_VISIBLE_RATIO)
      .map((entry) => {
        readObserver.unobserve(entry.target);
        return (entry.target as HTMLElement).dataset.stickerSet;
      });

      if(ids.length) {
        tab.managers.appStickersManager.readFeaturedStickerSets(ids);
      }
    }, {root: tab.scrollable.container, threshold: READ_VISIBLE_RATIO});

    tab.scrollable.onScrolledBottom = loadOldFeatured;

    attachMediaPeekListeners({listenTo: setsDiv, listenerSetter: tab.listenerSetter});

    attachClickEvent(setsDiv, (e) => {
      const sticker = findUpClassName(e.target, 'sticker-set-sticker');
      // With no chat to send to — the tab opened from the empty column's Stickers tip — a sticker
      // falls through to its own set below, which opens the pack.
      if(sticker && appImManager.chat.peerId) {
        const docId = sticker.dataset.docId;
        appImManager.chat.input.sendMessageWithDocument({document: docId, target: sticker});
        return;
      }

      const target = findUpClassName(e.target, 'sticker-set');
      if(!target) return;

      const id = target.dataset.stickerSet as string;
      const access_hash = target.dataset.access_hash as string;

      const button = findUpClassName(e.target, 'sticker-set-button') as HTMLElement;
      const input = getStickerSetInputById({id, access_hash});
      if(button) {
        e.preventDefault();
        e.cancelBubble = true;

        button.setAttribute('disabled', 'true');

        tab.managers.appStickersManager.getStickerSet(input).then((full) => {
          tab.managers.appStickersManager.toggleStickerSet(full.set).then((changed) => {
            if(changed) {
              button.textContent = '';
              const added = isStickerSetAdded(full.set);
              button.append(i18n(added ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));
              button.classList.toggle('gray', added);
            }
          }).finally(() => {
            button.removeAttribute('disabled');
          });
        });
      } else {
        tab.managers.appStickersManager.getStickerSet(input).then((full) => {
          showStickersPopup(getStickerSetInputByStickerSet(full.set));
        });
      }
    }, {listenerSetter: tab.listenerSetter});

    // The tab is opened from the emoticons panel into the right sidebar, and from the empty
    // column's Stickers tip into the left one — where there is no sidebar to reveal, and where
    // revealing the right one would just show an empty column.
    const revealed = tab.slider === appSidebarRight ?
      appSidebarRight.toggleSidebar(true) :
      Promise.resolve();

    revealed.then(() => {
      renderFeatured();
    });
  });

  onCleanup(() => {
    readObserver?.disconnect();
    lazyLoadQueue.clear();
    setsDiv.replaceChildren();
    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');
  });

  return null;
};

export default Stickers;

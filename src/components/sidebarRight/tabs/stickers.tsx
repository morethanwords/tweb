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
import attachStickerViewerListeners from '@components/stickerViewer';
import wrapSticker from '@components/wrappers/sticker';
import {getStickerSetInputById, getStickerSetInputByStickerSet} from '@lib/appManagers/utils/stickers/getStickerSetInput';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const Stickers: Component = () => {
  const [tab] = useSuperTab();
  const {appImManager, appSidebarRight} = useHotReloadGuard();

  let inputSearch: InputSearch;
  let setsDiv: HTMLDivElement;
  const lazyLoadQueue = new LazyLoadQueue();

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
    button.append(i18n(set.installed_date ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));

    if(set.installed_date) {
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
        el.remove();
      }
    });

    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');

    return coveredSets;
  };

  const renderFeatured = () => {
    return tab.managers.appStickersManager.getFeaturedStickers().then((coveredSets) => {
      if(inputSearch.value) {
        return;
      }

      coveredSets = filterRendered('', coveredSets);
      coveredSets.forEach((set) => {
        renderSet(set.set);
      });
    });
  };

  const search = (query: string) => {
    if(!query) {
      return renderFeatured();
    }

    return tab.managers.appStickersManager.searchStickerSets(query, false).then((coveredSets) => {
      if(inputSearch.value !== query) {
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

    attachStickerViewerListeners({listenTo: setsDiv, listenerSetter: tab.listenerSetter});

    attachClickEvent(setsDiv, (e) => {
      const sticker = findUpClassName(e.target, 'sticker-set-sticker');
      if(sticker) {
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
              button.append(i18n(full.set.installed_date ? 'Stickers.SearchAdded' : 'Stickers.SearchAdd'));
              button.classList.toggle('gray', !!full.set.installed_date);
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

    appSidebarRight.toggleSidebar(true).then(() => {
      renderFeatured();
    });
  });

  onCleanup(() => {
    setsDiv.replaceChildren();
    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');
  });

  return null;
};

export default Stickers;

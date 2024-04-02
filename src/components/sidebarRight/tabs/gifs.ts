/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../../lib/appManagers/appDocsManager';
import {SliderSuperTab} from '../../slider';
import InputSearch from '../../inputSearch';
import animationIntersector, {AnimationItemGroup} from '../../animationIntersector';
import appSidebarRight from '..';
import {AppInlineBotsManager} from '../../../lib/appManagers/appInlineBotsManager';
import GifsMasonry from '../../gifsMasonry';
import appImManager from '../../../lib/appManagers/appImManager';
import mediaSizes from '../../../helpers/mediaSizes';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import {NULL_PEER_ID} from '../../../lib/mtproto/mtproto_config';

const ANIMATIONGROUP: AnimationItemGroup = 'GIFS-SEARCH';

export default class AppGifsTab extends SliderSuperTab {
  private inputSearch: InputSearch;
  private gifsDiv: HTMLDivElement;

  private nextOffset = '';
  private loadedAll = false;

  private gifBotPeerId: PeerId;
  private masonry: GifsMasonry;

  private searchPromise: ReturnType<AppInlineBotsManager['getInlineResults']>;

  public init() {
    this.container.id = 'search-gifs-container';

    this.inputSearch = new InputSearch({
      placeholder: 'SearchGifsTitle',
      onChange: (value) => {
        this.reset();
        this.search(value);
      }
    });

    this.title.replaceWith(this.inputSearch.container);

    this.gifsDiv = document.createElement('div');
    this.gifsDiv.classList.add('gifs-masonry');
    attachClickEvent(this.gifsDiv, this.onGifsClick, {listenerSetter: this.listenerSetter});

    this.scrollable.append(this.gifsDiv);

    this.masonry = new GifsMasonry(this.gifsDiv, ANIMATIONGROUP, this.scrollable);
    // this.backBtn.parentElement.append(this.inputSearch.container);

    appSidebarRight.toggleSidebar(true).then(() => {
      this.search('', true);

      this.scrollable.onScrolledBottom = () => {
        this.search(this.inputSearch.value, false);
      };
    });
  }

  private onGifsClick = async(e: MouseEvent | TouchEvent) => {
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

  public onClose() {
    this.scrollable.onScrolledBottom = () => {};
  }

  public onCloseAfterTimeout() {
    this.reset();
    this.gifsDiv.replaceChildren();
    animationIntersector.checkAnimations(undefined, ANIMATIONGROUP);
    this.inputSearch.remove();
    return super.onCloseAfterTimeout();
  }

  private reset() {
    this.searchPromise = null;
    this.nextOffset = '';
    this.loadedAll = false;
    this.masonry.clear();
  }

  public async search(query: string, newSearch = true) {
    if(this.searchPromise || this.loadedAll) return;

    if(!this.gifBotPeerId) {
      this.gifBotPeerId = (await this.managers.appUsersManager.resolveUsername('gif')).id.toPeerId(false);
    }

    try {
      this.searchPromise = this.managers.appInlineBotsManager.getInlineResults(NULL_PEER_ID, this.gifBotPeerId, query, this.nextOffset);
      const {results, next_offset} = await this.searchPromise;

      if(this.inputSearch.value !== query) {
        return;
      }

      this.searchPromise = null;
      this.nextOffset = next_offset;
      if(newSearch) {
        this.gifsDiv.replaceChildren();
      }

      if(results.length) {
        results.forEach((result) => {
          if(result._ === 'botInlineMediaResult' && result.document) {
            this.masonry.add(result.document as MyDocument);
          }
        });
      } else {
        this.loadedAll = true;
      }

      this.scrollable.onScroll();
    } catch(err) {
      this.searchPromise = null;
      console.error('gifs loading error:', err);
      throw err;
    }
  }
}

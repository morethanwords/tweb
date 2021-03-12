import { SliderSuperTab } from "../../slider";
import InputSearch from "../../inputSearch";
import animationIntersector from "../../animationIntersector";
import appSidebarRight from "..";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import appInlineBotsManager, { AppInlineBotsManager } from "../../../lib/appManagers/appInlineBotsManager";
import GifsMasonry from "../../gifsMasonry";
import { findUpClassName, attachClickEvent } from "../../../helpers/dom";
import appImManager from "../../../lib/appManagers/appImManager";
import type { MyDocument } from "../../../lib/appManagers/appDocsManager";
import mediaSizes from "../../../helpers/mediaSizes";

const ANIMATIONGROUP = 'GIFS-SEARCH';

export default class AppGifsTab extends SliderSuperTab {
  private inputSearch: InputSearch;
  private gifsDiv: HTMLDivElement;

  private nextOffset = '';
  private loadedAll = false;

  private gifBotPeerId: number;
  private masonry: GifsMasonry;

  private searchPromise: ReturnType<AppInlineBotsManager['getInlineResults']>;

  protected init() {
    this.container.id = 'search-gifs-container';
    
    this.inputSearch = new InputSearch('Search GIFs', (value) => {
      this.reset();
      this.search(value);
    });
    
    this.title.replaceWith(this.inputSearch.container);
    
    this.gifsDiv = document.createElement('div');
    this.gifsDiv.classList.add('gifs-masonry');
    attachClickEvent(this.gifsDiv, this.onGifsClick, {listenerSetter: this.listenerSetter});
    
    this.scrollable.append(this.gifsDiv);
    
    this.masonry = new GifsMasonry(this.gifsDiv, ANIMATIONGROUP, this.scrollable);
    //this.backBtn.parentElement.append(this.inputSearch.container);
  }

  private onGifsClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'gif');
    if(!target) return;

    const fileId = target.dataset.docId;
    if(appImManager.chat.input.sendMessageWithDocument(fileId)) {
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
    this.gifsDiv.innerHTML = '';
    animationIntersector.checkAnimations(undefined, ANIMATIONGROUP);
    this.inputSearch.remove();
    return super.onCloseAfterTimeout();
  }

  private reset() {
    this.searchPromise = null;
    this.nextOffset = '';
    this.loadedAll = false;
    this.masonry.lazyLoadQueue.clear();
  }

  protected onOpen() {
    appSidebarRight.toggleSidebar(true).then(() => {
      this.search('', true);

      this.scrollable.onScrolledBottom = () => {
        this.search(this.inputSearch.value, false);
      };
    });
  }

  public async search(query: string, newSearch = true) {
    if(this.searchPromise || this.loadedAll) return;

    if(!this.gifBotPeerId) {
      this.gifBotPeerId = (await appUsersManager.resolveUsername('gif')).id;
    }

    try {
      this.searchPromise = appInlineBotsManager.getInlineResults(0, this.gifBotPeerId, query, this.nextOffset);
      const { results, next_offset } = await this.searchPromise;

      if(this.inputSearch.value !== query) {
        return;
      }

      this.searchPromise = null;
      this.nextOffset = next_offset;
      if(newSearch) {
        this.gifsDiv.innerHTML = '';
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

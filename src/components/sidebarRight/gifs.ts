import { SliderTab } from "../slider";
import SearchInput from "../searchInput";
import Scrollable from "../scrollable_new";
import LazyLoadQueue from "../lazyLoadQueue";
import animationIntersector from "../animationIntersector";
import appSidebarRight, { AppSidebarRight } from "../../lib/appManagers/appSidebarRight";
import appUsersManager, { User } from "../../lib/appManagers/appUsersManager";
import appInlineBotsManager, { AppInlineBotsManager } from "../../lib/appManagers/AppInlineBotsManager";
import GifsMasonry from "../gifsMasonry";
import { findUpClassName } from "../../lib/utils";
import appImManager from "../../lib/appManagers/appImManager";
import type { MyDocument } from "../../lib/appManagers/appDocsManager";

const ANIMATIONGROUP = 'GIFS-SEARCH';

export default class AppGifsTab implements SliderTab {
  private container = document.getElementById('search-gifs-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  //private input = this.container.querySelector('#stickers-search') as HTMLInputElement;
  private searchInput: SearchInput;
  private gifsDiv = this.contentDiv.firstElementChild as HTMLDivElement;
  private scrollable: Scrollable;

  private nextOffset = '';
  private loadedAll = false;

  private gifBotPeerID: number;
  private masonry: GifsMasonry;

  private searchPromise: ReturnType<AppInlineBotsManager['getInlineResults']>;

  constructor() {
    this.scrollable = new Scrollable(this.contentDiv, ANIMATIONGROUP, undefined, undefined, 2);
    this.scrollable.setVirtualContainer(this.gifsDiv);
    
    this.masonry = new GifsMasonry(this.gifsDiv, ANIMATIONGROUP, this.scrollable);

    this.searchInput = new SearchInput('Search GIFs', (value) => {
      this.reset();
      this.search(value);
    });

    this.gifsDiv.addEventListener('click', this.onGifsClick);

    this.backBtn.parentElement.append(this.searchInput.container);
  }

  onGifsClick = (e: MouseEvent) => {
    const target = findUpClassName(e.target, 'gif');
    if(!target) return;

    const fileID = target.dataset.docID;
    if(appImManager.chatInputC.sendMessageWithDocument(fileID)) {
      //this.closeBtn.click();
    } else {
      console.warn('got no doc by id:', fileID);
    }
  };

  public onClose() {
    this.scrollable.onScrolledBottom = () => {};
  }

  public onCloseAfterTimeout() {
    this.reset();
    this.gifsDiv.innerHTML = '';
    this.searchInput.value = '';
    animationIntersector.checkAnimations(undefined, ANIMATIONGROUP);
  }

  private reset() {
    this.searchPromise = null;
    this.nextOffset = '';
    this.loadedAll = false;
    this.masonry.lazyLoadQueue.clear();
  }

  public init() {
    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.gifs);

    appSidebarRight.toggleSidebar(true).then(() => {
      //this.renderFeatured();
      this.search('', true);
      this.reset();

      this.scrollable.onScrolledBottom = () => {
        this.search(this.searchInput.value, false);
      };
    });
  }

  public async search(query: string, newSearch = true) {
    if(this.searchPromise || this.loadedAll) return;

    if(!this.gifBotPeerID) {
      this.gifBotPeerID = (await appUsersManager.resolveUsername('gif')).id;
    }

    try {
      this.searchPromise = appInlineBotsManager.getInlineResults(0, this.gifBotPeerID, query, this.nextOffset);
      const { results, next_offset } = await this.searchPromise;

      if(this.searchInput.value != query) {
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
      throw new Error(JSON.stringify(err));
    }
  }
}
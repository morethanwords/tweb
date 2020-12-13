import appSidebarRight, { AppSidebarRight } from "..";
import AppSearch, { SearchGroup } from "../../appSearch";
import InputSearch from "../../inputSearch";
import { SliderTab } from "../../slider";

export default class AppPrivateSearchTab implements SliderTab {
  public container: HTMLElement;
  public closeBtn: HTMLElement;

  private inputSearch: InputSearch;
  private appSearch: AppSearch;

  private peerId = 0;

  onOpenAfterTimeout() {
    this.appSearch.beginSearch(this.peerId);
  }

  onCloseAfterTimeout() {
    this.peerId = 0;
    this.appSearch.reset();
  }

  public init() {
    this.container = document.getElementById('search-private-container');
    this.closeBtn = this.container.querySelector('.sidebar-close-button');
    this.inputSearch = new InputSearch('Search');
    this.closeBtn.parentElement.append(this.inputSearch.container);
    this.appSearch = new AppSearch(this.container.querySelector('.chatlist-container'), this.inputSearch, {
      messages: new SearchGroup('Private Search', 'messages')
    });
  }

  open(peerId: number) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(this.peerId != 0) {
      this.appSearch.beginSearch(this.peerId);
      return;
    }

    this.peerId = peerId;
    
    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.search);
    appSidebarRight.toggleSidebar(true);
  }
}
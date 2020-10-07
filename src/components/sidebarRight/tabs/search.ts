import appSidebarRight, { AppSidebarRight } from "..";
import AppSearch, { SearchGroup } from "../../appSearch";
import SearchInput from "../../searchInput";
import { SliderTab } from "../../slider";

export default class AppPrivateSearchTab implements SliderTab {
  public container: HTMLElement;
  public closeBtn: HTMLElement;

  private searchInput: SearchInput;
  private appSearch: AppSearch;

  private peerID = 0;

  onOpenAfterTimeout() {
    this.appSearch.beginSearch(this.peerID);
  }

  onCloseAfterTimeout() {
    this.peerID = 0;
    this.appSearch.reset();
  }

  public init() {
    this.container = document.getElementById('search-private-container');
    this.closeBtn = this.container.querySelector('.sidebar-close-button');
    this.searchInput = new SearchInput('Search');
    this.closeBtn.parentElement.append(this.searchInput.container);
    this.appSearch = new AppSearch(this.container.querySelector('.chats-container'), this.searchInput, {
      messages: new SearchGroup('Private Search', 'messages')
    });
  }

  open(peerID: number) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(this.peerID != 0) {
      this.appSearch.beginSearch(this.peerID);
      return;
    }

    this.peerID = peerID;
    
    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.search);
    appSidebarRight.toggleSidebar(true);
  }
}
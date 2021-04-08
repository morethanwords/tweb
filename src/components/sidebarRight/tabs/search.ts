/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarRight, { AppSidebarRight } from "..";
import AppSearch, { SearchGroup } from "../../appSearch";
import InputSearch from "../../inputSearch";
import { SliderSuperTab } from "../../slider";

export default class AppPrivateSearchTab extends SliderSuperTab {
  private inputSearch: InputSearch;
  private appSearch: AppSearch;

  private peerId = 0;
  private threadId = 0;

  onOpenAfterTimeout() {
    this.appSearch.beginSearch(this.peerId, this.threadId);
  }

  protected init() {
    this.container.id = 'search-private-container';
    this.container.classList.add('chatlist-container');
    this.inputSearch = new InputSearch('Search');
    this.title.replaceWith(this.inputSearch.container);

    const c = document.createElement('div');
    c.classList.add('chatlist-container');
    this.scrollable.container.replaceWith(c);
    this.appSearch = new AppSearch(c, this.inputSearch, {
      messages: new SearchGroup('Private Search', 'messages')
    });
  }

  open(peerId: number, threadId?: number) {
    const ret = super.open();
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(this.peerId !== 0) {
      this.appSearch.beginSearch(this.peerId, this.threadId);
      return ret;
    }

    this.peerId = peerId;
    this.threadId = threadId;
    
    appSidebarRight.toggleSidebar(true);
    return ret;
  }
}

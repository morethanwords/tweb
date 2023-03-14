/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appSidebarRight from '..';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import AppSearch, {SearchGroup} from '../../appSearch';
import ButtonIcon from '../../buttonIcon';
import InputSearch from '../../inputSearch';
import PopupElement from '../../popups';
import PopupDatePicker from '../../popups/datePicker';
import {SliderSuperTab} from '../../slider';

export default class AppPrivateSearchTab extends SliderSuperTab {
  private inputSearch: InputSearch;
  private appSearch: AppSearch;
  private btnPickDate: HTMLElement;

  private peerId: PeerId;
  private threadId = 0;
  private query = '';
  private onDatePick: (timestamp: number) => void;

  onOpenAfterTimeout() {
    this.appSearch.beginSearch(this.peerId, this.threadId, this.query);
  }

  public init(
    peerId: PeerId,
    threadId?: number,
    onDatePick?: AppPrivateSearchTab['onDatePick'],
    query?: string
  ) {
    this.container.id = 'search-private-container';
    this.container.classList.add('chatlist-container');
    this.inputSearch = new InputSearch('Search');
    this.title.replaceWith(this.inputSearch.container);

    this.btnPickDate = ButtonIcon('calendar sidebar-header-right');
    this.header.append(this.btnPickDate);

    const c = document.createElement('div');
    c.classList.add('chatlist-container');
    this.scrollable.container.replaceWith(c);
    this.appSearch = new AppSearch(c, this.inputSearch, {
      messages: new SearchGroup('Chat.Search.PrivateSearch', 'messages')
    });

    if(!this.peerId) {
      this.query = query;
      this.peerId = peerId;
      this.threadId = threadId;
      this.onDatePick = onDatePick;

      this.btnPickDate.classList.toggle('hide', !this.onDatePick);
      if(this.onDatePick) {
        attachClickEvent(this.btnPickDate, () => {
          PopupElement.createPopup(PopupDatePicker, new Date(), this.onDatePick).show();
        }, {listenerSetter: this.listenerSetter});
      }

      query && this.appSearch.searchInput.inputField.setValueSilently(query);

      appSidebarRight.toggleSidebar(true);
    } else {
      this.appSearch.beginSearch(this.peerId, this.threadId, query);
    }
  }
}

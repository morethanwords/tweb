import {Component} from 'solid-js';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import rootScope from '@lib/rootScope';
import AppSearch from '@components/appSearch';
import {createSearchGroup} from '@components/searchGroup';
import ButtonIcon from '@components/buttonIcon';
import InputSearch from '@components/inputSearch';
import showDatePickerPopup from '@components/popups/datePicker';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppPrivateSearchTab} from '@components/solidJsTabs/tabs';

const PrivateSearch: Component = () => {
  const [tab] = useSuperTab<typeof AppPrivateSearchTab>();
  const {appSidebarRight} = useHotReloadGuard();
  const {peerId, threadId, onDatePick, query} = tab.payload;

  let _peerId: PeerId;
  let _threadId = 0;
  let _query = '';
  let _onDatePick: (timestamp: number) => void;

  tab.container.id = 'search-private-container';
  tab.container.classList.add('chatlist-container');
  const inputSearch = new InputSearch({placeholder: 'Search'});
  tab.title.replaceWith(inputSearch.container);

  const btnPickDate = ButtonIcon('calendar sidebar-header-right');
  tab.header.append(btnPickDate);

  const c = document.createElement('div');
  c.classList.add('chatlist-container');
  tab.scrollable.container.replaceWith(c);
  const appSearch = new AppSearch(
    c,
    inputSearch,
    {
      messages: createSearchGroup({name: 'Chat.Search.PrivateSearch', type: 'messages', middleware: tab.middlewareHelper.get()})
    },
    tab.middlewareHelper.get(),
    undefined,
    undefined,
    !!(peerId === rootScope.myId && threadId)
  );

  if(!_peerId) {
    _query = query;
    _peerId = peerId;
    _threadId = threadId;
    _onDatePick = onDatePick;

    btnPickDate.classList.toggle('hide', !_onDatePick);
    if(_onDatePick) {
      attachClickEvent(btnPickDate, () => {
        showDatePickerPopup({initDate: new Date(), onPick: _onDatePick});
      }, {listenerSetter: tab.listenerSetter});
    }

    query && appSearch.searchInput.inputField.setValueSilently(query);

    appSidebarRight.toggleSidebar(true);
  } else {
    appSearch.beginSearch(_peerId, _threadId, query);
  }

  (tab as any)._onOpenAfterTimeout = () => {
    appSearch.beginSearch(_peerId, _threadId, _query);
  };

  return null;
};

export default PrivateSearch;

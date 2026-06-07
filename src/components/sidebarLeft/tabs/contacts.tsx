import {Component, onCleanup, onMount} from 'solid-js';
import appDialogsManager from '@lib/appDialogsManager';
import InputSearch from '@components/inputSearch';
import {IS_MOBILE} from '@environment/userAgent';
import {canFocus} from '@helpers/dom/canFocus';
import windowSize from '@helpers/windowSize';
import ButtonCorner from '@components/buttonCorner';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import showCreateContactPopup from '@components/popups/createContact';
import SortedUserList from '@components/sortedUserList';
import {getMiddleware} from '@helpers/middleware';
import replaceContent from '@helpers/dom/replaceContent';
import rootScope from '@lib/rootScope';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';

const Contacts: Component = () => {
  const [tab] = useSuperTab();

  const middlewareHelperLoad = getMiddleware();
  let inputSearch: InputSearch;
  let sortedUserList: SortedUserList;
  let listsContainer: HTMLElement;

  const createList = () => {
    const _sortedUserList = new SortedUserList({
      managers: tab.managers,
      middleware: tab.middlewareHelper.get()
    });
    const list = _sortedUserList.list;
    list.id = 'contacts';
    list.classList.add('contacts-container');
    appDialogsManager.setListClickListener({
      list,
      withContext: undefined,
      autonomous: true
    });
    return _sortedUserList;
  };

  const openContacts = (query?: string) => {
    middlewareHelperLoad.clean();
    const middleware = middlewareHelperLoad.get();
    tab.scrollable.onScrolledBottom = null;
    listsContainer.replaceChildren();

    tab.managers.appUsersManager.getContactsPeerIds(query, undefined, 'online').then((contacts) => {
      if(!middleware()) {
        return;
      }

      sortedUserList = createList();

      let renderPage = () => {
        const pageCount = windowSize.height / 56 * 1.25 | 0;
        const arr = contacts.splice(0, pageCount); // надо splice!

        arr.forEach((peerId) => {
          sortedUserList.add(peerId);
        });

        if(!contacts.length) {
          renderPage = undefined;
          tab.scrollable.onScrolledBottom = null;
        }
      };

      renderPage();
      tab.scrollable.onScrolledBottom = () => {
        if(renderPage) {
          renderPage();
        } else {
          tab.scrollable.onScrolledBottom = null;
        }
      };

      replaceContent(listsContainer, sortedUserList.list);
    });
  };

  onMount(() => {
    tab.container.id = 'contacts-container';

    const btnAdd = ButtonCorner({icon: 'add', className: 'is-visible'});
    tab.content.append(btnAdd);

    attachClickEvent(btnAdd, () => {
      showCreateContactPopup();
    }, {listenerSetter: tab.listenerSetter});

    inputSearch = new InputSearch({
      placeholder: 'Search',
      onChange: (value) => {
        openContacts(value);
      }
    });

    tab.listenerSetter.add(rootScope)('contacts_update', async(userId) => {
      const isContact = await tab.managers.appUsersManager.isContact(userId);
      const peerId = userId.toPeerId();
      if(isContact) sortedUserList.add(peerId);
      else sortedUserList.delete(peerId);
    });

    tab.title.replaceWith(inputSearch.container);

    listsContainer = document.createElement('div');
    tab.scrollable.append(listsContainer);

    openContacts();

    // Replaces the legacy `focus()` / onOpenAfterTimeout — invoked by the
    // scaffold's onOpenAfterTimeout (see tabs.ts).
    (tab as any)._focusOnOpen = () => {
      if(IS_MOBILE || !canFocus(true)) return;
      inputSearch.input.focus();
    };
  });

  onCleanup(() => {
    middlewareHelperLoad.clean();
  });

  return null;
};

export default Contacts;

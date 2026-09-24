import {Component, createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import appDialogsManager from '@lib/appDialogsManager';
import InputSearch from '@components/inputSearch';
import {IS_MOBILE} from '@environment/userAgent';
import {canFocus} from '@helpers/dom/canFocus';
import ButtonCorner from '@components/buttonCorner';
import ButtonIcon from '@components/buttonIcon';
import {replaceButtonIcon} from '@components/button';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import showCreateContactPopup from '@components/popups/createContact';
import ContactsList from '@components/sidebarLeft/contactsList';
import ContactsSelection from '@components/contactsSelection';
import attachContactsContextMenu from '@components/sidebarLeft/contactsContextMenu';
import type {DialogsSelectionList} from '@components/dialogsSelectionBase';
import {useAppSettings} from '@stores/appSettings';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppContactsTab, AppContactsTabOptions} from '@components/solidJsTabs/tabs';
import {flashControl} from '@lib/settingsSearch/highlight';

const Contacts: Component = () => {
  const [tab] = useSuperTab<typeof AppContactsTab>();

  const [query, setQuery] = createSignal('');
  // * by last seen until switched, and then the way it was switched to on the next visit too
  const [appSettings, setAppSettings] = useAppSettings();
  const sortMode = () => appSettings.contactsSortMode;

  let contactsList: DialogsSelectionList;

  // * the contacts are selected the way the chats are, with a bar standing in for this tab's
  // * header; it goes with the tab
  const selection = new ContactsSelection({
    managers: tab.managers,
    getHeader: () => tab.header,
    getSortedList: () => contactsList,
    getDialogKey: (element) => element.dataset.peerId.toPeerId(),
    listContainer: tab.scrollable.container
  });
  onCleanup(() => selection.cleanup());

  const onList = (list: DialogsSelectionList) => {
    contactsList = list;
    appDialogsManager.setListClickListener({
      list: list.list,
      autonomous: true,
      selection
    });
    attachContactsContextMenu({
      list: list.list,
      selection,
      listenerSetter: tab.listenerSetter
    });
  };

  // * tdesktop's button: it shows the order it switches to, not the one that is on
  const sortButton = ButtonIcon('sort_name sidebar-header-right', {noRipple: true, ariaLabel: 'AccDescrContactSorting'});
  createEffect(() => {
    replaceButtonIcon(sortButton, sortMode() === 'online' ? 'sort_name' : 'sort_online');
  });
  attachClickEvent(sortButton, () => {
    setAppSettings('contactsSortMode', sortMode() === 'online' ? 'name' : 'online');
  }, {listenerSetter: tab.listenerSetter});

  onMount(() => {
    tab.container.id = 'contacts-container';

    const btnAdd = ButtonCorner({icon: 'add', className: 'is-visible', ariaLabel: 'AddContact'});
    tab.content.append(btnAdd);

    attachClickEvent(btnAdd, () => {
      showCreateContactPopup();
    }, {listenerSetter: tab.listenerSetter});

    const inputSearch = new InputSearch({
      placeholder: 'Search',
      onChange: setQuery
    });

    tab.title.replaceWith(inputSearch.container);
    tab.header.append(sortButton);

    // Focusing while the tab is still sliding in scrolls it, so the field waits
    // for the tab to be on screen — the promise the slider resolves for it.
    tab.shown.then(() => {
      // a link that names the sort button points at it rather than at the field
      if((tab.payload as AppContactsTabOptions)?.highlight === 'sort') {
        flashControl(sortButton, tab.middlewareHelper.get());
        return;
      }

      if(IS_MOBILE || !canFocus(true)) return;
      inputSearch.input.focus();
    });
  });

  return (
    <ContactsList
      managers={tab.managers}
      query={query()}
      sortMode={sortMode()}
      scrollable={tab.scrollable.container}
      indexContainer={tab.content}
      selection={selection}
      ref={onList}
    />
  );
};

export default Contacts;

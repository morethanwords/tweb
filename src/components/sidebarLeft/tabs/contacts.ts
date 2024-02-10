/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {SliderSuperTab} from '../../slider';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import InputSearch from '../../inputSearch';
import {IS_MOBILE} from '../../../environment/userAgent';
import {canFocus} from '../../../helpers/dom/canFocus';
import windowSize from '../../../helpers/windowSize';
import ButtonCorner from '../../buttonCorner';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import PopupCreateContact from '../../popups/createContact';
import SortedUserList from '../../sortedUserList';
import {getMiddleware} from '../../../helpers/middleware';
import replaceContent from '../../../helpers/dom/replaceContent';
import rootScope from '../../../lib/rootScope';
import PopupElement from '../../popups';

// TODO: поиск по людям глобальный, если не нашло в контактах никого

export default class AppContactsTab extends SliderSuperTab {
  private inputSearch: InputSearch;
  private middlewareHelperLoad: ReturnType<typeof getMiddleware>;
  private sortedUserList: SortedUserList;
  private listsContainer: HTMLElement;

  public init() {
    this.container.id = 'contacts-container';

    // this.list = appDialogsManager.createChatList(/* {avatarSize: 48, handheldsSize: 66} */);

    const btnAdd = ButtonCorner({icon: 'add', className: 'is-visible'});
    this.content.append(btnAdd);

    attachClickEvent(btnAdd, () => {
      PopupElement.createPopup(PopupCreateContact);
    }, {listenerSetter: this.listenerSetter});

    this.inputSearch = new InputSearch({
      placeholder: 'Search',
      onChange: (value) => {
        this.openContacts(value);
      }
    });

    this.listenerSetter.add(rootScope)('contacts_update', async(userId) => {
      const isContact = await this.managers.appUsersManager.isContact(userId);
      const peerId = userId.toPeerId();
      if(isContact) this.sortedUserList.add(peerId);
      else this.sortedUserList.delete(peerId);
    });

    this.title.replaceWith(this.inputSearch.container);

    this.middlewareHelperLoad = getMiddleware();

    const listsContainer = this.listsContainer = document.createElement('div');
    this.scrollable.append(listsContainer);

    this.openContacts();

    // preload contacts
    // appUsersManager.getContacts();
  }

  protected createList() {
    const sortedUserList = new SortedUserList({
      managers: this.managers,
      middleware: this.middlewareHelper.get()
    });
    const list = sortedUserList.list;
    list.id = 'contacts';
    list.classList.add('contacts-container');
    appDialogsManager.setListClickListener({
      list,
      onFound: () => {
        this.close();
      },
      withContext: undefined,
      autonomous: true
    });
    return sortedUserList;
  }

  protected onClose() {
    this.middlewareHelperLoad.clean();
    /* // need to clear, and left 1 page for smooth slide
    let pageCount = appPhotosManager.windowH / 56 * 1.25 | 0;
    (Array.from(this.list.children) as HTMLElement[]).slice(pageCount).forEach((el) => el.remove()); */
  }

  protected onOpenAfterTimeout() {
    if(IS_MOBILE || !canFocus(true)) return;
    this.inputSearch.input.focus();
  }

  public openContacts(query?: string) {
    this.middlewareHelperLoad.clean();
    const middleware = this.middlewareHelperLoad.get();
    this.scrollable.onScrolledBottom = null;
    this.listsContainer.replaceChildren();

    this.managers.appUsersManager.getContactsPeerIds(query, undefined, 'online').then((contacts) => {
      if(!middleware()) {
        return;
      }

      const sortedUserList = this.sortedUserList = this.createList();

      let renderPage = () => {
        const pageCount = windowSize.height / 56 * 1.25 | 0;
        const arr = contacts.splice(0, pageCount); // надо splice!

        arr.forEach((peerId) => {
          sortedUserList.add(peerId);
        });

        if(!contacts.length) {
          renderPage = undefined;
          this.scrollable.onScrolledBottom = null;
        }
      };

      renderPage();
      this.scrollable.onScrolledBottom = () => {
        if(renderPage) {
          renderPage();
        } else {
          this.scrollable.onScrolledBottom = null;
        }
      };

      replaceContent(this.listsContainer, sortedUserList.list);
    });
  }
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import rootScope from "../../../lib/rootScope";
import InputSearch from "../../inputSearch";
import { isMobile } from "../../../helpers/userAgent";
import { canFocus } from "../../../helpers/dom/canFocus";

// TODO: поиск по людям глобальный, если не нашло в контактах никого

export default class AppContactsTab extends SliderSuperTab {
  private list: HTMLUListElement;
  private promise: Promise<void>;

  private inputSearch: InputSearch;
  private alive = true;
  
  init() {
    this.container.id = 'contacts-container';

    this.list = appDialogsManager.createChatList(/* {avatarSize: 48, handheldsSize: 66} */);
    this.list.id = 'contacts';
    this.list.classList.add('contacts-container');

    appDialogsManager.setListClickListener(this.list, () => {
      (this.container.querySelector('.sidebar-close-button') as HTMLElement).click();
    }, undefined, true);

    this.inputSearch = new InputSearch('Search', (value) => {
      this.list.innerHTML = '';
      this.openContacts(value);
    });

    this.title.replaceWith(this.inputSearch.container);

    this.scrollable.append(this.list);

    // preload contacts
    // appUsersManager.getContacts();
  }

  onClose() {
    this.alive = false;
    /* // need to clear, and left 1 page for smooth slide
    let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
    (Array.from(this.list.children) as HTMLElement[]).slice(pageCount).forEach(el => el.remove()); */
  }

  onOpenAfterTimeout() {
    if(isMobile || !canFocus(true)) return;
    this.inputSearch.input.focus();
  }

  public openContacts(query?: string) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(this.promise) return this.promise;
    this.scrollable.onScrolledBottom = null;

    this.promise = appUsersManager.getContacts(query).then(_contacts => {
      this.promise = null;

      if(!this.alive) {
        //console.warn('user closed contacts before it\'s loaded');
        return;
      }

      const contacts = [..._contacts];

      if(!query) {
        contacts.findAndSplice(u => u === rootScope.myId);
      }
      /* if(query && 'saved messages'.includes(query.toLowerCase())) {
        contacts.unshift(rootScope.myID);
      } */

      let sorted = contacts
      .map(userId => {
        let user = appUsersManager.getUser(userId);
        let status = appUsersManager.getUserStatusForSort(user.status);

        return {user, status};
      })
      .sort((a, b) => b.status - a.status);

      let renderPage = () => {
        let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
        let arr = sorted.splice(0, pageCount); // надо splice!

        arr.forEach(({user}) => {
          let {dialog, dom} = appDialogsManager.addDialogNew({
            dialog: user.id,
            container: this.list,
            drawStatus: false,
            avatarSize: 48,
            autonomous: true
          });
  
          let status = appUsersManager.getUserStatusString(user.id);
          dom.lastMessageSpan.append(status);
        });

        if(!sorted.length) renderPage = undefined;
      };

      renderPage();
      this.scrollable.onScrolledBottom = () => {
        if(renderPage) {
          renderPage();
        } else {
          this.scrollable.onScrolledBottom = null;
        }
      };
    });
  }

  public open() {
    this.openContacts();
    return super.open();
  }
}

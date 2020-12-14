import { SliderTab } from "../../slider";
import Scrollable from "../../scrollable";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import appSidebarLeft, { AppSidebarLeft } from "..";
import rootScope from "../../../lib/rootScope";
import InputSearch from "../../inputSearch";

// TODO: поиск по людям глобальный, если не нашло в контактах никого

export default class AppContactsTab implements SliderTab {
  private container: HTMLElement;
  private list: HTMLUListElement;
  private scrollable: Scrollable;
  private promise: Promise<void>;

  private inputSearch: InputSearch;

  init() {
    this.container = document.getElementById('contacts-container');
    this.list = this.container.querySelector('#contacts');

    appDialogsManager.setListClickListener(this.list);
    this.scrollable = new Scrollable(this.list.parentElement);

    this.inputSearch = new InputSearch('Search', (value) => {
      this.list.innerHTML = '';
      this.openContacts(value);
    });

    this.container.firstElementChild.append(this.inputSearch.container);

    // preload contacts
    // appUsersManager.getContacts();
  }

  // need to clear, and left 1 page for smooth slide
  public onClose() {
    let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
    (Array.from(this.list.children) as HTMLElement[]).slice(pageCount).forEach(el => el.remove());
  }

  public onCloseAfterTimeout() {
    this.list.innerHTML = '';
    this.inputSearch.value = '';
  }

  public openContacts(query?: string) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    if(appSidebarLeft.historyTabIds.indexOf(AppSidebarLeft.SLIDERITEMSIDS.contacts) === -1) {
      appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.contacts);
    }

    if(this.promise) return this.promise;
    this.scrollable.onScrolledBottom = null;

    this.promise = appUsersManager.getContacts(query).then(_contacts => {
      this.promise = null;

      if(appSidebarLeft.historyTabIds[appSidebarLeft.historyTabIds.length - 1] != AppSidebarLeft.SLIDERITEMSIDS.contacts) {
        console.warn('user closed contacts before it\'s loaded');
        return;
      }

      const contacts = [..._contacts];

      if(!query) {
        contacts.findAndSplice(u => u == rootScope.myId);
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
            avatarSize: 48
          });
  
          let status = appUsersManager.getUserStatusString(user.id);
          dom.lastMessageSpan.innerHTML = status == 'online' ? `<i>${status}</i>` : status;
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
}
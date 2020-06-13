import { SliderTab } from "../slider";
import Scrollable from "../scrollable_new";
import appDialogsManager from "../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../lib/appManagers/appUsersManager";
import appPhotosManager from "../../lib/appManagers/appPhotosManager";
import appSidebarLeft, { AppSidebarLeft } from "../../lib/appManagers/appSidebarLeft";
import { $rootScope } from "../../lib/utils";
import SearchInput from "../searchInput";

export default class AppContactsTab implements SliderTab {
  private container = document.getElementById('contacts-container');
  private list = this.container.querySelector('#contacts') as HTMLUListElement;
  private scrollable: Scrollable;
  private promise: Promise<void>;

  private searchInput: SearchInput;

  constructor() {
    appDialogsManager.setListClickListener(this.list);
    this.scrollable = new Scrollable(this.list.parentElement);

    this.searchInput = new SearchInput('Search', (value) => {
      this.list.innerHTML = '';
      this.openContacts(value);
    });

    this.container.firstElementChild.append(this.searchInput.container);

    // preload contacts
    appUsersManager.getContacts();
  }

  // need to clear, and left 1 page for smooth slide
  public onClose() {
    let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
    (Array.from(this.list.children) as HTMLElement[]).slice(pageCount).forEach(el => el.remove());
  }

  public onCloseAfterTimeout() {
    this.list.innerHTML = '';
    this.searchInput.value = '';
  }

  public openContacts(query?: string) {
    if(appSidebarLeft.historyTabIDs.indexOf(AppSidebarLeft.SLIDERITEMSIDS.contacts) === -1) {
      appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.contacts);
    }

    if(this.promise) return this.promise;
    this.scrollable.onScrolledBottom = null;

    this.promise = appUsersManager.getContacts(query).then(contacts => {
      this.promise = null;

      if(appSidebarLeft.historyTabIDs[appSidebarLeft.historyTabIDs.length - 1] != AppSidebarLeft.SLIDERITEMSIDS.contacts) {
        console.warn('user closed contacts before it\'s loaded');
        return;
      }

      contacts = contacts.slice();
      contacts.findAndSplice(u => u == $rootScope.myID);

      let sorted = contacts
      .map(userID => {
        let user = appUsersManager.getUser(userID);
        let status = appUsersManager.getUserStatusForSort(user.status);

        return {user, status};
      })
      .sort((a, b) => b.status - a.status);

      let renderPage = () => {
        let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
        let arr = sorted.splice(0, pageCount); // надо splice!

        arr.forEach(({user}) => {
          let {dialog, dom} = appDialogsManager.addDialog(user.id, this.list, false);
  
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
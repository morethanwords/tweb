//import { logger } from "../polyfill";
import appDialogsManager from "./appDialogsManager";
import { $rootScope } from "../utils";
import appImManager from "./appImManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import AppSearch, { SearchGroup } from "../../components/appSearch";
import { horizontalMenu } from "../../components/misc";
import appUsersManager from "./appUsersManager";
import Scrollable from "../../components/scrollable_new";
import appPhotosManager from "./appPhotosManager";
import { appPeersManager } from "../services";

const SLIDERITEMSIDS = {
  archived: 1,
  contacts: 2
};

class AppSidebarLeft {
  private sidebarEl = document.getElementById('column-left') as HTMLDivElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  
  private menuEl = this.toolsBtn.querySelector('.btn-menu');
  private savedBtn = this.menuEl.querySelector('.menu-saved');
  private archivedBtn = this.menuEl.querySelector('.menu-archive');
  private contactsBtn = this.menuEl.querySelector('.menu-contacts');
  private logOutBtn = this.menuEl.querySelector('.menu-logout');
  public archivedCount = this.archivedBtn.querySelector('.archived-count') as HTMLSpanElement;

  //private log = logger('SL');

  private searchGroups = {
    contacts: new SearchGroup('Contacts and Chats', 'contacts'),
    globalContacts: new SearchGroup('Global Search', 'contacts'),
    messages: new SearchGroup('Global Search', 'messages'),
    people: new SearchGroup('People', 'contacts', false, 'search-group-people'),
    recent: new SearchGroup('Recent', 'contacts', false, 'search-group-recent')
  };
  private globalSearch = new AppSearch(this.searchContainer, this.searchInput, this.searchGroups);

  private _selectTab: (id: number) => void;
  private historyTabIDs: number[] = [];

  private contactsList: HTMLUListElement;
  private contactsScrollable: Scrollable;
  private contactsPromise: Promise<void>;
  private contactsInput: HTMLInputElement;

  constructor() {
    let peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    let peopleScrollable = new Scrollable(peopleContainer, 'x');

    this.savedBtn.addEventListener('click', (e) => {
      ///////this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        let dom = appDialogsManager.getDialogDom(appImManager.myID);
        appImManager.setPeer(appImManager.myID);
      }, 0);
    });
    
    this.archivedBtn.addEventListener('click', (e) => {
      this.selectTab(SLIDERITEMSIDS.archived);
    });

    this.contactsBtn.addEventListener('click', (e) => {
      this.openContacts();
      this.selectTab(SLIDERITEMSIDS.contacts);
    });

    this.logOutBtn.addEventListener('click', (e) => {
      apiManager.logOut();
    });

    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      this.searchContainer.classList.remove('hide');
      void this.searchContainer.offsetWidth; // reflow
      this.searchContainer.classList.add('active');
      
      /* if(!this.globalSearch.searchInput.value) {
        for(let i in this.globalSearch.searchGroups) {
          this.globalSearch.searchGroups[i].clear();
        }
      } */

      false && this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('active');
          this.backBtn.classList.remove('active');
          this.backBtn.click();
        }
        
        /* this.peerID = 0;
        this.loadedCount = 0;
        this.minMsgID = 0; */
      }, {once: true});
    });

    this.backBtn.addEventListener('click', (e) => {
      appDialogsManager.chatsArchivedContainer.classList.remove('active');
      this.toolsBtn.classList.add('active');
      this.backBtn.classList.remove('active');
      this.searchContainer.classList.remove('active');

      setTimeout(() => {
        this.searchContainer.classList.add('hide');
        this.globalSearch.reset();

        this.searchGroups.people.setActive();
        //this.searchGroups.recent.setActive();
      }, 150);
    });

    $rootScope.$on('dialogs_archived_unread', (e: CustomEvent) => {
      this.archivedCount.innerText = '' + e.detail.count;
    });

    this._selectTab = horizontalMenu(null, this.sidebarEl.querySelector('.sidebar-slider') as HTMLDivElement, null, null, 420);
    this._selectTab(0);

    Array.from(this.sidebarEl.querySelectorAll('.sidebar-close-button') as any as HTMLElement[]).forEach(el => {
      el.addEventListener('click', () => {
        console.log('sidebar-close-button click:', this.historyTabIDs);
        let closingID = this.historyTabIDs.pop(); // pop current

        // need to clear, and left 1 page for smooth slide
        if(closingID == SLIDERITEMSIDS.contacts) {
          let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
          (Array.from(this.contactsList.children) as HTMLElement[]).slice(pageCount).forEach(el => el.remove());
          setTimeout(() => {
            this.contactsList.innerHTML = '';
          }, 420);
        }

        this._selectTab(this.historyTabIDs.pop() || 0);
      });
    });

    appUsersManager.getTopPeers().then(categories => {
      console.log('got top categories:', categories);

      let category = categories[0];
      if(!category || !category.peers) {
        return;
      }
      
      category.peers.forEach((topPeer: {
        _: 'topPeer',
        peer: any,
        rating: number
      }) => {
        let peerID = appPeersManager.getPeerID(topPeer.peer);
        let {dialog, dom} = appDialogsManager.addDialog(peerID, this.searchGroups.people.list, false, true, true);

        this.searchGroups.people.setActive();
      });
    });

    let contactsContainer = this.sidebarEl.querySelector('#contacts-container');
    this.contactsInput = contactsContainer.querySelector('#contacts-search');
    this.contactsList = contactsContainer.querySelector('#contacts') as HTMLUListElement;
    appDialogsManager.setListClickListener(this.contactsList);
    this.contactsScrollable = new Scrollable(this.contactsList.parentElement);

    let prevValue = '';
    this.contactsInput.addEventListener('input', () => {
      let value = this.contactsInput.value;
      if(prevValue != value) {
        this.contactsList.innerHTML = '';
        this.openContacts(prevValue = value);
      }
    });

    // preload contacts
    appUsersManager.getContacts();
  }

  public openContacts(query?: string) {
    if(this.contactsPromise) return this.contactsPromise;
    this.contactsScrollable.onScrolledBottom = null;

    this.contactsPromise = appUsersManager.getContacts(query).then(contacts => {
      this.contactsPromise = null;

      if(this.historyTabIDs[this.historyTabIDs.length - 1] != SLIDERITEMSIDS.contacts) {
        console.warn('user closed contacts before it\'s loaded');
        return;
      }

      let sorted = contacts
      .map(userID => {
        let user = appUsersManager.getUser(userID);
        let status = appUsersManager.getUserStatusForSort(user.status);

        return {user, status};
      })
      .sort((a, b) => b.status - a.status);

      let renderPage = () => {
        let pageCount = appPhotosManager.windowH / 72 * 1.25 | 0;
        let arr = sorted.splice(0, pageCount);

        arr.forEach(({user}) => {
          let {dialog, dom} = appDialogsManager.addDialog(user.id, this.contactsList, false);
  
          let status = appUsersManager.getUserStatusString(user.id);
          dom.lastMessageSpan.innerHTML = status == 'online' ? `<i>${status}</i>` : status;
        });

        if(!sorted.length) renderPage = undefined;
      };

      renderPage();
      this.contactsScrollable.onScrolledBottom = () => {
        if(renderPage) {
          renderPage();
        } else {
          this.contactsScrollable.onScrolledBottom = null;
        }
      };
    });
  }

  public selectTab(id: number) {
    this.historyTabIDs.push(id);
    this._selectTab(id);
  }
}

const appSidebarLeft = new AppSidebarLeft();

(window as any).appSidebarLeft = appSidebarLeft;

export default appSidebarLeft;

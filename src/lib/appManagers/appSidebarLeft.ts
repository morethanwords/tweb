//import { logger } from "../polyfill";
import appDialogsManager from "./appDialogsManager";
import { $rootScope } from "../utils";
import appImManager from "./appImManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import AppSearch, { SearchGroup } from "../../components/appSearch";

class AppSidebarLeft {
  private sidebarEl = document.getElementById('column-left') as HTMLDivElement;
  private toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
  private backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;
  private searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;
  private searchInput = document.getElementById('global-search') as HTMLInputElement;
  
  private menuEl = this.toolsBtn.querySelector('.btn-menu');
  private savedBtn = this.menuEl.querySelector('.menu-saved');
  private archivedBtn = this.menuEl.querySelector('.menu-archive');
  private logOutBtn = this.menuEl.querySelector('.menu-logout');
  public archivedCount = this.archivedBtn.querySelector('.archived-count') as HTMLSpanElement;

  //private log = logger('SL');

  private globalSearch = new AppSearch(this.searchContainer, this.searchInput, {
    contacts: new SearchGroup('Contacts and Chats', 'contacts'),
    globalContacts: new SearchGroup('Global Search', 'contacts'),
    messages: new SearchGroup('Global Search', 'messages')
  });

  constructor() {
    this.savedBtn.addEventListener('click', (e) => {
      ///////this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        let dom = appDialogsManager.getDialogDom(appImManager.myID);
        appImManager.setPeer(appImManager.myID);
      }, 0);
    });
    
    this.archivedBtn.addEventListener('click', (e) => {
      appDialogsManager.chatsArchivedContainer.classList.add('active');
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      //this.toolsBtn.classList.remove('tgico-menu', 'btn-menu-toggle');
      //this.toolsBtn.classList.add('tgico-back');
    });

    this.logOutBtn.addEventListener('click', (e) => {
      apiManager.logOut();
    });

    this.searchInput.addEventListener('focus', (e) => {
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      this.searchContainer.classList.add('active');
      
      /* if(!this.globalSearch.searchInput.value) {
        for(let i in this.globalSearch.searchGroups) {
          this.globalSearch.searchGroups[i].clear();
        }
      } */

      this.searchInput.addEventListener('blur', (e) => {
        if(!this.searchInput.value) {
          this.toolsBtn.classList.add('active');
          this.backBtn.classList.remove('active');
          this.searchContainer.classList.remove('active');
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
      this.globalSearch.reset();
    });

    $rootScope.$on('dialogs_archived_unread', (e: CustomEvent) => {
      this.archivedCount.innerText = '' + e.detail.count;
    });

    /* appUsersManager.getTopPeers().then(categories => {
      this.log('got top categories:', categories);
    }); */
  }
}

const appSidebarLeft = new AppSidebarLeft();

(window as any).appSidebarLeft = appSidebarLeft;

export default appSidebarLeft;

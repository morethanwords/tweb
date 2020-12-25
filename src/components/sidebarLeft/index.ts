//import { logger } from "../polyfill";
import { formatNumber } from "../../helpers/number";
import appChatsManager from "../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../lib/appManagers/appDialogsManager";
import appImManager from "../../lib/appManagers/appImManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import appStateManager from "../../lib/appManagers/appStateManager";
import appUsersManager from "../../lib/appManagers/appUsersManager";
import { MOUNT_CLASS_TO } from "../../lib/mtproto/mtproto_config";
import rootScope from "../../lib/rootScope";
import { attachClickEvent, findUpClassName, findUpTag } from "../../helpers/dom";
import AppSearch, { SearchGroup } from "../appSearch";
import "../avatar";
import { parseMenuButtonsTo } from "../misc";
import Scrollable, { ScrollableX } from "../scrollable";
import InputSearch from "../inputSearch";
import SidebarSlider from "../slider";
import { TransitionSlider } from "../transition";
import AppAddMembersTab from "./tabs/addMembers";
import AppArchivedTab from "./tabs/archivedTab";
import AppChatFoldersTab from "./tabs/chatFolders";
import AppContactsTab from "./tabs/contacts";
import AppEditFolderTab from "./tabs/editFolder";
import AppEditProfileTab from "./tabs/editProfile";
import AppIncludedChatsTab from "./tabs/includedChats";
import AppNewChannelTab from "./tabs/newChannel";
import AppNewGroupTab from "./tabs/newGroup";
import AppSettingsTab from "./tabs/settings";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import apiManagerProxy from "../../lib/mtproto/mtprotoworker";
import AppSearchSuper from "../appSearchSuper.";

const newChannelTab = new AppNewChannelTab();
const addMembersTab = new AppAddMembersTab();
const contactsTab = new AppContactsTab();
const newGroupTab = new AppNewGroupTab();
const settingsTab = new AppSettingsTab();
const editProfileTab = new AppEditProfileTab();
const editFolderTab = new AppEditFolderTab();
const includedChatsTab = new AppIncludedChatsTab();
const archivedTab = new AppArchivedTab();

export class AppSidebarLeft extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    archived: 1,
    contacts: 2,
    newChannel: 3,
    addMembers: 4,
    newGroup: 5,
    settings: 6,
    editProfile: 7,
    chatFolders: 8,
    editFolder: 9,
    includedChats: 10,
  };

  private toolsBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  //private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private inputSearch: InputSearch;
  
  private menuEl: HTMLElement;
  private buttons: {
    newGroup: HTMLButtonElement,
    contacts: HTMLButtonElement,
    archived: HTMLButtonElement,
    saved: HTMLButtonElement,
    settings: HTMLButtonElement,
    help: HTMLButtonElement
  } = {} as any;
  public archivedCount: HTMLSpanElement;

  private newBtnMenu: HTMLElement;
  private newButtons: {
    channel: HTMLButtonElement,
    group: HTMLButtonElement,
    privateChat: HTMLButtonElement,
  } = {} as any;

  public archivedTab: AppArchivedTab;
  public newChannelTab: AppNewChannelTab;
  public addMembersTab: AppAddMembersTab;
  public contactsTab: AppContactsTab;
  public newGroupTab: AppNewGroupTab;
  public settingsTab: AppSettingsTab;
  public editProfileTab: AppEditProfileTab;
  public chatFoldersTab: AppChatFoldersTab;
  public editFolderTab: AppEditFolderTab;
  public includedChatsTab: AppIncludedChatsTab;

  //private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  searchSuper: AppSearchSuper;

  constructor() {
    super(document.getElementById('column-left') as HTMLDivElement);

    Object.assign(this.tabs, {
      [AppSidebarLeft.SLIDERITEMSIDS.archived]: archivedTab,
      [AppSidebarLeft.SLIDERITEMSIDS.newChannel]: newChannelTab,
      [AppSidebarLeft.SLIDERITEMSIDS.contacts]: contactsTab,
      [AppSidebarLeft.SLIDERITEMSIDS.addMembers]: addMembersTab,
      [AppSidebarLeft.SLIDERITEMSIDS.newGroup]: newGroupTab,
      [AppSidebarLeft.SLIDERITEMSIDS.settings]: settingsTab,
      [AppSidebarLeft.SLIDERITEMSIDS.editProfile]: editProfileTab,
      [AppSidebarLeft.SLIDERITEMSIDS.chatFolders]: this.chatFoldersTab = new AppChatFoldersTab(appMessagesManager, appPeersManager, this, apiManagerProxy, rootScope),
      [AppSidebarLeft.SLIDERITEMSIDS.editFolder]: editFolderTab,
      [AppSidebarLeft.SLIDERITEMSIDS.includedChats]: includedChatsTab,
    });

    //this._selectTab(0); // make first tab as default

    this.inputSearch = new InputSearch('Telegram Search');
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    this.archivedTab = archivedTab;
    this.newChannelTab = newChannelTab;
    this.addMembersTab = addMembersTab;
    this.contactsTab = contactsTab;
    this.newGroupTab = newGroupTab;
    this.settingsTab = settingsTab;
    this.editProfileTab = editProfileTab;
    this.editFolderTab = editFolderTab;
    this.includedChatsTab = includedChatsTab;

    this.menuEl = this.toolsBtn.querySelector('.btn-menu');
    this.newBtnMenu = this.sidebarEl.querySelector('#new-menu');

    this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});

    parseMenuButtonsTo(this.buttons, this.menuEl.children);
    parseMenuButtonsTo(this.newButtons, this.newBtnMenu.firstElementChild.children);

    this.archivedCount = this.buttons.archived.querySelector('.archived-count') as HTMLSpanElement;

    attachClickEvent(this.buttons.saved, (e) => {
      ///////this.log('savedbtn click');
      setTimeout(() => { // menu doesn't close if no timeout (lol)
        appImManager.setPeer(appImManager.myId);
      }, 0);
    });
    
    attachClickEvent(this.buttons.archived, (e) => {
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.archived);
    });

    attachClickEvent(this.buttons.contacts, (e) => {
      this.contactsTab.openContacts();
    });

    attachClickEvent(this.buttons.settings, (e) => {
      this.settingsTab.fillElements();
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.settings);
    });

    attachClickEvent(this.newButtons.channel, (e) => {
      this.selectTab(AppSidebarLeft.SLIDERITEMSIDS.newChannel);
    });

    [this.newButtons.group, this.buttons.newGroup].forEach(btn => {
      attachClickEvent(btn, (e) => {
        this.addMembersTab.init(0, 'chat', false, (peerIds) => {
          this.newGroupTab.init(peerIds);
        });
      });
    });

    rootScope.on('dialogs_archived_unread', (e) => {
      this.archivedCount.innerText = '' + formatNumber(e.detail.count, 1);
      this.archivedCount.classList.toggle('hide', !e.detail.count);
    });

    appUsersManager.getTopPeers();
  }

  private initSearch() {
    const searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

    const scrollable = new Scrollable(searchContainer);

    this.searchGroups = {
      contacts: new SearchGroup('Chats', 'contacts'),
      globalContacts: new SearchGroup('Global Search', 'contacts'),
      messages: new SearchGroup('Messages', 'messages'),
      people: new SearchGroup('', 'contacts', true, 'search-group-people', true, false),
      recent: new SearchGroup('Recent', 'contacts', true, 'search-group-recent', true, false)
    };

    const searchSuper = this.searchSuper = new AppSearchSuper([{
      inputFilter: 'inputMessagesFilterEmpty',
      name: 'Chats'
    }, {
      inputFilter: 'inputMessagesFilterPhotoVideo',
      name: 'Media'
    }, {
      inputFilter: 'inputMessagesFilterUrl',
      name: 'Links'
    }, {
      inputFilter: 'inputMessagesFilterDocument',
      name: 'Files'
    }, {
      inputFilter: 'inputMessagesFilterMusic',
      name: 'Music'
    }, {
      inputFilter: 'inputMessagesFilterVoice',
      name: 'Voice'
    }], scrollable, this.searchGroups, true);

    scrollable.container.append(searchSuper.container);

    searchSuper.setQuery({
      peerId: 0, 
      folderId: 0
    });
    searchSuper.selectTab(0);
    searchSuper.load(true); 

    this.inputSearch.onChange = (value) => {
      searchSuper.cleanupHTML();
      searchSuper.setQuery({
        peerId: 0, 
        folderId: 0,
        query: value
      });
      searchSuper.load(true);
    };

    searchSuper.tabs.inputMessagesFilterEmpty.addEventListener('click', (e) => {
      const target = findUpTag(e.target, 'LI') as HTMLElement;
      if(!target) {
        return;
      }

      const searchGroup = findUpClassName(target, 'search-group');
      if(!searchGroup || searchGroup.classList.contains('search-group-recent') || searchGroup.classList.contains('search-group-people')) {
        return;
      }

      const peerId = +target.getAttribute('data-peerId');
      appStateManager.getState().then(state => {
        const recentSearch = state.recentSearch || [];
        if(recentSearch[0] != peerId) {
          recentSearch.findAndSplice(p => p == peerId);
          recentSearch.unshift(peerId);
          if(recentSearch.length > 20) {
            recentSearch.length = 20;
          }
  
          appStateManager.pushToState('recentSearch', recentSearch);
          for(const peerId of recentSearch) {
            appStateManager.setPeer(peerId, appPeersManager.getPeer(peerId));
          }
        }
      });
    }, {capture: true});

    let peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    let peopleScrollable = new ScrollableX(peopleContainer);

    let hideNewBtnMenuTimeout: number;
    //const transition = Transition.bind(null, searchContainer.parentElement, 150);
    const transition = TransitionSlider(searchContainer.parentElement, 'zoom-fade', 150, (id) => {
      if(hideNewBtnMenuTimeout) clearTimeout(hideNewBtnMenuTimeout);

      if(id === 0) {
        this.inputSearch.onClearClick();
        hideNewBtnMenuTimeout = window.setTimeout(() => {
          hideNewBtnMenuTimeout = 0;
          this.newBtnMenu.classList.remove('is-hidden');
        }, 150);
      }
    });

    transition(0);

    const onFocus = () => {
      this.toolsBtn.classList.remove('active');
      this.backBtn.classList.add('active');
      this.newBtnMenu.classList.add('is-hidden');

      transition(1);
    };

    this.inputSearch.input.addEventListener('focus', onFocus);
    onFocus();

    this.backBtn.addEventListener('click', (e) => {
      this.toolsBtn.classList.add('active');
      this.backBtn.classList.remove('active');

      transition(0);
    });

    const clearRecentSearchBtn = document.createElement('button');
    clearRecentSearchBtn.classList.add('btn-icon', 'tgico-close');
    this.searchGroups.recent.nameEl.append(clearRecentSearchBtn);
    clearRecentSearchBtn.addEventListener('click', () => {
      this.searchGroups.recent.clear();
      appStateManager.pushToState('recentSearch', []);
    });
  }
}

const appSidebarLeft = new AppSidebarLeft();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appSidebarLeft = appSidebarLeft);
export default appSidebarLeft;

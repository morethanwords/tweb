//import { logger } from "../polyfill";
import { formatNumber } from "../../helpers/number";
import appImManager from "../../lib/appManagers/appImManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import appStateManager from "../../lib/appManagers/appStateManager";
import appUsersManager from "../../lib/appManagers/appUsersManager";
import rootScope from "../../lib/rootScope";
import { attachClickEvent, findUpClassName, findUpTag } from "../../helpers/dom";
import { SearchGroup } from "../appSearch";
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
import { DateData, fillTipDates } from "../../helpers/date";
import AppGeneralSettingsTab from "./tabs/generalSettings";
import AppPrivacyAndSecurityTab from "./tabs/privacyAndSecurity";
import { MOUNT_CLASS_TO } from "../../config/debug";

const contactsTab = new AppContactsTab();
const archivedTab = new AppArchivedTab();

export class AppSidebarLeft extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    archived: 1,
    contacts: 2
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
  public generalSettingsTab: AppGeneralSettingsTab;
  public privacyAndSecurityTab: AppPrivacyAndSecurityTab;

  //private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  searchSuper: AppSearchSuper;

  constructor() {
    super(document.getElementById('column-left') as HTMLDivElement);

    Object.assign(this.tabs, {
      [AppSidebarLeft.SLIDERITEMSIDS.archived]: archivedTab,
      [AppSidebarLeft.SLIDERITEMSIDS.contacts]: contactsTab
    });

    //this._selectTab(0); // make first tab as default

    this.inputSearch = new InputSearch('Telegram Search');
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    this.archivedTab = archivedTab;
    this.newChannelTab = new AppNewChannelTab(this);
    this.contactsTab = contactsTab;
    this.newGroupTab = new AppNewGroupTab(this);
    this.settingsTab = new AppSettingsTab(this);
    this.chatFoldersTab = new AppChatFoldersTab(appMessagesManager, appPeersManager, this, apiManagerProxy, rootScope);
    this.editFolderTab = new AppEditFolderTab(this);
    this.includedChatsTab = new AppIncludedChatsTab(this);
    this.editProfileTab = new AppEditProfileTab(this);
    this.generalSettingsTab = new AppGeneralSettingsTab(this);
    this.privacyAndSecurityTab = new AppPrivacyAndSecurityTab(this);
    this.addMembersTab = new AppAddMembersTab(this);

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
      this.settingsTab.open();
    });

    attachClickEvent(this.newButtons.channel, (e) => {
      this.newChannelTab.open();
    });

    [this.newButtons.group, this.buttons.newGroup].forEach(btn => {
      attachClickEvent(btn, (e) => {
        this.addMembersTab.open({
          peerId: 0,
          type: 'chat',
          skippable: false,
          takeOut: (peerIds) => {
            this.newGroupTab.open(peerIds);
          },
          title: 'Add Members',
          placeholder: 'Add People...'
        });
      });
    });

    rootScope.on('dialogs_archived_unread', (e) => {
      this.archivedCount.innerText = '' + formatNumber(e.count, 1);
      this.archivedCount.classList.toggle('hide', !e.count);
    });

    appUsersManager.getTopPeers();
  }

  private initSearch() {
    const searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

    const scrollable = new Scrollable(searchContainer);

    const close = () => {
      //setTimeout(() => {
        this.backBtn.click();
      //}, 0);
    };

    this.searchGroups = {
      contacts: new SearchGroup('Chats', 'contacts', undefined, undefined, undefined, undefined, close),
      globalContacts: new SearchGroup('Global Search', 'contacts', undefined, undefined, undefined, undefined, close),
      messages: new SearchGroup('Messages', 'messages'),
      people: new SearchGroup('', 'contacts', true, 'search-group-people', true, false, close),
      recent: new SearchGroup('Recent', 'contacts', true, 'search-group-recent', true, true, close)
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

    searchContainer.prepend(searchSuper.nav.parentElement.parentElement);
    scrollable.container.append(searchSuper.container);

    const resetSearch = () => {
      searchSuper.setQuery({
        peerId: 0, 
        folderId: 0
      });
      searchSuper.selectTab(0);
      searchSuper.load(true); 
    };

    resetSearch();

    let pickedElements: HTMLElement[] = [];
    let selectedPeerId = 0;
    let selectedMinDate = 0;
    let selectedMaxDate = 0;
    const updatePicked = () => {
      (this.inputSearch.input as HTMLInputElement).placeholder = pickedElements.length ? 'Search' : 'Telegram Search';
      this.inputSearch.container.classList.toggle('is-picked-twice', pickedElements.length === 2);
      this.inputSearch.container.classList.toggle('is-picked', !!pickedElements.length);

      if(pickedElements.length) {
        this.inputSearch.input.style.setProperty('--paddingLeft', (pickedElements[pickedElements.length - 1].getBoundingClientRect().right - this.inputSearch.input.getBoundingClientRect().left) + 'px');
      } else {
        this.inputSearch.input.style.removeProperty('--paddingLeft');
      }
    };

    const helper = document.createElement('div');
    helper.classList.add('search-helper');
    helper.addEventListener('click', (e) => {
      const target = findUpClassName(e.target, 'selector-user');
      if(!target) {
        return;
      }

      const key = target.dataset.key;
      if(key.indexOf('date_') === 0) {
        const [_, minDate, maxDate] = key.split('_');
        selectedMinDate = +minDate;
        selectedMaxDate = +maxDate;
      } else {
        selectedPeerId = +key;
      }

      target.addEventListener('click', () => {
        unselectEntity(target);
      });

      this.inputSearch.container.append(target);
      this.inputSearch.onChange(this.inputSearch.value = '');
      pickedElements.push(target);
      updatePicked();
    });

    searchSuper.nav.parentElement.append(helper);

    const renderEntity = (peerId: any, title?: string) => {
      const div = document.createElement('div');
      div.classList.add('selector-user'/* , 'scale-in' */);

      const avatarEl = document.createElement('avatar-element');
      avatarEl.classList.add('selector-user-avatar', 'tgico');
      avatarEl.setAttribute('dialog', '1');
      avatarEl.classList.add('avatar-30');

      div.dataset.key = '' + peerId;
      if(typeof(peerId) === 'number') {
        if(title === undefined) {
          title = peerId === rootScope.myId ? 'Saved' : appPeersManager.getPeerTitle(peerId, false, true);
        }

        avatarEl.setAttribute('peer', '' + peerId);
      } else {
        avatarEl.classList.add('tgico-calendarfilter');
      }

      if(title) {
        div.innerHTML = title;
      }

      div.insertAdjacentElement('afterbegin', avatarEl);

      return div;
    };

    const unselectEntity = (target: HTMLElement) => {
      const key = target.dataset.key;
      if(key.indexOf('date_') === 0) {
        selectedMinDate = selectedMaxDate = 0;
      } else {
        selectedPeerId = 0;
      }
      
      target.remove();
      pickedElements.findAndSplice(t => t === target);

      setTimeout(() => {
        updatePicked();
        this.inputSearch.onChange(this.inputSearch.value);
      }, 0);
    };

    this.inputSearch.onClear = () => {
      pickedElements.forEach(el => {
        unselectEntity(el);
      });
    };

    this.inputSearch.onChange = (value) => {
      searchSuper.cleanupHTML();
      searchSuper.setQuery({
        peerId: selectedPeerId, 
        folderId: selectedPeerId ? undefined : 0,
        query: value,
        minDate: selectedMinDate,
        maxDate: selectedMaxDate
      });
      searchSuper.load(true);

      helper.innerHTML = '';
      searchSuper.nav.classList.remove('hide');
      if(!value) {
      }
      
      if(!selectedPeerId && value.trim()) {
        const middleware = searchSuper.getMiddleware();
        Promise.all([
          appMessagesManager.getConversationsAll(value).then(dialogs => dialogs.map(d => d.peerId)),
          appUsersManager.getContacts(value, true)
        ]).then(results => {
          if(!middleware()) return;
          const peerIds = new Set(results[0].concat(results[1]));
  
          peerIds.forEach(peerId => {
            helper.append(renderEntity(peerId));
          });
  
          searchSuper.nav.classList.toggle('hide', !!helper.innerHTML);
          //console.log('got peerIds by value:', value, [...peerIds]);
        });
      }
      
      if(!selectedMinDate && value.trim()) {
        const dates: DateData[] = [];
        fillTipDates(value, dates);
        dates.forEach(dateData => {
          helper.append(renderEntity('date_' + dateData.minDate + '_' + dateData.maxDate, dateData.title));
        });

        searchSuper.nav.classList.toggle('hide', !!helper.innerHTML);
      }
    };

    searchSuper.tabs.inputMessagesFilterEmpty.addEventListener('mousedown', (e) => {
      const target = findUpTag(e.target, 'LI') as HTMLElement;
      if(!target) {
        return;
      }

      const searchGroup = findUpClassName(target, 'search-group');
      if(!searchGroup || searchGroup.classList.contains('search-group-recent') || searchGroup.classList.contains('search-group-people')) {
        return;
      }

      const peerId = +target.getAttribute('data-peer-id');
      appStateManager.getState().then(state => {
        const recentSearch = state.recentSearch || [];
        if(recentSearch[0] !== peerId) {
          recentSearch.findAndSplice(p => p === peerId);
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
        searchSuper.selectTab(0, false);
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

export class SettingSection {
  public container: HTMLElement;
  public content: HTMLElement;
  public title: HTMLElement;
  public caption: HTMLElement;

  constructor(name?: string, caption?: string) {
    this.container = document.createElement('div');
    this.container.classList.add('sidebar-left-section');

    const hr = document.createElement('hr');

    this.content = document.createElement('div');
    this.content.classList.add('sidebar-left-section-content');

    if(name) {
      this.title = document.createElement('div');
      this.title.classList.add('sidebar-left-h2', 'sidebar-left-section-name');
      this.title.innerHTML = name;
      this.content.append(this.title);
    }

    this.container.append(hr, this.content);

    if(caption) {
      this.caption = document.createElement('div');
      this.caption.classList.add('sidebar-left-section-caption');
      this.caption.innerHTML = caption;
      this.container.append(this.caption);
    }
  }
}

export const generateSection = (appendTo: Scrollable, name?: string, caption?: string) => {
  const section = new SettingSection(name, caption);
  appendTo.append(section.container);
  return section.content;
};

const appSidebarLeft = new AppSidebarLeft();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appSidebarLeft = appSidebarLeft);
export default appSidebarLeft;

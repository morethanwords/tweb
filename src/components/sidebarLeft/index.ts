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
import Scrollable, { ScrollableX } from "../scrollable";
import InputSearch from "../inputSearch";
import SidebarSlider from "../slider";
import { TransitionSlider } from "../transition";
import AppNewGroupTab from "./tabs/newGroup";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import AppSearchSuper from "../appSearchSuper.";
import { DateData, fillTipDates } from "../../helpers/date";
import { MOUNT_CLASS_TO } from "../../config/debug";
import AppSettingsTab from "./tabs/settings";
import AppNewChannelTab from "./tabs/newChannel";
import AppContactsTab from "./tabs/contacts";
import AppArchivedTab from "./tabs/archivedTab";
import AppAddMembersTab from "./tabs/addMembers";
import { i18n_, LangPackKey } from "../../lib/langPack";
import ButtonMenu, { ButtonMenuItemOptions } from "../buttonMenu";

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export class AppSidebarLeft extends SidebarSlider {
  private toolsBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  //private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private inputSearch: InputSearch;
  
  private menuEl: HTMLElement;
  public archivedCount: HTMLSpanElement;

  private newBtnMenu: HTMLElement;
  private newButtons: {
    channel: HTMLButtonElement,
    group: HTMLButtonElement,
    privateChat: HTMLButtonElement,
  } = {} as any;

  //private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  searchSuper: AppSearchSuper;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-left') as HTMLDivElement,
      navigationType: 'left'
    });

    //this._selectTab(0); // make first tab as default

    this.inputSearch = new InputSearch('Telegram Search');
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    const onNewGroupClick = () => {
      new AppAddMembersTab(this).open({
        peerId: 0,
        type: 'chat',
        skippable: false,
        takeOut: (peerIds) => {
          new AppNewGroupTab(this).open(peerIds);
        },
        title: 'GroupAddMembers',
        placeholder: 'SendMessageTo'
      });
    };

    const onContactsClick = () => {
      new AppContactsTab(this).open();
    };

    this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    const btnArchive: ButtonMenuItemOptions = {
      icon: 'archive',
      text: 'ChatList.Menu.Archived',
      onClick: () => {
        new AppArchivedTab(this).open();
      }
    };

    const btnMenu = ButtonMenu([{
      icon: 'newgroup',
      text: 'NewGroup',
      onClick: onNewGroupClick
    }, {
      icon: 'user',
      text: 'Contacts',
      onClick: onContactsClick
    }, btnArchive, {
      icon: 'savedmessages',
      text: 'Saved',
      onClick: () => {
        setTimeout(() => { // menu doesn't close if no timeout (lol)
          appImManager.setPeer(appImManager.myId);
        }, 0);
      }
    }, {
      icon: 'settings',
      text: 'Settings',
      onClick: () => {
        new AppSettingsTab(this).open();
      }
    }, {
      icon: 'help btn-disabled',
      text: 'SettingsHelp',
      onClick: () => {

      }
    }]);

    btnMenu.classList.add('bottom-right');

    this.toolsBtn.append(btnMenu);

    this.menuEl = this.toolsBtn.querySelector('.btn-menu');
    this.newBtnMenu = this.sidebarEl.querySelector('#new-menu');

    const _newBtnMenu = ButtonMenu([{
      icon: 'newchannel',
      text: 'NewChannel',
      onClick: () => {
        new AppNewChannelTab(this).open();
      }
    }, {
      icon: 'newgroup',
      text: 'NewGroup',
      onClick: onNewGroupClick
    }, {
      icon: 'newprivate',
      text: 'NewPrivateChat',
      onClick: onContactsClick
    }]);
    _newBtnMenu.classList.add('top-left');
    this.newBtnMenu.append(_newBtnMenu);

    this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});

    //parseMenuButtonsTo(this.newButtons, this.newBtnMenu.firstElementChild.children);

    this.archivedCount = document.createElement('span');
    this.archivedCount.className = 'archived-count badge badge-24 badge-gray';

    btnArchive.element.append(this.archivedCount);

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
      name: 'FilterChats',
      type: 'chats'
    }, {
      inputFilter: 'inputMessagesFilterPhotoVideo',
      name: 'SharedMediaTab2',
      type: 'media'
    }, {
      inputFilter: 'inputMessagesFilterUrl',
      name: 'SharedLinksTab2',
      type: 'links'
    }, {
      inputFilter: 'inputMessagesFilterDocument',
      name: 'SharedFilesTab2',
      type: 'files'
    }, {
      inputFilter: 'inputMessagesFilterMusic',
      name: 'SharedMusicTab2',
      type: 'music'
    }, {
      inputFilter: 'inputMessagesFilterVoice',
      name: 'SharedVoiceTab2',
      type: 'voice'
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

    const activeClassName = 'is-visible';
    const onFocus = () => {
      this.toolsBtn.classList.remove(activeClassName);
      this.backBtn.classList.add(activeClassName);
      this.newBtnMenu.classList.add('is-hidden');
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', true);

      transition(1);
    };

    this.inputSearch.input.addEventListener('focus', onFocus);
    onFocus();

    this.backBtn.addEventListener('click', (e) => {
      this.toolsBtn.classList.add(activeClassName);
      this.backBtn.classList.remove(activeClassName);
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', false);

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

  constructor(options: {
    name?: LangPackKey, 
    caption?: LangPackKey | true,
    noDelimiter?: boolean
  }) {
    this.container = document.createElement('div');
    this.container.classList.add('sidebar-left-section');

    if(!options.noDelimiter) {
      const hr = document.createElement('hr');
      this.container.append(hr);
    } else {
      this.container.classList.add('no-delimiter');
    }

    this.content = this.generateContentElement();

    if(options.name) {
      this.title = document.createElement('div');
      this.title.classList.add('sidebar-left-h2', 'sidebar-left-section-name');
      i18n_({element: this.title, key: options.name});
      this.content.append(this.title);
    }

    if(options.caption) {
      this.caption = this.generateContentElement();
      this.caption.classList.add('sidebar-left-section-caption');

      if(options.caption !== true) {
        i18n_({element: this.caption, key: options.caption});
      }
    }
  }

  public generateContentElement() {
    const content = document.createElement('div');
    content.classList.add('sidebar-left-section-content');
    this.container.append(content);
    return content;
  }
}

export const generateSection = (appendTo: Scrollable, name?: LangPackKey, caption?: LangPackKey) => {
  const section = new SettingSection({name, caption});
  appendTo.append(section.container);
  return section.content;
};

const appSidebarLeft = new AppSidebarLeft();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appSidebarLeft = appSidebarLeft);
export default appSidebarLeft;

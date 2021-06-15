/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { formatNumber } from "../../helpers/number";
import appImManager from "../../lib/appManagers/appImManager";
import appStateManager from "../../lib/appManagers/appStateManager";
import appUsersManager from "../../lib/appManagers/appUsersManager";
import rootScope from "../../lib/rootScope";
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
import { ButtonMenuItemOptions } from "../buttonMenu";
import CheckboxField from "../checkboxField";
import { isMobileSafari } from "../../helpers/userAgent";
import appNavigationController from "../appNavigationController";
import findUpClassName from "../../helpers/dom/findUpClassName";
import findUpTag from "../../helpers/dom/findUpTag";
import PeerTitle from "../peerTitle";
import App from "../../config/app";
import ButtonMenuToggle from "../buttonMenuToggle";
import replaceContent from "../../helpers/dom/replaceContent";
import sessionStorage from "../../lib/sessionStorage";

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export class AppSidebarLeft extends SidebarSlider {
  private toolsBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  //private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private inputSearch: InputSearch;
  
  public archivedCount: HTMLSpanElement;

  private newBtnMenu: HTMLElement;

  //private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  private searchSuper: AppSearchSuper;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-left') as HTMLDivElement,
      navigationType: 'left'
    });

    //this._selectTab(0); // make first tab as default

    this.inputSearch = new InputSearch('Search');
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

    //this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    const btnArchive: ButtonMenuItemOptions & {verify?: () => boolean} = {
      icon: 'archive',
      text: 'ArchivedChats',
      onClick: () => {
        new AppArchivedTab(this).open();
      },
      verify: () => {
        const folder = appMessagesManager.dialogsStorage.getFolder(1);
        return !!folder.length;
      }
    };

    const themeCheckboxField = new CheckboxField({
      toggle: true,
      checked: rootScope.getTheme().name === 'night'
    });
    themeCheckboxField.input.addEventListener('change', () => {
      rootScope.settings.theme = themeCheckboxField.input.checked ? 'night' : 'day';
      appStateManager.pushToState('settings', rootScope.settings);
      appImManager.applyCurrentTheme();
    });

    rootScope.addEventListener('theme_change', () => {
      themeCheckboxField.setValueSilently(rootScope.getTheme().name === 'night');
    });

    const menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean})[] = [{
      icon: 'saved',
      text: 'SavedMessages',
      onClick: () => {
        setTimeout(() => { // menu doesn't close if no timeout (lol)
          appImManager.setPeer(appImManager.myId);
        }, 0);
      }
    }, btnArchive, {
      icon: 'user',
      text: 'Contacts',
      onClick: onContactsClick
    }, {
      icon: 'settings',
      text: 'Settings',
      onClick: () => {
        new AppSettingsTab(this).open();
      }
    }, {
      icon: 'darkmode',
      text: 'DarkMode',
      onClick: () => {
        
      },
      checkboxField: themeCheckboxField
    }, {
      icon: 'animations',
      text: 'Animations',
      onClick: () => {
        
      },
      checkboxField: new CheckboxField({
        toggle: true, 
        checked: true,
        stateKey: 'settings.animationsEnabled',
      })
    }, {
      icon: 'help',
      text: 'TelegramFeatures',
      onClick: () => {
        appImManager.openUsername('TelegramTips');
      }
    }, {
      icon: 'bug',
      text: 'ReportBug',
      onClick: () => {
        const a = document.createElement('a');
        a.target = '_blank';
        a.href = 'https://bugs.telegram.org/?tag_ids=40&sort=time';
        document.body.append(a);
        a.click();
        setTimeout(() => {
          a.remove();
        }, 0);
      }
    }, {
      icon: 'char z',
      text: 'ChatList.Menu.SwitchTo.Z',
      onClick: () => {
        sessionStorage.set({kz_version: 'Z'}).then(() => {
          location.href = 'https://web.telegram.org/z/';
        });
      },
      verify: () => App.isMainDomain
    }, {
      icon: 'char w',
      text: 'ChatList.Menu.SwitchTo.Webogram',
      onClick: () => {
        location.href = 'https://web.telegram.org/?legacy=1';
      },
      verify: () => App.isMainDomain
    }];

    this.toolsBtn = ButtonMenuToggle({}, 'bottom-right', menuButtons, (e) => {
      menuButtons.forEach(button => {
        if(button.verify) {
          button.element.classList.toggle('hide', !button.verify());
        }
      });
    });
    this.toolsBtn.classList.remove('tgico-more');
    this.toolsBtn.classList.add('sidebar-tools-button', 'is-visible');

    this.backBtn.parentElement.insertBefore(this.toolsBtn, this.backBtn);

    const btnMenu = this.toolsBtn.querySelector('.btn-menu') as HTMLElement;

    const btnMenuFooter = document.createElement('div');
    btnMenuFooter.classList.add('btn-menu-footer');
    const t = document.createElement('span');
    t.classList.add('btn-menu-footer-text');
    t.innerHTML = 'Telegram Web' + App.suffix + ' alpha ' + App.version;
    btnMenuFooter.append(t); 
    btnMenu.classList.add('has-footer');
    btnMenu.append(btnMenuFooter);

    this.newBtnMenu = ButtonMenuToggle({}, 'top-left', [{
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
    this.newBtnMenu.className = 'btn-circle rp btn-corner z-depth-1 btn-menu-toggle animated-button-icon';
    this.newBtnMenu.insertAdjacentHTML('afterbegin', `
    <span class="tgico tgico-newchat_filled"></span>
    <span class="tgico tgico-close"></span>
    `);
    this.newBtnMenu.id = 'new-menu';
    sidebarHeader.nextElementSibling.append(this.newBtnMenu);

    this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});

    //parseMenuButtonsTo(this.newButtons, this.newBtnMenu.firstElementChild.children);

    this.archivedCount = document.createElement('span');
    this.archivedCount.className = 'archived-count badge badge-24 badge-gray';

    btnArchive.element.append(this.archivedCount);

    rootScope.addEventListener('dialogs_archived_unread', (e) => {
      this.archivedCount.innerText = '' + formatNumber(e.count, 1);
      this.archivedCount.classList.toggle('hide', !e.count);
    });

    appUsersManager.getTopPeers();

    appStateManager.getState().then(state => {
      const recentSearch = state.recentSearch || [];
      for(let i = 0, length = recentSearch.length; i < length; ++i) {
        appStateManager.requestPeer(recentSearch[i], 'recentSearch');
      }
    });
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
      contacts: new SearchGroup('Search.Chats', 'contacts', undefined, undefined, undefined, undefined, close),
      globalContacts: new SearchGroup('Search.Global', 'contacts', undefined, undefined, undefined, undefined, close),
      messages: new SearchGroup('Search.Messages', 'messages'),
      people: new SearchGroup(false, 'contacts', true, 'search-group-people', true, false, close),
      recent: new SearchGroup('Recent', 'contacts', true, 'search-group-recent', true, true, close)
    };

    const searchSuper = this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
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
      }], 
      scrollable, 
      searchGroups: this.searchGroups, 
      asChatList: true,
      hideEmptyTabs: false,
      showSender: true
    });

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
      //(this.inputSearch.input as HTMLInputElement).placeholder = pickedElements.length ? 'Search' : 'Telegram Search';
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

    const renderEntity = (peerId: any, title?: string | HTMLElement) => {
      const div = document.createElement('div');
      div.classList.add('selector-user'/* , 'scale-in' */);

      const avatarEl = document.createElement('avatar-element');
      avatarEl.classList.add('selector-user-avatar', 'tgico');
      avatarEl.setAttribute('dialog', '1');
      avatarEl.classList.add('avatar-30');

      div.dataset.key = '' + peerId;
      if(typeof(peerId) === 'number') {
        if(title === undefined) {
          title = new PeerTitle({peerId, onlyFirstName: true}).element;
        }

        avatarEl.setAttribute('peer', '' + peerId);
      } else {
        avatarEl.classList.add('tgico-calendarfilter');
      }

      if(title) {
        if(typeof(title) === 'string') {
          div.innerHTML = title;
        } else {
          replaceContent(div, title);
          div.append(title);
        }
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
        const middleware = searchSuper.middleware.get();
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
            appStateManager.requestPeer(peerId, 'recentSearch');
          }
        }
      });
    }, {capture: true});

    let peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    let peopleScrollable = new ScrollableX(peopleContainer);

    let first = true;
    let hideNewBtnMenuTimeout: number;
    //const transition = Transition.bind(null, searchContainer.parentElement, 150);
    const transition = TransitionSlider(searchContainer.parentElement, 'zoom-fade', 150, (id) => {
      if(hideNewBtnMenuTimeout) clearTimeout(hideNewBtnMenuTimeout);

      if(id === 0 && !first) {
        searchSuper.selectTab(0, false);
        this.inputSearch.onClearClick();
        hideNewBtnMenuTimeout = window.setTimeout(() => {
          hideNewBtnMenuTimeout = 0;
          this.newBtnMenu.classList.remove('is-hidden');
        }, 150);
      }

      first = false;
    });

    transition(0);

    const activeClassName = 'is-visible';
    const onFocus = () => {
      this.toolsBtn.classList.remove(activeClassName);
      this.backBtn.classList.add(activeClassName);
      this.newBtnMenu.classList.add('is-hidden');
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', true);

      if(!isMobileSafari && !appNavigationController.findItemByType('global-search')) {
        appNavigationController.pushItem({
          onPop: () => {
            close();
          },
          type: 'global-search'
        });
      }

      transition(1);
    };

    this.inputSearch.input.addEventListener('focus', onFocus);
    onFocus();

    this.backBtn.addEventListener('click', (e) => {
      this.toolsBtn.classList.add(activeClassName);
      this.backBtn.classList.remove(activeClassName);
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', false);

      appNavigationController.removeByType('global-search');

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
MOUNT_CLASS_TO.appSidebarLeft = appSidebarLeft;
export default appSidebarLeft;

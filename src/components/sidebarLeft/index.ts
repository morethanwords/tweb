/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

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
import { FormatterArguments, i18n, i18n_, LangPackKey } from "../../lib/langPack";
import AppPeopleNearbyTab from "./tabs/peopleNearby";
import { ButtonMenuItemOptions } from "../buttonMenu";
import CheckboxField from "../checkboxField";
import { IS_MOBILE_SAFARI } from "../../environment/userAgent";
import appNavigationController from "../appNavigationController";
import findUpClassName from "../../helpers/dom/findUpClassName";
import findUpTag from "../../helpers/dom/findUpTag";
import PeerTitle from "../peerTitle";
import App from "../../config/app";
import ButtonMenuToggle from "../buttonMenuToggle";
import replaceContent from "../../helpers/dom/replaceContent";
import sessionStorage from "../../lib/sessionStorage";
import { attachClickEvent, CLICK_EVENT_NAME } from "../../helpers/dom/clickEvent";
import { closeBtnMenu } from "../misc";
import ButtonIcon from "../buttonIcon";
import confirmationPopup from "../confirmationPopup";
import IS_GEOLOCATION_SUPPORTED from "../../environment/geolocationSupport";
import type SortedUserList from "../sortedUserList";
import Button, { ButtonOptions } from "../button";
import noop from "../../helpers/noop";
import { ripple } from "../ripple";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import formatNumber from "../../helpers/number/formatNumber";

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export class AppSidebarLeft extends SidebarSlider {
  private toolsBtn: HTMLElement;
  private backBtn: HTMLButtonElement;
  //private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private inputSearch: InputSearch;
  
  public archivedCount: HTMLSpanElement;

  private newBtnMenu: HTMLElement;

  //private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  private searchSuper: AppSearchSuper;

  private updateBtn: HTMLElement;
  private hasUpdate: boolean;

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
        const folder = appMessagesManager.dialogsStorage.getFolderDialogs(1, false);
        return !!folder.length || !appMessagesManager.dialogsStorage.isDialogsLoaded(1);
      }
    };

    const themeCheckboxField = new CheckboxField({
      toggle: true,
      checked: rootScope.getTheme().name === 'night'
    });
    themeCheckboxField.input.addEventListener('change', () => {
      rootScope.settings.theme = themeCheckboxField.input.checked ? 'night' : 'day';
      appStateManager.pushToState('settings', rootScope.settings);
      rootScope.dispatchEvent('theme_change');
    });

    rootScope.addEventListener('theme_change', () => {
      themeCheckboxField.setValueSilently(rootScope.getTheme().name === 'night');
    });

    const menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean})[] = [{
      icon: 'saved',
      text: 'SavedMessages',
      onClick: () => {
        setTimeout(() => { // menu doesn't close if no timeout (lol)
          appImManager.setPeer({
            peerId: appImManager.myId
          });
        }, 0);
      }
    }, btnArchive, {
      icon: 'user',
      text: 'Contacts',
      onClick: onContactsClick
    }, IS_GEOLOCATION_SUPPORTED ? {
      icon: 'group',
      text: 'PeopleNearby',
      onClick: () => {
        new AppPeopleNearbyTab(this).open();
      }
    } : undefined, {
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
        appImManager.openUsername({
          userName: 'TelegramTips'
        });
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
        Promise.all([
          sessionStorage.set({kz_version: 'Z'}),
          sessionStorage.delete('tgme_sync')
        ]).then(() => {
          location.href = 'https://web.telegram.org/z/';
        });
      },
      verify: () => App.isMainDomain
    }, {
      icon: 'char w',
      text: 'ChatList.Menu.SwitchTo.Webogram',
      onClick: () => {
        sessionStorage.delete('tgme_sync').then(() => {
          location.href = 'https://web.telegram.org/?legacy=1';
        });
      },
      verify: () => App.isMainDomain
    }];

    const filteredButtons = menuButtons.filter(Boolean);

    this.toolsBtn = ButtonMenuToggle({}, 'bottom-right', filteredButtons, (e) => {
      filteredButtons.forEach(button => {
        if(button.verify) {
          button.element.classList.toggle('hide', !button.verify());
        }
      });
    });
    this.toolsBtn.classList.remove('tgico-more');
    this.toolsBtn.classList.add('sidebar-tools-button', 'is-visible');

    this.backBtn.parentElement.insertBefore(this.toolsBtn, this.backBtn);

    const btnMenu = this.toolsBtn.querySelector('.btn-menu') as HTMLElement;

    const btnMenuFooter = document.createElement('a');
    btnMenuFooter.href = 'https://github.com/morethanwords/tweb/blob/master/CHANGELOG.md';
    btnMenuFooter.target = '_blank';
    btnMenuFooter.rel = 'noopener noreferrer';
    btnMenuFooter.classList.add('btn-menu-footer');
    btnMenuFooter.addEventListener(CLICK_EVENT_NAME, (e) => {
      e.stopPropagation();
      closeBtnMenu();
    });
    const t = document.createElement('span');
    t.classList.add('btn-menu-footer-text');
    t.innerHTML = 'Telegram Web' + App.suffix + ' '/* ' alpha ' */ + App.versionFull;
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

    this.updateBtn = document.createElement('div');
    // this.updateBtn.classList.add('btn-update');
    this.updateBtn.className = 'btn-circle rp btn-corner z-depth-1 btn-update is-hidden';
    ripple(this.updateBtn);
    this.updateBtn.append(i18n('Update'));
    // const weave = new TopbarWeave();
    // const weaveContainer = weave.render('btn-update-weave');
    // this.updateBtn.prepend(weaveContainer);

    attachClickEvent(this.updateBtn, () => {
      location.reload();
    });
    
    sidebarHeader.nextElementSibling.append(this.updateBtn);

    // setTimeout(() => {
    //   weave.componentDidMount();
    //   weave.setCurrentState(GROUP_CALL_STATE.MUTED, true);
    //   weave.setAmplitude(0);
    //   weave.handleBlur();
    // }, 1e3);

    this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});

    //parseMenuButtonsTo(this.newButtons, this.newBtnMenu.firstElementChild.children);

    this.archivedCount = document.createElement('span');
    this.archivedCount.className = 'archived-count badge badge-24 badge-gray';

    btnArchive.element.append(this.archivedCount);

    rootScope.addEventListener('folder_unread', (folder) => {
      if(folder.id === 1) {
        // const count = folder.unreadMessagesCount;
        const count = folder.unreadDialogsCount;
        this.archivedCount.innerText = '' + formatNumber(count, 1);
        this.archivedCount.classList.toggle('hide', !count);
      }
    });

    appUsersManager.getTopPeers('correspondents');

    appStateManager.getState().then(state => {
      const recentSearch = state.recentSearch || [];
      for(let i = 0, length = recentSearch.length; i < length; ++i) {
        appStateManager.requestPeer(recentSearch[i], 'recentSearch');
      }

      const CHECK_UPDATE_INTERVAL = 1800e3;
      const checkUpdateInterval = setInterval(() => {
        fetch('version', {cache: 'no-cache'})
        .then(res => (res.status === 200 && res.ok && res.text()) || Promise.reject())
        .then(text => {
          if(text !== App.versionFull) {
            this.hasUpdate = true;
            clearInterval(checkUpdateInterval);

            if(!this.newBtnMenu.classList.contains('is-hidden')) {
              this.updateBtn.classList.remove('is-hidden');
            }
          }
        })
        .catch(noop);
      }, CHECK_UPDATE_INTERVAL);
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
      contacts: new SearchGroup('SearchAllChatsShort', 'contacts', undefined, undefined, undefined, undefined, close),
      globalContacts: new SearchGroup('GlobalSearch', 'contacts', undefined, undefined, undefined, undefined, close),
      messages: new SearchGroup('SearchMessages', 'messages'),
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
        inputFilter: 'inputMessagesFilterRoundVoice',
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
        peerId: ''.toPeerId(), 
        folderId: 0
      });
      searchSuper.selectTab(0);
      searchSuper.load(true); 
    };

    resetSearch();

    let pickedElements: HTMLElement[] = [];
    let selectedPeerId: PeerId = ''.toPeerId();
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
        selectedPeerId = key.toPeerId();
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

    const renderEntity = (key: PeerId | string, title?: string | HTMLElement) => {
      const div = document.createElement('div');
      div.classList.add('selector-user'/* , 'scale-in' */);

      const avatarEl = document.createElement('avatar-element');
      avatarEl.classList.add('selector-user-avatar', 'tgico');
      avatarEl.setAttribute('dialog', '1');
      avatarEl.classList.add('avatar-30');

      div.dataset.key = '' + key;
      if(key.isPeerId()) {
        if(title === undefined) {
          title = new PeerTitle({peerId: key.toPeerId()}).element;
        }

        avatarEl.setAttribute('peer', '' + key);
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
        selectedPeerId = ''.toPeerId();
      }
      
      target.remove();
      indexOfAndSplice(pickedElements, target);

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
          // appMessagesManager.getConversationsAll(value).then(dialogs => dialogs.map(d => d.peerId)),
          appMessagesManager.getConversations(value).promise.then(({dialogs}) => dialogs.map(d => d.peerId)),
          appUsersManager.getContactsPeerIds(value, true)
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

      const peerId = target.getAttribute('data-peer-id').toPeerId();
      appStateManager.getState().then(state => {
        const recentSearch = state.recentSearch || [];
        if(recentSearch[0] !== peerId) {
          indexOfAndSplice(recentSearch, peerId);
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
          this.hasUpdate && this.updateBtn.classList.remove('is-hidden');
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
      this.updateBtn.classList.add('is-hidden');
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', true);

      if(!IS_MOBILE_SAFARI && !appNavigationController.findItemByType('global-search')) {
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

    const clearRecentSearchBtn = ButtonIcon('close');
    this.searchGroups.recent.nameEl.append(clearRecentSearchBtn);
    clearRecentSearchBtn.addEventListener('click', () => {
      confirmationPopup({
        descriptionLangKey: 'Search.Confirm.ClearHistory',
        button: {
          langKey: 'ClearButton',
          isDanger: true
        }
      }).then(() => {
        appStateManager.getState().then(state => {
          this.searchGroups.recent.clear();
          
          const recentSearch = state.recentSearch || [];
          for(const peerId of recentSearch) {
            appStateManager.releaseSinglePeer(peerId, 'recentSearch');
          }

          recentSearch.length = 0;
          appStateManager.pushToState('recentSearch', recentSearch);
        });
      });
    });
  }
}

export type SettingSectionOptions = {
  name?: LangPackKey, 
  nameArgs?: FormatterArguments,
  caption?: LangPackKey | true,
  noDelimiter?: boolean,
  fakeGradientDelimiter?: boolean,
  noShadow?: boolean,
  // fullWidth?: boolean,
  // noPaddingTop?: boolean
};

const className = 'sidebar-left-section';
export class SettingSection {
  public container: HTMLElement;
  public innerContainer: HTMLElement;
  public content: HTMLElement;
  public title: HTMLElement;
  public caption: HTMLElement;

  private fullWidth: boolean;

  constructor(options: SettingSectionOptions = {}) {
    const container = this.container = document.createElement('div');
    container.classList.add(className + '-container');

    const innerContainer = this.innerContainer = document.createElement('div');
    innerContainer.classList.add(className);

    if(options.noShadow) {
      innerContainer.classList.add('no-shadow');
    }

    if(options.fakeGradientDelimiter) {
      innerContainer.append(generateDelimiter());
      innerContainer.classList.add('with-fake-delimiter');
    } else if(!options.noDelimiter) {
      const hr = document.createElement('hr');
      innerContainer.append(hr);
    } else {
      innerContainer.classList.add('no-delimiter');
    }

    // if(options.fullWidth) {
    //   this.fullWidth = true;
    // }

    // if(options.noPaddingTop) {
    //   innerContainer.classList.add('no-padding-top');
    // }

    const content = this.content = this.generateContentElement();

    if(options.name) {
      const title = this.title = document.createElement('div');
      title.classList.add('sidebar-left-h2', className + '-name');
      i18n_({element: title, key: options.name, args: options.nameArgs});
      content.append(title);
    }

    container.append(innerContainer);

    if(options.caption) {
      const caption = this.caption = this.generateContentElement();
      caption.classList.add(className + '-caption');
      container.append(caption);

      if(options.caption !== true) {
        i18n_({element: caption, key: options.caption});
      }
    }
  }

  public generateContentElement() {
    const content = document.createElement('div');
    content.classList.add(className + '-content');

    // if(this.fullWidth) {
    //   content.classList.add('full-width');
    // }

    this.innerContainer.append(content);
    return content;
  }
}

export const generateSection = (appendTo: Scrollable, name?: LangPackKey, caption?: LangPackKey) => {
  const section = new SettingSection({name, caption});
  appendTo.append(section.container);
  return section.content;
};

export const generateDelimiter = () => {
  const delimiter = document.createElement('div');
  delimiter.classList.add('gradient-delimiter');
  return delimiter;
};

export class SettingChatListSection extends SettingSection {
  public sortedList: SortedUserList;

  constructor(options: SettingSectionOptions & {sortedList: SortedUserList}) {
    super(options);

    this.sortedList = options.sortedList;

    this.content.append(this.sortedList.list);
  }

  public makeButton(options: ButtonOptions) {
    const button = Button('folder-category-button btn btn-primary btn-transparent', options);
    if(this.title) this.content.insertBefore(button, this.title.nextSibling);
    else this.content.prepend(button);
    return button;
  }
}

const appSidebarLeft = new AppSidebarLeft();
MOUNT_CLASS_TO.appSidebarLeft = appSidebarLeft;
export default appSidebarLeft;

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import {SearchGroup} from '../appSearch';
import '../avatar';
import Scrollable, {ScrollableX} from '../scrollable';
import InputSearch from '../inputSearch';
import SidebarSlider from '../slider';
import TransitionSlider from '../transition';
import AppNewGroupTab from './tabs/newGroup';
import AppSearchSuper from '../appSearchSuper.';
import {DateData, fillTipDates} from '../../helpers/date';
import {MOUNT_CLASS_TO} from '../../config/debug';
import AppSettingsTab from './tabs/settings';
import AppNewChannelTab from './tabs/newChannel';
import AppContactsTab from './tabs/contacts';
import AppArchivedTab from './tabs/archivedTab';
import AppAddMembersTab from './tabs/addMembers';
import I18n, {FormatterArguments, i18n, i18n_, LangPackKey} from '../../lib/langPack';
import AppPeopleNearbyTab from './tabs/peopleNearby';
import {ButtonMenuItemOptions} from '../buttonMenu';
import CheckboxField from '../checkboxField';
import {IS_MOBILE_SAFARI} from '../../environment/userAgent';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpTag from '../../helpers/dom/findUpTag';
import PeerTitle from '../peerTitle';
import App from '../../config/app';
import ButtonMenuToggle from '../buttonMenuToggle';
import replaceContent from '../../helpers/dom/replaceContent';
import sessionStorage from '../../lib/sessionStorage';
import {attachClickEvent, CLICK_EVENT_NAME, simulateClickEvent} from '../../helpers/dom/clickEvent';
import ButtonIcon from '../buttonIcon';
import confirmationPopup from '../confirmationPopup';
import IS_GEOLOCATION_SUPPORTED from '../../environment/geolocationSupport';
import type SortedUserList from '../sortedUserList';
import Button, {ButtonOptions} from '../button';
import noop from '../../helpers/noop';
import ripple from '../ripple';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import formatNumber from '../../helpers/number/formatNumber';
import AvatarElement from '../avatar';
import {AppManagers} from '../../lib/appManagers/managers';
import themeController from '../../helpers/themeController';
import contextMenuController from '../../helpers/contextMenuController';
import {DIALOG_LIST_ELEMENT_TAG} from '../../lib/appManagers/appDialogsManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import SettingSection, {SettingSectionOptions} from '../settingSection';
import {FOLDER_ID_ARCHIVE} from '../../lib/mtproto/mtproto_config';
import mediaSizes from '../../helpers/mediaSizes';
import {fastRaf} from '../../helpers/schedulers';
import {getInstallPrompt} from '../../helpers/dom/installPrompt';
import liteMode from '../../helpers/liteMode';
import AppPowerSavingTab from './tabs/powerSaving';

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export class AppSidebarLeft extends SidebarSlider {
  private toolsBtn: HTMLElement;
  private backBtn: HTMLButtonElement;
  // private searchInput = document.getElementById('global-search') as HTMLInputElement;
  private inputSearch: InputSearch;

  public archivedCount: HTMLSpanElement;
  public rect: DOMRect;

  private newBtnMenu: HTMLElement;

  // private log = logger('SL');

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  private searchSuper: AppSearchSuper;

  private updateBtn: HTMLElement;
  private hasUpdate: boolean;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-left') as HTMLDivElement,
      navigationType: 'left'
    });
  }

  construct(managers: AppManagers) {
    this.managers = managers;
    // this._selectTab(0); // make first tab as default

    this.inputSearch = new InputSearch('Search');
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    const onNewGroupClick = () => {
      this.createTab(AppAddMembersTab).open({
        type: 'chat',
        skippable: true,
        takeOut: (peerIds) => this.createTab(AppNewGroupTab).open({peerIds}),
        title: 'GroupAddMembers',
        placeholder: 'SendMessageTo'
      });
    };

    const onContactsClick = () => {
      this.createTab(AppContactsTab).open();
    };

    // this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    const btnArchive: typeof menuButtons[0] = {
      icon: 'archive',
      text: 'ArchivedChats',
      onClick: () => {
        this.createTab(AppArchivedTab).open();
      },
      verify: async() => {
        const folder = await this.managers.dialogsStorage.getFolderDialogs(FOLDER_ID_ARCHIVE, false);
        return !!folder.length || !(await this.managers.dialogsStorage.isDialogsLoaded(FOLDER_ID_ARCHIVE));
      }
    };

    const themeCheckboxField = new CheckboxField({
      toggle: true,
      checked: themeController.getTheme().name === 'night'
    });
    themeCheckboxField.input.addEventListener('change', async() => {
      themeController.switchTheme(themeCheckboxField.input.checked ? 'night' : 'day');
    });

    rootScope.addEventListener('theme_change', () => {
      themeCheckboxField.setValueSilently(themeController.getTheme().name === 'night');
    });

    const menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>})[] = [{
      icon: 'savedmessages',
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
        this.createTab(AppPeopleNearbyTab).open();
      }
    } : undefined, {
      icon: 'settings',
      text: 'Settings',
      onClick: () => {
        this.createTab(AppSettingsTab).open();
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
        checked: liteMode.isAvailable('animations'),
        stateKey: 'settings.liteMode.animations',
        stateValueReverse: true
      }),
      verify: () => !liteMode.isEnabled()
    }, {
      icon: 'animations',
      text: 'LiteMode.Title',
      onClick: () => {
        this.createTab(AppPowerSavingTab).open();
      },
      verify: () => liteMode.isEnabled()
    }, {
      icon: 'help',
      text: 'TelegramFeatures',
      onClick: () => {
        const url = I18n.format('TelegramFeaturesUrl', true);
        appImManager.openUrl(url);
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
      icon: 'char a',
      text: 'ChatList.Menu.SwitchTo.A',
      onClick: () => {
        Promise.all([
          sessionStorage.set({kz_version: 'Z'}),
          sessionStorage.delete('tgme_sync')
        ]).then(() => {
          location.href = 'https://web.telegram.org/a/';
        });
      },
      verify: () => App.isMainDomain
    }, /* {
      icon: 'char w',
      text: 'ChatList.Menu.SwitchTo.Webogram',
      onClick: () => {
        sessionStorage.delete('tgme_sync').then(() => {
          location.href = 'https://web.telegram.org/?legacy=1';
        });
      },
      verify: () => App.isMainDomain
    }, */ {
      icon: 'plusround',
      text: 'PWA.Install',
      onClick: () => {
        const installPrompt = getInstallPrompt();
        installPrompt?.();
      },
      verify: () => !!getInstallPrompt()
    }];

    const filteredButtons = menuButtons.filter(Boolean);

    this.toolsBtn = ButtonMenuToggle({
      direction: 'bottom-right',
      buttons: filteredButtons,
      onOpen: (e, btnMenu) => {
        const btnMenuFooter = document.createElement('a');
        btnMenuFooter.href = 'https://github.com/morethanwords/tweb/blob/master/CHANGELOG.md';
        btnMenuFooter.target = '_blank';
        btnMenuFooter.rel = 'noopener noreferrer';
        btnMenuFooter.classList.add('btn-menu-footer');
        btnMenuFooter.addEventListener(CLICK_EVENT_NAME, (e) => {
          e.stopPropagation();
          contextMenuController.close();
        });
        const t = document.createElement('span');
        t.classList.add('btn-menu-footer-text');
        t.textContent = 'Telegram Web' + App.suffix + ' '/* ' alpha ' */ + App.versionFull;
        btnMenuFooter.append(t);
        btnMenu.classList.add('has-footer');
        btnMenu.append(btnMenuFooter);

        btnArchive.element?.append(this.archivedCount);
      }
    });
    this.toolsBtn.classList.remove('tgico-more');
    this.toolsBtn.classList.add('sidebar-tools-button', 'is-visible');

    this.backBtn.parentElement.insertBefore(this.toolsBtn, this.backBtn);

    this.newBtnMenu = ButtonMenuToggle({
      direction: 'top-left',
      buttons: [{
        icon: 'newchannel',
        text: 'NewChannel',
        onClick: () => {
          this.createTab(AppNewChannelTab).open();
        }
      }, {
        icon: 'newgroup',
        text: 'NewGroup',
        onClick: onNewGroupClick
      }, {
        icon: 'newprivate',
        text: 'NewPrivateChat',
        onClick: onContactsClick
      }]
    });
    this.newBtnMenu.className = 'btn-circle rp btn-corner z-depth-1 btn-menu-toggle animated-button-icon';
    this.newBtnMenu.tabIndex = -1;
    this.newBtnMenu.insertAdjacentHTML('afterbegin', `
    <span class="tgico tgico-newchat_filled"></span>
    <span class="tgico tgico-close"></span>
    `);
    this.newBtnMenu.id = 'new-menu';
    sidebarHeader.nextElementSibling.append(this.newBtnMenu);

    this.updateBtn = document.createElement('div');
    this.updateBtn.className = 'btn-circle rp btn-corner z-depth-1 btn-update is-hidden';
    this.updateBtn.tabIndex = -1;
    ripple(this.updateBtn);
    this.updateBtn.append(i18n('Update'));

    attachClickEvent(this.updateBtn, () => {
      if(this.updateBtn.classList.contains('is-hidden')) {
        return;
      }

      location.reload();
    });

    sidebarHeader.nextElementSibling.append(this.updateBtn);

    this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});

    this.archivedCount = document.createElement('span');
    this.archivedCount.className = 'archived-count badge badge-24 badge-gray';

    rootScope.addEventListener('folder_unread', (folder) => {
      if(folder.id === FOLDER_ID_ARCHIVE) {
        // const count = folder.unreadMessagesCount;
        const count = folder.unreadPeerIds.size;
        this.archivedCount.textContent = '' + formatNumber(count, 1);
        this.archivedCount.classList.toggle('hide', !count);
      }
    });

    this.managers.appUsersManager.getTopPeers('correspondents');

    // Focus search input by pressing Escape
    const navigationItem: NavigationItem = {
      type: 'global-search-focus',
      onPop: () => {
        setTimeout(() => {
          this.inputSearch.input.focus();
        }, 0);

        return false;
      },
      noHistory: true
    };
    appNavigationController.pushItem(navigationItem);

    apiManagerProxy.getState().then((state) => {
      if(!state.keepSigned) {
        return;
      }

      const CHECK_UPDATE_INTERVAL = 1800e3;
      const checkUpdateInterval = setInterval(() => {
        fetch('version', {cache: 'no-cache'})
        .then((res) => (res.status === 200 && res.ok && res.text()) || Promise.reject())
        .then((text) => {
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

    const onResize = () => {
      const rect = this.rect = this.tabsContainer.getBoundingClientRect();
      document.documentElement.style.setProperty('--left-column-width', rect.width + 'px');
    };

    fastRaf(onResize);
    mediaSizes.addEventListener('resize', onResize);
  }

  private initSearch() {
    const searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

    const scrollable = new Scrollable(searchContainer);

    const close = () => {
      // setTimeout(() => {
      simulateClickEvent(this.backBtn);
      // }, 0);
    };

    this.searchGroups = {
      contacts: new SearchGroup('SearchAllChatsShort', 'contacts', undefined, undefined, undefined, undefined, close),
      globalContacts: new SearchGroup('GlobalSearch', 'contacts', undefined, undefined, undefined, undefined, close),
      messages: new SearchGroup('SearchMessages', 'messages'),
      people: new SearchGroup(false, 'contacts', true, 'search-group-people', true, false, close, true),
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
      showSender: true,
      managers: this.managers
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

    const pickedElements: HTMLElement[] = [];
    let selectedPeerId: PeerId = ''.toPeerId();
    let selectedMinDate = 0;
    let selectedMaxDate = 0;
    const updatePicked = () => {
      // (this.inputSearch.input as HTMLInputElement).placeholder = pickedElements.length ? 'Search' : 'Telegram Search';
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

      const avatarEl = new AvatarElement();
      avatarEl.classList.add('selector-user-avatar', 'tgico', 'avatar-30');
      avatarEl.isDialog = true;

      div.dataset.key = '' + key;
      if(key.isPeerId()) {
        if(title === undefined) {
          title = new PeerTitle({peerId: key.toPeerId()}).element;
        }

        avatarEl.updateWithOptions({peerId: key as PeerId});
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
      pickedElements.forEach((el) => {
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

      helper.replaceChildren();
      searchSuper.nav.classList.remove('hide');

      if(!selectedPeerId && value.trim()) {
        const middleware = searchSuper.middleware.get();
        Promise.all([
          this.managers.dialogsStorage.getDialogs({query: value}).then(({dialogs}) => dialogs.map((d) => d.peerId)),
          this.managers.appUsersManager.getContactsPeerIds(value, true)
        ]).then((results) => {
          if(!middleware()) return;
          const peerIds = new Set(results[0].concat(results[1]).slice(0, 20));

          peerIds.forEach((peerId) => {
            helper.append(renderEntity(peerId));
          });

          searchSuper.nav.classList.toggle('hide', !!helper.innerHTML);
        });
      }

      if(!selectedMinDate && value.trim()) {
        const dates: DateData[] = [];
        fillTipDates(value, dates);
        dates.forEach((dateData) => {
          helper.append(renderEntity('date_' + dateData.minDate + '_' + dateData.maxDate, dateData.title));
        });

        searchSuper.nav.classList.toggle('hide', !!helper.innerHTML);
      }
    };

    searchSuper.tabs.inputMessagesFilterEmpty.addEventListener('mousedown', (e) => {
      const target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG) as HTMLElement;
      if(!target) {
        return;
      }

      const searchGroup = findUpClassName(target, 'search-group');
      if(!searchGroup || searchGroup.classList.contains('search-group-recent') || searchGroup.classList.contains('search-group-people')) {
        return;
      }

      const peerId = target.getAttribute('data-peer-id').toPeerId();
      this.managers.appUsersManager.pushRecentSearch(peerId);
    }, {capture: true});

    const peopleContainer = document.createElement('div');
    peopleContainer.classList.add('search-group-scrollable');
    peopleContainer.append(this.searchGroups.people.list);
    this.searchGroups.people.container.append(peopleContainer);
    const peopleScrollable = new ScrollableX(peopleContainer);

    let first = true;
    let hideNewBtnMenuTimeout: number;
    // const transition = Transition.bind(null, searchContainer.parentElement, 150);
    const transition = TransitionSlider({
      content: searchContainer.parentElement,
      type: 'zoom-fade',
      transitionTime: 150,
      onTransitionEnd: (id) => {
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
      }
    });

    transition(0);

    const activeClassName = 'is-visible';
    const onFocus = () => {
      this.toolsBtn.classList.remove(activeClassName);
      this.backBtn.classList.add(activeClassName);
      this.newBtnMenu.classList.add('is-hidden');
      this.updateBtn.classList.add('is-hidden');
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', true);

      const navigationType: NavigationItem['type'] = 'global-search';
      if(!IS_MOBILE_SAFARI && !appNavigationController.findItemByType(navigationType)) {
        appNavigationController.pushItem({
          onPop: () => {
            close();
          },
          type: navigationType
        });
      }

      transition(1);
    };

    this.inputSearch.input.addEventListener('focus', onFocus);
    onFocus();

    attachClickEvent(this.backBtn, (e) => {
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
        return this.managers.appUsersManager.clearRecentSearch().then(() => {
          this.searchGroups.recent.clear();
        });
      });
    });
  }
}

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

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appImManager from '../../lib/appManagers/appImManager';
import rootScope from '../../lib/rootScope';
import {SearchGroup} from '../appSearch';
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
import I18n, {i18n} from '../../lib/langPack';
import AppPeopleNearbyTab from './tabs/peopleNearby';
import {ButtonMenuItemOptions} from '../buttonMenu';
import CheckboxField from '../checkboxField';
import {IS_MOBILE_SAFARI} from '../../environment/userAgent';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpTag from '../../helpers/dom/findUpTag';
import App from '../../config/app';
import ButtonMenuToggle from '../buttonMenuToggle';
import sessionStorage from '../../lib/sessionStorage';
import {attachClickEvent, CLICK_EVENT_NAME, simulateClickEvent} from '../../helpers/dom/clickEvent';
import ButtonIcon from '../buttonIcon';
import confirmationPopup from '../confirmationPopup';
import IS_GEOLOCATION_SUPPORTED from '../../environment/geolocationSupport';
import type SortedUserList from '../sortedUserList';
import Button, {ButtonOptions, replaceButtonIcon} from '../button';
import noop from '../../helpers/noop';
import ripple from '../ripple';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import formatNumber from '../../helpers/number/formatNumber';
import {AppManagers} from '../../lib/appManagers/managers';
import themeController from '../../helpers/themeController';
import contextMenuController from '../../helpers/contextMenuController';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '../../lib/appManagers/appDialogsManager';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import SettingSection, {SettingSectionOptions} from '../settingSection';
import {FOLDER_ID_ARCHIVE, TEST_NO_STORIES} from '../../lib/mtproto/mtproto_config';
import mediaSizes from '../../helpers/mediaSizes';
import {fastRaf} from '../../helpers/schedulers';
import {getInstallPrompt} from '../../helpers/dom/installPrompt';
import liteMode from '../../helpers/liteMode';
import AppPowerSavingTab from './tabs/powerSaving';
import AppMyStoriesTab from './tabs/myStories';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import Icon, {getIconContent} from '../icon';
import AppSelectPeers from '../appSelectPeers';
import setBadgeContent from '../../helpers/setBadgeContent';
import createBadge from '../../helpers/createBadge';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import getAttachMenuBotIcon from '../../lib/appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import flatten from '../../helpers/array/flatten';
import EmojiTab from '../emoticonsDropdown/tabs/emoji';
import {EmoticonsDropdown} from '../emoticonsDropdown';
import cloneDOMRect from '../../helpers/dom/cloneDOMRect';
import {AccountEmojiStatuses, Document, EmojiStatus} from '../../layer';
import filterUnique from '../../helpers/array/filterUnique';
import {Middleware, MiddlewareHelper} from '../../helpers/middleware';
import wrapEmojiStatus from '../wrappers/emojiStatus';
import {makeMediaSize} from '../../helpers/mediaSize';
import ReactionElement from '../chat/reaction';

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export class AppSidebarLeft extends SidebarSlider {
  private toolsBtn: HTMLElement;
  private backBtn: HTMLButtonElement;
  public inputSearch: InputSearch;

  public archivedCount: HTMLSpanElement;
  public rect: DOMRect;

  private newBtnMenu: HTMLElement;

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

    this.inputSearch = new InputSearch();
    (this.inputSearch.input as HTMLInputElement).placeholder = ' ';
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
        const hasArchiveStories = await this.managers.appStoriesManager.hasArchive();
        return !!folder.length || hasArchiveStories || !(await this.managers.dialogsStorage.isDialogsLoaded(FOLDER_ID_ARCHIVE));
      }
    };

    const themeCheckboxField = new CheckboxField({
      toggle: true,
      checked: themeController.getTheme().name === 'night'
    });
    themeCheckboxField.input.addEventListener('change', () => {
      const item = findUpClassName(themeCheckboxField.label, 'btn-menu-item');
      const icon = item.querySelector('.tgico');
      const rect = icon.getBoundingClientRect();
      themeController.switchTheme(themeCheckboxField.checked ? 'night' : 'day', {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    });

    rootScope.addEventListener('theme_changed', () => {
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
      icon: 'stories',
      text: 'MyStories.Title',
      onClick: () => {
        this.createTab(AppMyStoriesTab).open();
      },
      verify: () => !TEST_NO_STORIES
    }, {
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
        stateKey: joinDeepPath('settings', 'liteMode', 'animations'),
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
      icon: 'char' as Icon,
      className: 'a',
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
    const filteredButtonsSliced = filteredButtons.slice();
    this.toolsBtn = ButtonMenuToggle({
      direction: 'bottom-right',
      buttons: filteredButtons,
      onOpenBefore: async() => {
        const attachMenuBots = await this.managers.appAttachMenuBotsManager.getAttachMenuBots();
        const buttons = filteredButtonsSliced.slice();
        const attachMenuBotsButtons = attachMenuBots.filter((attachMenuBot) => {
          return attachMenuBot.pFlags.show_in_side_menu;
        }).map((attachMenuBot) => {
          const icon = getAttachMenuBotIcon(attachMenuBot);
          const button: typeof buttons[0] = {
            regularText: wrapEmojiText(attachMenuBot.short_name),
            onClick: () => {
              appImManager.openWebApp({
                attachMenuBot,
                botId: attachMenuBot.bot_id,
                isSimpleWebView: true,
                fromSideMenu: true
              });
            },
            iconDoc: icon?.icon as MyDocument,
            new: attachMenuBot.pFlags.side_menu_disclaimer_needed || attachMenuBot.pFlags.inactive
          };

          return button;
        });

        buttons.splice(3, 0, ...attachMenuBotsButtons);
        filteredButtons.splice(0, filteredButtons.length, ...buttons);
      },
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

        const a = btnMenu.querySelector('.a .btn-menu-item-icon');
        if(a) a.textContent = 'A';

        btnArchive.element?.append(this.archivedCount);
      },
      noIcon: true
    });
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
      }],
      noIcon: true
    });
    this.newBtnMenu.className = 'btn-circle rp btn-corner z-depth-1 btn-menu-toggle animated-button-icon';
    this.newBtnMenu.tabIndex = -1;
    const icons: Icon[] = ['newchat_filled', 'close'];
    this.newBtnMenu.prepend(...icons.map((icon, idx) => Icon(icon, 'animated-button-icon-icon', 'animated-button-icon-icon-' + (idx === 0 ? 'first' : 'last'))));
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

    this.archivedCount = createBadge('span', 24, 'gray');
    this.archivedCount.classList.add('archived-count');

    rootScope.addEventListener('folder_unread', (folder) => {
      if(folder.id === FOLDER_ID_ARCHIVE) {
        // const count = folder.unreadMessagesCount;
        const count = folder.unreadPeerIds.size;
        setBadgeContent(this.archivedCount, count ? '' + formatNumber(count, 1) : '');
      }
    });

    let statusMiddlewareHelper: MiddlewareHelper, fireOnNew: boolean;
    const premiumMiddlewareHelper = this.getMiddleware().create();
    const statusBtnIcon = ButtonIcon(' sidebar-emoji-status', {noRipple: true});
    attachClickEvent(statusBtnIcon, () => {
      const emojiTab = new EmojiTab({
        noRegularEmoji: true,
        managers: rootScope.managers,
        mainSets: () => {
          const defaultStatuses = this.managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultStatuses')
          .then((stickerSet) => {
            return stickerSet.documents.map((doc) => doc.id);
          });

          const convertEmojiStatuses = (emojiStatuses: AccountEmojiStatuses) => {
            return (emojiStatuses as AccountEmojiStatuses.accountEmojiStatuses)
            .statuses
            .map((status) => (status as EmojiStatus.emojiStatus).document_id)
            .filter(Boolean);
          };

          return [
            Promise.all([
              defaultStatuses,
              this.managers.appUsersManager.getRecentEmojiStatuses().then(convertEmojiStatuses),
              this.managers.appUsersManager.getDefaultEmojiStatuses().then(convertEmojiStatuses),
              this.managers.appEmojiManager.getRecentEmojis('custom')
            ]).then((arrays) => {
              return filterUnique(flatten(arrays));
            })
          ];
        },
        onClick: async(emoji) => {
          emoticonsDropdown.hideAndDestroy();

          const noStatus = getIconContent('star') === emoji.emoji;
          let emojiStatus: EmojiStatus;
          if(noStatus) {
            emojiStatus = {
              _: 'emojiStatusEmpty'
            };
          } else {
            emojiStatus = {
              _: 'emojiStatus',
              document_id: emoji.docId
            };

            fireOnNew = true;
          }

          this.managers.appUsersManager.updateEmojiStatus(emojiStatus);
        }
      });

      const emoticonsDropdown = new EmoticonsDropdown({
        tabsToRender: [emojiTab],
        customParentElement: document.body,
        getOpenPosition: () => {
          const rect = statusBtnIcon.getBoundingClientRect();
          const cloned = cloneDOMRect(rect);
          cloned.left = rect.left + rect.width / 2;
          cloned.top = rect.top + rect.height / 2;
          return cloned;
        }
      });

      const textColor = 'primary-color';

      emoticonsDropdown.setTextColor(textColor);

      emoticonsDropdown.addEventListener('closed', () => {
        emoticonsDropdown.hideAndDestroy();
      });

      emoticonsDropdown.onButtonClick();

      emojiTab.initPromise.then(() => {
        const emojiElement = Icon('star', 'super-emoji-premium-icon');
        emojiElement.style.color = `var(--${textColor})`;

        const category = emojiTab.getCustomCategory();

        emojiTab.addEmojiToCategory({
          category,
          element: emojiElement,
          batch: false,
          prepend: true
          // active: !iconEmojiId
        });

        // if(iconEmojiId) {
        //   emojiTab.setActive({docId: iconEmojiId, emoji: ''});
        // }
      });
    });

    const wrapStatus = async(middleware: Middleware) => {
      const user = apiManagerProxy.getUser(rootScope.myId.toUserId());
      const emojiStatus = user.emoji_status as EmojiStatus.emojiStatus;
      if(!emojiStatus) {
        statusBtnIcon.replaceChildren();
        replaceButtonIcon(statusBtnIcon, 'star');
        return;
      }

      fireOnNew && ReactionElement.fireAroundAnimation({
        middleware: statusMiddlewareHelper?.get() || this.getMiddleware(),
        reaction: {
          _: 'reactionCustomEmoji',
          document_id: emojiStatus.document_id
        },
        sizes: {
          genericEffect: 26,
          genericEffectSize: 100,
          size: 22 + 18,
          effectSize: 80
        },
        stickerContainer: statusBtnIcon,
        cache: statusBtnIcon as any,
        textColor: 'primary-color'
      });

      fireOnNew = false;

      const container = await wrapEmojiStatus({
        wrapOptions: {
          middleware
        },
        emojiStatus,
        size: makeMediaSize(24, 24)
      });

      container.classList.replace('emoji-status', 'sidebar-emoji-status-emoji');

      statusBtnIcon.replaceChildren(container);
    };

    const onPremium = async(isPremium: boolean) => {
      premiumMiddlewareHelper.clean();
      const middleware = premiumMiddlewareHelper.get();
      if(isPremium) {
        await wrapStatus((statusMiddlewareHelper = middleware.create()).get());
        if(!middleware()) return;
        sidebarHeader.append(statusBtnIcon);

        const onEmojiStatusChange = () => {
          const oldStatusMiddlewareHelper = statusMiddlewareHelper;
          wrapStatus((statusMiddlewareHelper = middleware.create()).get())
          .finally(() => {
            oldStatusMiddlewareHelper.destroy();
          });
        };

        rootScope.addEventListener('emoji_status_change', onEmojiStatusChange);

        middleware.onClean(() => {
          rootScope.removeEventListener('emoji_status_change', onEmojiStatusChange);
        });
      } else {
        statusBtnIcon.remove();
      }

      appDialogsManager.resizeStoriesList?.();
    };

    appImManager.addEventListener('premium_toggle', onPremium);
    if(rootScope.premium) onPremium(true);

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
    scrollable.append(searchSuper.container);

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
      pickedElements.forEach((element, idx) => {
        element.classList.remove('is-first', 'is-last');
        element.classList.add(idx === 0 ? 'is-first' : 'is-last');
      });

      if(pickedElements.length) {
        this.inputSearch.input.style.setProperty(
          '--paddingLeft',
          (pickedElements[pickedElements.length - 1].getBoundingClientRect().right - this.inputSearch.input.getBoundingClientRect().left) + 'px'
        );
      } else {
        this.inputSearch.input.style.removeProperty('--paddingLeft');
      }
    };

    const helperMiddlewareHelper = this.middlewareHelper.get().create();
    const helper = document.createElement('div');
    helper.classList.add('search-helper', 'hide');
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
      return AppSelectPeers.renderEntity({
        key,
        title,
        middleware: helperMiddlewareHelper.get(),
        avatarSize: 30,
        fallbackIcon: 'calendarfilter'
      }).element;
    };

    const unselectEntity = (target: HTMLElement) => {
      const key = target.dataset.key;
      if(key.indexOf('date_') === 0) {
        selectedMinDate = selectedMaxDate = 0;
      } else {
        selectedPeerId = ''.toPeerId();
      }

      target.middlewareHelper.destroy();
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

      helper.replaceChildren();
      onHelperLength();
    };

    const onHelperLength = (hide = !helper.firstElementChild) => {
      helper.classList.toggle('hide', hide);
      searchSuper.nav.classList.toggle('hide', !hide);
    };

    const appendToHelper = (elements: HTMLElement[]) => {
      helper.append(...elements);
      onHelperLength();
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

      helperMiddlewareHelper.clean();
      onHelperLength(true);

      const promises: MaybePromise<HTMLElement[]>[] = [];

      if(!selectedMinDate && value.trim()) {
        const dates: DateData[] = [];
        fillTipDates(value, dates);
        const elements = dates.map((dateData) => {
          return renderEntity('date_' + dateData.minDate + '_' + dateData.maxDate, dateData.title);
        });

        promises.push(elements);
      }

      if(!selectedPeerId && value.trim()) {
        const middleware = searchSuper.middleware.get();
        const promise = Promise.all([
          this.managers.dialogsStorage.getDialogs({query: value}).then(({dialogs}) => dialogs.map((d) => d.peerId)),
          this.managers.appUsersManager.getContactsPeerIds(value, true)
        ]).then((results) => {
          if(!middleware()) return;
          const peerIds = new Set(results[0].concat(results[1]).slice(0, 20));

          return [...peerIds].map((peerId) => renderEntity(peerId));
        });

        promises.push(promise);
      }

      Promise.all(promises).then((arrays) => {
        helper.replaceChildren();
        const flattened = flatten(arrays);
        appendToHelper(flattened);
      });
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
      onTransitionStart: (id) => {
        searchContainer.parentElement.parentElement.classList.toggle('is-search-active', id === 1);
      },
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

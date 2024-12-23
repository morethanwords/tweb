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
import ButtonMenu, {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from '../buttonMenu';
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
import {doubleRaf, fastRaf} from '../../helpers/schedulers';
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
import {AccountEmojiStatuses, EmojiStatus, User} from '../../layer';
import filterUnique from '../../helpers/array/filterUnique';
import {Middleware, MiddlewareHelper} from '../../helpers/middleware';
import wrapEmojiStatus from '../wrappers/emojiStatus';
import {makeMediaSize} from '../../helpers/mediaSize';
import ReactionElement from '../chat/reaction';
import setBlankToAnchor from '../../lib/richTextProcessor/setBlankToAnchor';
import AccountController from '../../lib/accounts/accountController';
import {ActiveAccountNumber} from '../../lib/accounts/types';
import {MAX_ACCOUNTS, MAX_ACCOUNTS_FREE} from '../../lib/accounts/constants';
import {getCurrentAccount} from '../../lib/accounts/getCurrentAccount';
import {createProxiedManagersForAccount} from '../../lib/appManagers/getProxiedManagers';
import limitSymbols from '../../helpers/string/limitSymbols';
import {injectMediaEditorLangPack} from '../mediaEditor/langPack';
import attachFloatingButtonMenu from '../floatingButtonMenu';
import filterAsync from '../../helpers/array/filterAsync';
import pause from '../../helpers/schedulers/pause';
import AccountsLimitPopup from './accountsLimitPopup';
import {changeAccount} from '../../lib/accounts/changeAccount';
import {UiNotificationsManager} from '../../lib/appManagers/uiNotificationsManager';
import {updateStorageForWebA} from '../../lib/updateStorageForWebA';
import {renderFoldersSidebarContent} from './foldersSidebarContent';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import SwipeHandler, {getEvent} from '../swipeHandler';
import clamp from '../../helpers/number/clamp';
import {animateValue} from '../mediaEditor/utils';
import throttle from '../../helpers/schedulers/throttle';
import AppChatFoldersTab from './tabs/chatFolders';

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

type SearchInitResult = {
  open: () => void;
  close: () => void;
}

export class AppSidebarLeft extends SidebarSlider {
  private chatListContainer: HTMLElement;
  private buttonsContainer: HTMLElement;
  private toolsBtn: HTMLElement;
  private backBtn: HTMLButtonElement;
  public inputSearch: InputSearch;

  public archivedCount: HTMLSpanElement;
  private totalNotificationsCount: HTMLSpanElement;
  public rect: DOMRect;

  private newBtnMenu: HTMLElement;

  private searchGroups: {[k in 'contacts' | 'globalContacts' | 'messages' | 'people' | 'recent']: SearchGroup} = {} as any;
  private searchSuper: AppSearchSuper;
  private searchInitResult: SearchInitResult;
  private isSearchActive = false;
  private searchTriggerWhenCollapsed: HTMLElement;

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
    const mainMiddleware = this.middlewareHelper.get();
    const foldersSidebar = document.getElementById('folders-sidebar');
    renderFoldersSidebarContent(foldersSidebar, SolidJSHotReloadGuardProvider, mainMiddleware);

    this.chatListContainer = document.getElementById('chatlist-container');
    this.inputSearch = new InputSearch();
    (this.inputSearch.input as HTMLInputElement).placeholder = ' ';
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    // this.toolsBtn = this.sidebarEl.querySelector('.sidebar-tools-button') as HTMLButtonElement;
    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    injectMediaEditorLangPack();

    this.toolsBtn = this.createToolsMenu();

    this.toolsBtn.classList.add('sidebar-tools-button', 'is-visible');
    this.totalNotificationsCount = createBadge('span', 20, 'primary');
    this.toolsBtn.append(this.totalNotificationsCount);

    rootScope.addEventListener('notification_count_update', async() => {
      const notificationsCount = await UiNotificationsManager.getNotificationsCountForAllAccounts();
      const count = Object.entries(notificationsCount).reduce(
        (prev, [accountNumber, count]) =>
          prev +
          (+accountNumber !== getCurrentAccount() ? count || 0 : 0)
        , 0);

      setBadgeContent(this.totalNotificationsCount, '' + (count || ''));
    });

    this.backBtn.parentElement.insertBefore(this.toolsBtn, this.backBtn);

    this.buttonsContainer = this.backBtn.parentElement;

    this.newBtnMenu = this.createNewBtnMenu(true);
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
        },
        canHaveEmojiTimer: true
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

    this.searchTriggerWhenCollapsed = document.createElement('div');
    this.searchTriggerWhenCollapsed.className = 'sidebar-header-search-trigger';
    this.searchTriggerWhenCollapsed.append(ButtonIcon('search'));
    this.searchTriggerWhenCollapsed.addEventListener('click', () => {
      this.initSearch().open();
      this.inputSearch.input.focus();
    });

    this.buttonsContainer.parentElement.prepend(this.searchTriggerWhenCollapsed);

    const sidebarOverlay = document.querySelector('.sidebar-left-overlay');
    sidebarOverlay.addEventListener('click', () => {
      this.closeEverythingInisde();
    });

    this.initSidebarResize();
    appDialogsManager.onForumTabToggle = () => {
      this.onSomethingOpenInsideChange();
    }
  }

  public isCollapsed() {
    return this.sidebarEl.classList.contains('is-collapsed')
  }

  public hasFoldersSidebar() {
    return document.body.classList.contains('has-folders-sidebar')
  }

  public onCollapsedChange() {
    this.chatListContainer.parentElement.classList.toggle('fade', this.isCollapsed());
    this.chatListContainer.parentElement.classList.toggle('zoom-fade', !this.isCollapsed());
    appDialogsManager.xd.toggleAvatarUnreadBadges(this.isCollapsed(), undefined);
  }

  public hasSomethingOpenInside() {
    return this.hasTabsInNavigation() || this.isSearchActive || !!appDialogsManager.forumTab;
  }

  public closeEverythingInisde() {
    this.closeSearch();
    appDialogsManager.toggleForumTab();
    return this.closeAllTabs();
  }

  private onSomethingOpenInsideChange = (closingSearch = false, force = false) => {
    const wasFloating = this.sidebarEl.classList.contains('has-open-tabs');
    const isFloating = force || this.hasSomethingOpenInside();
    const isCollapsed = this.isCollapsed();

    this.sidebarEl.classList.toggle('has-open-tabs', isFloating);
    this.sidebarEl.classList.toggle('has-real-tabs', this.hasTabsInNavigation());

    const sidebarPlaceholder = document.querySelector('.sidebar-left-placeholder');

    if(wasFloating === isFloating || !isCollapsed) return;

    const WIDTH_WHEN_COLLAPSED = 80;
    const FULL_WIDTH = 420;

    const t = (this.chatListContainer.firstElementChild as HTMLElement)
    if(isFloating) {
      t.style.width = WIDTH_WHEN_COLLAPSED + 'px';
      this.sidebarEl.classList.add('force-hide-large-content', 'force-hide-menu');
      !this.isSearchActive && this.sidebarEl.classList.add('force-hide-search');

      animateValue(WIDTH_WHEN_COLLAPSED, FULL_WIDTH, 300, (value) => {
        this.sidebarEl.style.setProperty('--sidebar-left-width-when-collapsed', value + 'px');
      }, {
        onEnd: () => {
          this.sidebarEl.style.removeProperty('--sidebar-left-width-when-collapsed');
          t.style.removeProperty('width');
          this.sidebarEl.classList.remove(
            'force-hide-large-content',
            'force-hide-menu',
            'force-hide-search'
          );
        }
      });
      appDialogsManager.xd.toggleAvatarUnreadBadges(false, undefined);
    } else {
      sidebarPlaceholder.classList.add('keep-active');
      this.sidebarEl.classList.add('force-fixed', 'hide-add-folders');
      closingSearch && this.sidebarEl.classList.add('animate-search-out');

      this.buttonsContainer.classList.add('force-static', 'is-visible');
      closingSearch && this.hasFoldersSidebar() && this.toolsBtn.parentElement.firstElementChild.classList.add('state-back');

      t.style.width = WIDTH_WHEN_COLLAPSED + 'px';

      animateValue(FULL_WIDTH, WIDTH_WHEN_COLLAPSED, 300, (value) => {
        this.sidebarEl.style.setProperty('--sidebar-left-width-when-collapsed', value + 'px');
      }, {
        onEnd: () => {
          this.sidebarEl.style.removeProperty('--sidebar-left-width-when-collapsed');
          this.sidebarEl.classList.remove('force-fixed', 'hide-add-folders', 'animate-search-out');
          sidebarPlaceholder.classList.remove('keep-active');
          appDialogsManager.xd.toggleAvatarUnreadBadges(true, undefined);
          t.style.removeProperty('width');
          this.buttonsContainer.classList.remove('force-static');
          this.buttonsContainer.classList.remove('is-visible');
          this.buttonsContainer.style.transition = 'none';

          pause(200).then(() => {
            this.buttonsContainer.style.removeProperty('transition');
            this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', false);
          });
        }
      });
    }
  }

  private initSidebarResize() {
    this.onTabsCountChange = () => {
      this.onSomethingOpenInsideChange();
    }

    const MIN_SIDEBAR_WIDTH = 260;
    const MAX_SIDEBAR_WIDTH = 420;

    const resizeHandle = document.createElement('div');
    resizeHandle.classList.add('sidebar-resize-handle');
    this.sidebarEl.append(resizeHandle);

    const throttledSetToStorage = throttle((width: number) => {
      localStorage.setItem('sidebar-left-width', width + '');
    }, 200);

    new SwipeHandler({
      element: resizeHandle,
      setCursorTo: document.body,
      onStart: () => {
        resizeHandle.classList.add('is-active');
      },
      onSwipe: (_, __, _e) => {
        const e = getEvent(_e);
        const rect = this.sidebarEl.getBoundingClientRect();

        const width = e.clientX - rect.left;
        const clampedWidth = Math.round(clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));

        document.documentElement.style.setProperty('--current-sidebar-left-width', clampedWidth + 'px');

        const wasCollapsed = this.isCollapsed();
        const isCollapsed = !this.hasSomethingOpenInside() && width < MIN_SIDEBAR_WIDTH * 0.65;
        this.sidebarEl.classList.toggle('is-collapsed', isCollapsed);

        if(isCollapsed !== wasCollapsed)
          this.onCollapsedChange();

        appImManager.adjustChatPatternBackground();

        throttledSetToStorage(isCollapsed ? 0 : clampedWidth);
      },
      onReset: () => {
        resizeHandle.classList.remove('is-active');
      }
    })
  }

  public createToolsMenu(mountTo?: HTMLElement, closeBefore?: boolean) {
    const closeTabsBefore = async(clb: () => void) => {
      if(closeBefore) {
        this.closeEverythingInisde() && await pause(200);
      }

      clb();
    }

    const btnArchive: typeof menuButtons[0] = {
      icon: 'archive',
      text: 'ArchivedChats',
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppArchivedTab).open();
        });
      },
      verify: async() => {
        const folder = await this.managers.dialogsStorage.getFolderDialogs(FOLDER_ID_ARCHIVE, false);
        const hasArchiveStories = await this.managers.appStoriesManager.hasArchive();
        return !!folder.length || hasArchiveStories || !(await this.managers.dialogsStorage.isDialogsLoaded(FOLDER_ID_ARCHIVE));
      }
    };

    const onContactsClick = () => {
      closeTabsBefore(() => {
        this.createTab(AppContactsTab).open();
      });
    };

    const more = document.createElement('span');
    // more.setAttribute('style', 'display: inline-flex; justify-content: space-between; align-items: center');
    more.classList.add('more-label');
    more.append(i18n('MultiAccount.More'), Icon('arrowhead'));

    let removeSubmenuListener: () => void;
    const menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>})[] = [{
      icon: 'plus',
      text: 'MultiAccount.AddAccount',
      onClick: async(e) => {
        const totalAccounts = await AccountController.getTotalAccounts();
        if(totalAccounts >= MAX_ACCOUNTS) return;

        const hasSomeonePremium = await apiManagerProxy.hasSomeonePremium();

        if(totalAccounts === MAX_ACCOUNTS_FREE && !hasSomeonePremium) {
          new AccountsLimitPopup().show();
          return;
        }

        localStorage.setItem('previous-account', getCurrentAccount() + '');
        if(!e.ctrlKey) {
          appImManager.goOffline();

          localStorage.setItem('should-animate-auth', 'true');

          const chatsPageEl = document.querySelector('.page-chats');
          chatsPageEl.classList.add('main-screen-exit');
          await doubleRaf();
          chatsPageEl.classList.add('main-screen-exiting');
          await pause(200);
        }

        changeAccount((totalAccounts + 1) as ActiveAccountNumber, e.ctrlKey);
      },
      verify: async() => {
        const totalAccounts = await AccountController.getTotalAccounts();
        return totalAccounts < MAX_ACCOUNTS;
      }
    }, {
      icon: 'savedmessages',
      text: 'SavedMessages',
      onClick: () => {
        setTimeout(() => { // menu doesn't close if no timeout (lol)
          appImManager.setPeer({
            peerId: appImManager.myId
          });
        }, 0);
      },
      separator: true
    }, btnArchive, {
      icon: 'stories',
      text: 'MyStories.Title',
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppMyStoriesTab).open();
        });
      },
      verify: () => !TEST_NO_STORIES
    }, {
      icon: 'user',
      text: 'Contacts',
      onClick: onContactsClick
    }, {
      icon: 'folder',
      text: 'ManageFilters',
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppChatFoldersTab).open();
        });
      }
    }, {
      icon: 'settings',
      text: 'Settings',
      separator: true,
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppSettingsTab).open();
        });
      }
    }, {
      icon: 'more',
      regularText: more,
      onClick: () => {}
    }];

    injectMediaEditorLangPack();

    const filteredButtons = menuButtons.filter(Boolean);
    const filteredButtonsSliced = filteredButtons.slice();
    const buttonMenuToggle = ButtonMenuToggle({
      direction: 'bottom-right',
      buttons: filteredButtons,
      container: mountTo,
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

        function wrapUserName(user: User.user) {
          let name = user.first_name;
          if(user.last_name) name += ' ' + user.last_name;

          name = limitSymbols(name, 15, 18);
          return wrapEmojiText(name);
        }

        const targetIdx = 5;
        buttons[targetIdx].separator = !!attachMenuBotsButtons.length;
        buttons.splice(targetIdx, 0, ...attachMenuBotsButtons);
        buttons[targetIdx].separator = true;

        const totalAccounts = await AccountController.getTotalAccounts();
        const notificationsCount = await UiNotificationsManager.getNotificationsCountForAllAccounts();
        const accountButtons: typeof buttons = [];
        for(let i = 1; i <= totalAccounts; i++) {
          const accountNumber = i as ActiveAccountNumber;
          if(accountNumber === getCurrentAccount()) {
            const user = await this.managers.appUsersManager.getSelf();
            accountButtons.push({
              avatarInfo: {
                accountNumber: getCurrentAccount(),
                peerId: rootScope.myId.toPeerId()
              },
              regularText: wrapUserName(user),
              onClick: () => {
                closeTabsBefore(() => {
                  this.createTab(AppSettingsTab).open();
                });
              }
            });
          } else {
            const otherManagers = createProxiedManagersForAccount(accountNumber);
            const accountData = await AccountController.get(accountNumber)
            const peerId = accountData?.userId?.toPeerId();
            const user = await otherManagers.appUsersManager.getSelf();

            const content = document.createElement('span');
            content.append(wrapUserName(user));

            if(notificationsCount[accountNumber]) {
              const badge = createBadge('span', 20, 'primary');
              setBadgeContent(badge, '' + notificationsCount[accountNumber]);
              content.append(badge);
            }

            accountButtons.push({
              avatarInfo: {
                accountNumber,
                peerId,
                peer: user
              },
              className: 'btn-menu-account-item',
              regularText: content,
              onClick: async(e) => {
                if(!e.ctrlKey) {
                  appImManager.goOffline();

                  const chatListEl = document.querySelector('.chatlist-container')?.firstElementChild;
                  chatListEl.classList.add('chatlist-exit');
                  await doubleRaf();
                  chatListEl.classList.add('chatlist-exiting');
                  await pause(200);
                }
                changeAccount(accountNumber, e.ctrlKey);
              }
            });
          }
        }

        buttons.splice(0, 0, ...accountButtons);

        filteredButtons.splice(0, filteredButtons.length, ...buttons);
      },
      onOpen: (e, btnMenu) => {
        const isDarkModeEnabled = () => themeController.getTheme().name === 'night';
        const toggleTheme = () => {
          const item = btns[0].element;
          const icon = item.querySelector('.tgico');
          const rect = icon.getBoundingClientRect();
          themeController.switchTheme(isDarkModeEnabled() ? 'day' : 'night', {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          });
        };

        const darkModeText = document.createElement('span');
        darkModeText.append(i18n(isDarkModeEnabled() ? 'DisableDarkMode': 'EnableDarkMode'));
        const animationsText = document.createElement('span');

        const btns: ButtonMenuItemOptionsVerifiable[] = [{
          icon: 'darkmode',
          regularText: darkModeText,
          onClick: () => {}
        }, {
          id: 'animations-toggle',
          icon: 'animations',
          regularText: animationsText,
          onClick: () => {
            toggleAnimations();
          },
          verify: () => !liteMode.isEnabled()
        }, {
          icon: 'animations',
          text: 'LiteMode.Title',
          onClick: () => {
            closeTabsBefore(() => {
              this.createTab(AppPowerSavingTab).open();
            });
          },
          verify: () => liteMode.isEnabled()
        }, {
          icon: 'aversion',
          text: 'ChatList.Menu.SwitchTo.A',
          onClick: () => {
            Promise.all([
              updateStorageForWebA(),
              sessionStorage.set({kz_version: 'Z'}),
              sessionStorage.delete('tgme_sync')
            ]).then(() => {
              location.href = 'https://web.telegram.org/a/';
            });
          },
          separator: App.isMainDomain,
          verify: () => App.isMainDomain
        }, {
          icon: 'help',
          text: 'TelegramFeatures',
          onClick: () => {
            const url = I18n.format('TelegramFeaturesUrl', true);
            appImManager.openUrl(url);
          },
          separator: !App.isMainDomain
        }, {
          icon: 'bug',
          text: 'ReportBug',
          onClick: () => {
            const a = document.createElement('a');
            setBlankToAnchor(a);
            a.href = 'https://bugs.telegram.org/?tag_ids=40&sort=time';
            document.body.append(a);
            a.click();
            setTimeout(() => {
              a.remove();
            }, 0);
          }
        }, {
          icon: 'plusround',
          text: 'PWA.Install',
          onClick: () => {
            const installPrompt = getInstallPrompt();
            installPrompt?.();
          },
          verify: () => !!getInstallPrompt()
        }];


        async function hasAnimations() {
          const state = await apiManagerProxy.getState();
          return !state.settings.liteMode.animations;
        }

        async function initAnimationsToggleIcon() {
          updateAnimationsToggleButton(await hasAnimations());
        }

        async function toggleAnimations() {
          updateAnimationsToggleButton(!(await hasAnimations()));
          rootScope.managers.appStateManager.setByKey(
            joinDeepPath('settings', 'liteMode', 'animations'),
            await hasAnimations() // The value is already reversed
          );
        }

        async function updateAnimationsToggleButton(enabled: boolean) {
          const animationToggleButton = btns.find(button => button.id === 'animations-toggle')?.element;
          if(!animationToggleButton) return;

          const icon = animationToggleButton.querySelector('.tgico');
          enabled ?
            icon?.classList.add('animations-icon-off') :
            icon?.classList.remove('animations-icon-off');

          animationsText.replaceChildren(i18n(enabled ? 'DisableAnimations' : 'EnableAnimations'));
        }

        const moreBtn = filteredButtons.find(item => item.icon === 'more');
        moreBtn.element.addEventListener(CLICK_EVENT_NAME, (e) => {
          e.stopPropagation();
        }, true);
        moreBtn.element.classList.add('disable-click');
        removeSubmenuListener = attachFloatingButtonMenu({
          element: moreBtn.element,
          direction: 'right-start',
          createMenu: async() => {
            const filtered = await filterAsync(btns, (button) => button?.verify ? button.verify() ?? false : true);
            const menu = await ButtonMenu({
              buttons: filtered
            });

            menu.append(getVersionLink());
            menu.classList.add('sidebar-tools-submenu');

            const darkModeBtn = btns[0].element;
            darkModeBtn.addEventListener(CLICK_EVENT_NAME, (e) => {
              e.stopPropagation();
              toggleTheme();
              pause(20).then(() => contextMenuController.close());
            }, true);

            initAnimationsToggleIcon();

            return menu;
          },
          offset: [-5, -5],
          triggerEvent: 'mouseenter'
        });

        btnArchive.element?.append(this.archivedCount);
      },
      onClose: () => {
        removeSubmenuListener?.();
      },
      noIcon: true
    });

    return buttonMenuToggle;
  }

  public createNewBtnMenu(withId?: boolean, closeBefore?: boolean) {
    const closeTabsBefore = async(clb: () => void) => {
      if(closeBefore) {
        this.closeEverythingInisde() && await pause(200);
      }
      clb();
    }

    const onNewGroupClick = () => {
      closeTabsBefore(() => {
        this.createTab(AppAddMembersTab).open({
          type: 'chat',
          skippable: true,
          takeOut: (peerIds) => this.createTab(AppNewGroupTab).open({peerIds}),
          title: 'GroupAddMembers',
          placeholder: 'SendMessageTo'
        });
      });
    };

    const onContactsClick = () => {
      closeTabsBefore(() => {
        this.createTab(AppContactsTab).open();
      });
    };

    const btnMenu = ButtonMenuToggle({
      direction: 'top-left',
      buttons: [{
        icon: 'newchannel',
        text: 'NewChannel',
        onClick: () => {
          closeTabsBefore(() => {
            this.createTab(AppNewChannelTab).open();
          });
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
    btnMenu.className = 'btn-new-menu btn-circle rp btn-corner z-depth-1 btn-menu-toggle animated-button-icon';
    btnMenu.tabIndex = -1;
    const icons: Icon[] = ['newchat_filled', 'close'];
    btnMenu.prepend(...icons.map((icon, idx) => Icon(icon, 'animated-button-icon-icon', 'animated-button-icon-icon-' + (idx === 0 ? 'first' : 'last'))));
    withId && (btnMenu.id = 'new-menu');

    return btnMenu;
  }

  private initSearch() {
    if(this.searchInitResult) return this.searchInitResult;

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

    // bots.getPopularAppBots

    const searchSuper = this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'FilterChats',
        type: 'chats'
      }, {
        name: 'Channels',
        type: 'channels'
      }, {
        name: 'MiniApps.AppsSearch',
        type: 'apps'
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

    this.watchChannelsTabVisibility();

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

      this.buttonsContainer.classList.add('is-visible');
      this.isSearchActive = true;
      this.onSomethingOpenInsideChange();
    };

    this.inputSearch.input.addEventListener('focus', onFocus);
    onFocus();

    attachClickEvent(this.backBtn, (e) => {
      this.toolsBtn.classList.add(activeClassName);
      this.backBtn.classList.remove(activeClassName);
      this.toolsBtn.parentElement.firstElementChild.classList.toggle('state-back', false);

      appNavigationController.removeByType('global-search');

      transition(0);

      this.buttonsContainer.classList.remove('is-visible');
      this.isSearchActive = false;
      this.onSomethingOpenInsideChange(true);
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

    return this.searchInitResult = {
      open: () => {
        onFocus();
      },
      close: () => {
        close();
      }
    };
  }

  private async watchChannelsTabVisibility() {
    const checkChannelsVisiblity = async() => {
      const dialogs = await this.managers.dialogsStorage.getCachedDialogs();

      let hasChannels = false;
      for(const dialog of dialogs) {
        hasChannels = await this.managers.appPeersManager.isBroadcast(dialog.peerId);
        if(hasChannels) break;
      }

      const channelsTab = this.searchSuper.mediaTabs.find(tab => tab.type === 'channels');
      channelsTab.menuTab?.classList.toggle('hide', !hasChannels);
    };

    checkChannelsVisiblity();

    rootScope.addEventListener('channel_update', () => {
      pause(200).then(() => checkChannelsVisiblity());
    });
    rootScope.addEventListener('peer_deleted', () => {
      checkChannelsVisiblity();
    });
  }

  public closeSearch() {
    simulateClickEvent(this.backBtn);
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

function getVersionLink() {
  const btnMenuFooter = document.createElement('a');
  btnMenuFooter.href = 'https://github.com/morethanwords/tweb/blob/master/CHANGELOG.md';
  setBlankToAnchor(btnMenuFooter);
  btnMenuFooter.classList.add('btn-menu-footer');
  btnMenuFooter.addEventListener(CLICK_EVENT_NAME, (e) => {
    e.stopPropagation();
    contextMenuController.close();
  });
  const t = document.createElement('span');
  t.classList.add('btn-menu-footer-text');
  t.textContent = 'Telegram Web' + App.suffix + ' '/* ' alpha ' */ + App.version;
  btnMenuFooter.append(t);

  return btnMenuFooter;
  // btnMenu.classList.add('has-footer');
  // btnMenu.append(btnMenuFooter);

  // const a = btnMenu.querySelector('.a .btn-menu-item-icon');
  // if(a) a.textContent = 'A';
}

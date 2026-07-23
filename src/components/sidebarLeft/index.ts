import {createEffect, createRoot, createSignal} from 'solid-js';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {createSearchGroup, SearchGroup} from '@components/searchGroup';
import Scrollable, {ScrollableX} from '@components/scrollable';
import InputSearch from '@components/inputSearch';
import SidebarSlider, {SliderSuperTab} from '@components/slider';
import TransitionSlider from '@components/transition';
import AppSearchSuper, {SearchSuperMediaType} from '@components/appSearchSuper';
import {DateData, fillTipDates} from '@helpers/date';
import {MOUNT_CLASS_TO} from '@config/debug';
import {AppSettingsTab} from '@components/solidJsTabs';
import {AppNewChannelTab} from '@components/solidJsTabs/tabs';
import {AppContactsTab} from '@components/solidJsTabs/tabs';
import {AppArchivedTab} from '@components/solidJsTabs/tabs';
import createNewGroupTab from '@components/sidebarLeft/tabs/createNewGroupTab';
import I18n, {i18n} from '@lib/langPack';
import ButtonMenu, {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {IS_APPLE, IS_MOBILE_SAFARI} from '@environment/userAgent';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import findUpClassName from '@helpers/dom/findUpClassName';
import findUpTag from '@helpers/dom/findUpTag';
import App from '@config/app';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import sessionStorage from '@lib/sessionStorage';
import {attachClickEvent, CLICK_EVENT_NAME, simulateClickEvent} from '@helpers/dom/clickEvent';
import ButtonIcon from '@components/buttonIcon';
import confirmationPopup from '@components/confirmationPopup';
import {replaceButtonIcon} from '@components/button';
import noop from '@helpers/noop';
import ripple from '@components/ripple';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import ListenerSetter from '@helpers/listenerSetter';
import formatNumber from '@helpers/number/formatNumber';
import {AppManagers} from '@lib/managers';
import themeController from '@helpers/themeController';
import contextMenuController from '@helpers/contextMenuController';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '@lib/appDialogsManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import {FOLDER_ID_ARCHIVE, TEST_NO_STORIES} from '@appManagers/constants';
import mediaSizes from '@helpers/mediaSizes';
import updateColumnWidths, {setOpenTabsLeftSidebar} from '@helpers/updateColumnWidths';
import installColumnResize from '@helpers/installColumnResize';
import {doubleRaf, fastRaf} from '@helpers/schedulers';
import {getInstallPrompt} from '@helpers/dom/installPrompt';
import DOCUMENT_PICTURE_IN_PICTURE_SUPPORTED from '@environment/documentPictureInPictureSupport';
import openClientPip, {closeClientPip, isClientPipOpen} from '@components/clientPip';
import liteMode from '@helpers/liteMode';
import {AppPowerSavingTab} from '@components/solidJsTabs/tabs';
import {AppMyStoriesTab} from '@components/solidJsTabs/tabs';
import Icon from '@components/icon';
import AppSelectPeers from '@components/appSelectPeers';
import setBadgeContent from '@helpers/setBadgeContent';
import createBadge from '@helpers/createBadge';
import {MyDocument} from '@appManagers/appDocsManager';
import getAttachMenuBotIcon from '@appManagers/utils/attachMenuBots/getAttachMenuBotIcon';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import flatten from '@helpers/array/flatten';
import {AttachMenuBot, EmojiStatus, User} from '@layer';
import {Middleware, MiddlewareHelper} from '@helpers/middleware';
import wrapEmojiStatus from '@components/wrappers/emojiStatus';
import {makeMediaSize} from '@helpers/mediaSize';
import ReactionElement from '@components/chat/reaction';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import AccountController from '@lib/accounts/accountController';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {MAX_ACCOUNTS, MAX_ACCOUNTS_FREE} from '@lib/accounts/constants';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {createProxiedManagersForAccount} from '@lib/getProxiedManagers';
import limitSymbols from '@helpers/string/limitSymbols';
import filterAsync from '@helpers/array/filterAsync';
import pause from '@helpers/schedulers/pause';
import AccountsLimitPopup from '@components/sidebarLeft/accountsLimitPopup';
import {changeAccount} from '@lib/accounts/changeAccount';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import {renderFoldersSidebarContent} from '@components/sidebarLeft/foldersSidebarContent';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {AppChatFoldersTab} from '@components/solidJsTabs/tabs';
import {SliderSuperTabConstructable} from '@components/sliderTab';
import SettingsSliderPopup from '@components/sidebarLeft/settingsSliderPopup';
import {AppEditFolderTab} from '@components/solidJsTabs/tabs';
import {addShortcutListener} from '@helpers/shortcutListener';
import tsNow from '@helpers/tsNow';
import {toastNew} from '@components/toast';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import createLockButton from '@components/sidebarLeft/lockButton';
import createSubmenuTrigger, {CreateSubmenuArgs} from '@components/createSubmenuTrigger';
import ChatTypeMenu from '@components/chatTypeMenu';
import {RequestHistoryOptions} from '@appManagers/appMessagesManager';
import EmptySearchPlaceholder from '@components/emptySearchPlaceholder';
import useHasFoldersSidebar, {
  useIsSidebarCollapsed,
  useHasOpenLeftTabs,
  useIsLeftSearchActive,
  useFoldersSidebarShown
} from '@stores/foldersSidebar';
import isObject from '@helpers/object/isObject';
import {useAppSettings} from '@stores/appSettings';
import {openEmojiStatusPicker} from '@components/sidebarLeft/emojiStatusPicker';

export const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

type SearchInitResult = {
  open: (focus?: boolean) => void;
  openWithPeerId: (peerId: PeerId) => void;
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
  public searchSuper: AppSearchSuper;
  private searchInitResult: SearchInitResult;
  private get isSearchActive() {
    return useIsLeftSearchActive()[0]();
  }
  private set isSearchActive(value: boolean) {
    useIsLeftSearchActive()[1](value);
  }
  private searchTriggerWhenCollapsed: HTMLElement;

  private updateBtn: HTMLElement;
  private hasUpdate: boolean;

  private onResize: () => void;

  constructor() {
    super({
      sidebarEl: document.getElementById('column-left') as HTMLDivElement,
      navigationType: 'left'
    });
  }

  construct(managers: AppManagers) {
    this.managers = managers;

    this.chatListContainer = document.getElementById('chatlist-container');
    this.inputSearch = new InputSearch({oldStyle: true});
    (this.inputSearch.input as HTMLInputElement).placeholder = ' ';
    const sidebarHeader = this.sidebarEl.querySelector('.item-main .sidebar-header');
    sidebarHeader.append(this.inputSearch.container);

    this.backBtn = this.sidebarEl.querySelector('.sidebar-back-button') as HTMLButtonElement;

    this.toolsBtn = this.createToolsMenu();
    // .is-visible is owned by the Solid effect below (see "burger element
    // has two visual states") — don't seed it here.
    this.toolsBtn.classList.add('sidebar-tools-button');
    this.totalNotificationsCount = createBadge('span', 20, 'primary');
    this.totalNotificationsCount.classList.add('sidebar-tools-button-notifications');
    this.toolsBtn.append(this.totalNotificationsCount);

    const [allNotificationsCount, setAllNotificationsCount] = createSignal(0);
    const mainMiddleware = this.middlewareHelper.get();
    // renderFoldersSidebarContent creates the #folders-sidebar element
    // itself and inserts it as the first child of #main-columns.
    renderFoldersSidebarContent(
      document.getElementById('main-columns'),
      allNotificationsCount,
      SolidJSHotReloadGuardProvider,
      mainMiddleware
    );

    // If it has z-index to early, the browser makes it shift a few times before showing it properly in its position (on very large screens)
    // Doesn't solve the blinking, which doesn't seem to appear when the project is built
    pause(1000).then(() => {
      this.sidebarEl.classList.add('can-menu-have-z-index');
    });

    rootScope.addEventListener('notification_count_update', async() => {
      const notificationsCount = await uiNotificationsManager.getNotificationsCountForAllAccounts();
      const count = Object.entries(notificationsCount).reduce(
        (prev, [accountNumber, count]) =>
          prev +
          (+accountNumber !== getCurrentAccount() ? count || 0 : 0),
         0);

      setAllNotificationsCount(count);
      [this.totalNotificationsCount].forEach((el) => {
        setBadgeContent(el, '' + (count || ''));
      });
    });

    this.backBtn.parentElement.insertBefore(this.toolsBtn, this.backBtn);

    this.buttonsContainer = this.backBtn.parentElement;

    this.newBtnMenu = this.createNewChatsMenuButton();
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

      appNavigationController.reload();
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

    const lockButton = createLockButton();

    attachClickEvent(statusBtnIcon, () => {
      openEmojiStatusPicker({
        managers: this.managers,
        anchorElement: statusBtnIcon,
        onChosen: () => {
          fireOnNew = true
        }
      })
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
        toggleRightButtons(true, await DeferredIsUsingPasscode.isUsingPasscode());

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
        toggleRightButtons(false, await DeferredIsUsingPasscode.isUsingPasscode());
      }

      appDialogsManager.resizeStoriesList?.();
    };

    const toggleRightButtons = (isPremium: boolean, isUsingPasscode: boolean) => {
      if(isPremium) sidebarHeader.append(statusBtnIcon);
      else statusBtnIcon.remove();

      if(isUsingPasscode) sidebarHeader.append(lockButton.element);
      else lockButton.element.remove();

      sidebarHeader.classList.toggle('is-input-the-last-child', !isPremium && !isUsingPasscode);
    };

    appImManager.addEventListener('premium_toggle', onPremium);
    rootScope.addEventListener('toggle_using_passcode', (isUsingPasscode) => {
      toggleRightButtons(rootScope.premium, isUsingPasscode);
    });

    const [appSettings] = useAppSettings();
    toggleRightButtons(rootScope.premium, appSettings.passcode?.enabled);

    this.managers.appUsersManager.getTopPeers('correspondents');

    this.initNavigation();

    {
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
    }

    this.onResize = () => {
      this.rect = this.tabsContainer.getBoundingClientRect();
      updateColumnWidths();
    };

    fastRaf(this.onResize);
    // mediaSizes.resize subscription happens inside installColumnWidthsUpdater().

    this.searchTriggerWhenCollapsed = document.createElement('div');
    this.searchTriggerWhenCollapsed.className = 'sidebar-header-search-trigger';
    this.searchTriggerWhenCollapsed.append(ButtonIcon('search'));
    this.searchTriggerWhenCollapsed.addEventListener('click', () => {
      this.initSearch().open();
    });

    this.buttonsContainer.parentElement.prepend(this.searchTriggerWhenCollapsed);

    // Visibility lives in JS — drives the `.is-visible` class from the
    // signals that decide whether the icon-only search affordance should
    // be shown. The CSS only reads that class, no body/parent-selector
    // cascades.
    createRoot(() => {
      const [hasFoldersSidebar] = useHasFoldersSidebar();
      const [isCollapsed] = useIsSidebarCollapsed();
      const [hasOpenLeftTabs] = useHasOpenLeftTabs();
      createEffect(() => {
        const visible =
          hasFoldersSidebar() &&
          isCollapsed() &&
          !hasOpenLeftTabs();
        this.searchTriggerWhenCollapsed.classList.toggle('is-visible', visible);
      });
    });

    // The burger element has two visual states: the three-line menu icon (a
    // click on it opens the burger menu) and the back arrow (a click on it
    // closes the open search). Three classes encode that state — toolsBtn /
    // backBtn `.is-visible` (which click target is active) and the animated
    // icon's `.state-back` (which shape it renders as). They all flow from
    // the same condition, so a single Solid effect owns the truth:
    //
    //   showBack = useFoldersSidebarShown OR useIsLeftSearchActive
    //
    // When the folders panel is actually shown it has its own menu trigger, so
    // the in-sidebar burger never serves as a menu — it stays in back state
    // regardless of search activity. NOTE: gate on the viewport-aware *shown*
    // value, not the raw useHasFoldersSidebar preference — below 925px the panel
    // is hidden (its menu trigger with it), so the burger MUST fall back to the
    // menu icon. Without the panel shown, back state follows search activity.
    createRoot(() => {
      const [foldersSidebarShown] = useFoldersSidebarShown();
      const [isLeftSearchActive] = useIsLeftSearchActive();
      const animatedMenuIcon = this.buttonsContainer.firstElementChild as HTMLElement;
      createEffect(() => {
        const showBack = foldersSidebarShown() || isLeftSearchActive();
        this.toolsBtn.classList.toggle('is-visible', !showBack);
        this.backBtn.classList.toggle('is-visible', showBack);
        animatedMenuIcon.classList.toggle('state-back', showBack);
      });
    });

    const sidebarOverlay = document.querySelector('.sidebar-left-overlay');
    sidebarOverlay.addEventListener('click', () => {
      this.closeEverythingInside();
    });

    this.initSidebarResize();
    appDialogsManager.onSomeDrawerToggle = () => {
      this.onSomethingOpenInsideChange();
    };

    addShortcutListener(['ctrl+f', 'alt+f', 'meta+f'], () => {
      if(appNavigationController.findItemByType('popup')) return;
      this.initSearch().open();
    });

    addShortcutListener(['ctrl+0', 'meta+0'], () => {
      if(appNavigationController.findItemByType('popup') ||
        appImManager.chat.peerId === appImManager.myId) return;
      appImManager.setPeer({
        peerId: appImManager.myId
      });
    });
  }

  /**
   * Focus search input by pressing Escape
   */
  public initNavigation() {
    const navigationItem: NavigationItem = {
      type: 'global-search-focus',
      onPop: () => {
        setTimeout(() => {
          if(this.isAnimatingCollapse) return;
          this.initSearch().open();
        }, 0);

        return false;
      },
      noHistory: true
    };
    appNavigationController.removeByType('global-search-focus');
    appNavigationController.pushItem(navigationItem);
  }

  public isCollapsed() {
    // In the floating range the bar is always rendered expanded — the
    // is-collapsed class is preserved as the remembered preference for
    // wider viewports, but every consumer should see "not collapsed".
    if(mediaSizes.isLessThanFloatingLeftSidebar) return false;
    return this.sidebarEl.classList.contains('is-collapsed');
  }

  public hasFoldersSidebar() {
    return document.body.classList.contains('has-folders-sidebar');
  }

  public onCollapsedChange(canShowCtrlFTip = false) {
    this.chatListContainer.parentElement.classList.toggle('fade', this.isCollapsed());
    this.chatListContainer.parentElement.classList.toggle('zoom-fade', !this.isCollapsed());
    appDialogsManager.xd.toggleAvatarUnreadBadges(this.isCollapsed(), undefined);

    const [hasFoldersSidebar] = useHasFoldersSidebar();

    if(canShowCtrlFTip && this.isCollapsed() && !hasFoldersSidebar()) {
      this.showCtrlFTip();
    }

    if(!this.isCollapsed()) appDialogsManager.resizeStoriesList?.();
  }

  public hasSomethingOpenInside() {
    return this.hasTabsInNavigation() || this.isSearchActive || !!appDialogsManager.forumTab;
  }

  public closeEverythingInside() {
    this.closeSearch();
    appDialogsManager.toggleForumTab();

    return this.closeAllTabs();
  }

  // Like closeEverythingInside, but closes stacked tabs the "natural" way (via
  // the back arrow) so a tab can still confirm before closing. Returns false —
  // without touching the search or the forum — if the user declines a tab's
  // close confirmation, so the caller can cancel whatever triggered the close.
  public async closeEverythingInsideNaturally() {
    if(!await this.closeAllTabsNaturally()) {
      return false;
    }

    if(this.isSearchActive) {
      this.closeSearch();
    }
    appDialogsManager.toggleForumTab();

    return true;
  }

  private isAnimatingCollapse = false;
  private onSomethingOpenInsideChange = (force = false) => {
    const wasFloating = this.sidebarEl.classList.contains('has-open-tabs');
    const isFloating = force || this.hasSomethingOpenInside();
    const isCollapsed = this.isCollapsed();

    this.sidebarEl.classList.toggle('has-open-tabs', isFloating);
    this.sidebarEl.classList.toggle('has-real-tabs', this.hasTabsInNavigation());
    this.sidebarEl.classList.toggle('has-forum-open', !!appDialogsManager.forumTab);
    useHasOpenLeftTabs()[1](isFloating);

    // Keep the pop-out flag in sync with the actual tabs state regardless of
    // the early-return paths below. If we only set it inside the
    // isFloating/!isFloating branches, opening a tab from an expanded sidebar
    // and then closing it would leave the flag stuck at true — and a later
    // collapse via the resize handle would render at default width instead of
    // SIDEBAR_COLLAPSED_WIDTH.
    setOpenTabsLeftSidebar(isFloating);

    if(!isCollapsed && !this.hasSomethingOpenInside()) {
      pause(300).then(() => {
        // Mainly for stories when changing tabs view left <-> top
        rootScope.dispatchEvent('resizing_left_sidebar');
      });
      return;
    }

    if(wasFloating === isFloating) return;


    // Width is animated by CSS (transition on #column-left.is-collapsed
    // width). The numbers below define how long we hold the auxiliary
    // class state — they must match the layer-transition duration the CSS
    // rule uses (currently 200ms).
    const ANIMATION_TIME = 200;
    // Wait a touch longer than the width transition before removing the
    // force-* classes so child layouts don't shift while the bar is still
    // visually resizing.
    const DELAY_AFTER_ANIMATION = 150;

    if(isFloating) {
      this.sidebarEl.classList.add(
        'force-hide-large-content',
        'force-hide-menu',
        'force-chatlist-thin'
      );
      !this.isSearchActive && this.sidebarEl.classList.add('force-hide-search');

      this.isAnimatingCollapse = true;
      pause(ANIMATION_TIME + DELAY_AFTER_ANIMATION).then(() => {
        this.isAnimatingCollapse = false;
        this.sidebarEl.classList.remove(
          'force-hide-large-content',
          'force-hide-menu',
          'force-hide-search',
          'force-chatlist-thin'
        );
      });
      if(!appDialogsManager.forumTab)
        appDialogsManager.xd?.toggleAvatarUnreadBadges(false, undefined);
    } else {
      this.sidebarEl.classList.add(
        'force-fixed',
        'hide-add-folders',
        'force-chatlist-thin'
      );

      this.isAnimatingCollapse = true;
      pause(ANIMATION_TIME + DELAY_AFTER_ANIMATION).then(() => {
        this.sidebarEl.classList.remove(
          'force-fixed',
          'hide-add-folders',
          'force-chatlist-thin'
        );

        appDialogsManager.xd.toggleAvatarUnreadBadges(true, undefined);

        pause(200).then(() => {
          this.isAnimatingCollapse = false;
        });
      });
    }
  }

  public showCtrlFTip() {
    const DATE_KEY = 'ctrlf-toast-to-show-again';
    const showAgain = parseInt(localStorage.getItem(DATE_KEY));
    const now = tsNow(true);

    if(showAgain && now < showAgain) return;

    toastNew({
      langPackKey: IS_APPLE ? 'CtrlFSearchTipMac' : 'CtrlFSearchTip'
    });
    // Show once between 1 week to 2 months
    const waitSeconds = (Math.round(Math.random() * 7 * 7) + 7) * 24 * 60 * 60;
    localStorage.setItem(DATE_KEY, now + waitSeconds + '');
  }

  private initSidebarResize() {
    this.onTabsCountChange = () => {
      this.onSomethingOpenInsideChange();
    }

    installColumnResize({
      columnEl: this.sidebarEl,
      side: 'left',
      isCollapsed: () => this.isCollapsed(),
      setCollapsed: (collapsed) => {
        // Drag only fires off-handheld (the resize handle is display:none
        // at handheld), so the raw drag value is already the effective
        // one — push it into the signal and the mirror effect in
        // setSidebarLeftWidth (index.ts) toggles #column-left.is-collapsed.
        useIsSidebarCollapsed()[1](collapsed);
      },
      onCollapsedChange: () => this.onCollapsedChange(true),
      preventCollapse: () => this.hasSomethingOpenInside(),
      onSwipeTick: () => appImManager.adjustChatPatternBackground()
    });
  }

  public createToolsMenu(mountTo?: HTMLElement, positionPadding?: Parameters<typeof ButtonMenuToggle>[0]['positionPadding']) {
    const closeTabsBefore = async(clb: () => void) => {
      this.closeEverythingInside() && await pause(200);

      clb();
    }

    const btnArchive: typeof menuButtons[0] = {
      icon: 'archive',
      text: 'ArchivedChats',
      onClick: () => {
        this.openArchiveTab();
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

    const moreSubmenu = createSubmenuTrigger({
      options: {
        text: 'MultiAccount.More',
        icon: 'more'
      },
      createSubmenu: (args) => this.createMoreSubmenu(args, closeTabsBefore)
    });

    const newSubmenu = createSubmenuTrigger({
      options: {
        text: 'CreateANew',
        icon: 'edit',
        verify: () => this.isCollapsed(),
        separator: true
      },
      createSubmenu: () => this.createNewChatsSubmenu()
    });

    const menuButtons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>})[] = [{
      icon: 'plus',
      text: 'MultiAccount.AddAccount',
      onClick: this.addAccount,
      verify: async() => {
        const totalAccounts = await AccountController.getTotalAccounts();
        return totalAccounts < MAX_ACCOUNTS;
      }
    }, newSubmenu, {
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
          this.createTab(AppMyStoriesTab).open(AppMyStoriesTab.getInitArgs());
        });
      },
      verify: () => !TEST_NO_STORIES
    }, {
      icon: 'user',
      text: 'Contacts',
      onClick: onContactsClick
    }, {
      id: 'settings',
      icon: 'settings',
      text: 'Settings',
      separator: true,
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppSettingsTab).open();
        });
      }
    }, moreSubmenu];

    const filteredButtons = menuButtons.filter(Boolean);
    const filteredButtonsSliced = filteredButtons.slice();
    const buttonMenuToggle = ButtonMenuToggle({
      direction: 'bottom-right',
      buttons: filteredButtons,
      container: mountTo,
      positionPadding,
      onOpenBefore: async() => {
        const emptyAttachMenuBots: AttachMenuBot[] = [];
        const attachMenuBots = await Promise.race([
          pause(30).then(() => emptyAttachMenuBots),
          this.managers.appAttachMenuBotsManager.getAttachMenuBots().catch(() => emptyAttachMenuBots)
        ]);
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

        function wrapUserName(user: User.user | PeerId) {
          if(!isObject(user)) {
            return '' + user;
          }

          let name = user.first_name;
          if(user.last_name) name += ' ' + user.last_name;

          name = limitSymbols(name, 15, 18);
          return wrapEmojiText(name);
        }

        const targetIdx = buttons.findIndex((btn) => btn.id === 'settings');
        buttons[targetIdx].separator = !!attachMenuBotsButtons.length;
        buttons.splice(targetIdx, 0, ...attachMenuBotsButtons);
        buttons[targetIdx].separator = true;

        const [totalAccounts, notificationsCount] = await Promise.all([
          AccountController.getTotalAccounts(),
          uiNotificationsManager.getNotificationsCountForAllAccounts()
        ]);
        const accountButtons: typeof buttons = [];
        for(let i = 1; i <= totalAccounts; i++) {
          const accountNumber = i as ActiveAccountNumber;
          if(accountNumber === getCurrentAccount()) {
            const user = await this.managers.appUsersManager.getSelf();
            accountButtons.push({
              avatarInfo: {
                accountNumber: getCurrentAccount(),
                peerId: rootScope.myId.toPeerId(),
                active: true
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
            const accountData = await AccountController.get(accountNumber);
            const peerId = accountData.userId?.toPeerId();
            const user = await otherManagers.appUsersManager.getSelf();

            const content = document.createElement('span');
            content.append(wrapUserName(user || peerId));

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
                const newTab = e.ctrlKey || e.metaKey;
                if(!newTab) {
                  appImManager.goOffline();

                  const chatListEl = document.querySelector('.chatlist-container')?.firstElementChild;
                  chatListEl.classList.add('chatlist-exit');
                  await doubleRaf();
                  chatListEl.classList.add('chatlist-exiting');
                  await pause(200);

                  await this.saveEncryptionKeyBeforeSwitchingAccounts();
                }
                changeAccount(accountNumber, newTab);
              }
            });
          }
        }

        buttons.splice(0, 0, ...accountButtons);

        filteredButtons.splice(0, filteredButtons.length, ...buttons);
      },
      onOpen: () => {
        moreSubmenu.onOpen();
        newSubmenu.onOpen();
        btnArchive.element?.append(this.archivedCount);
      },
      onClose: () => {
        moreSubmenu.onClose();
        newSubmenu.onClose();
      },
      noIcon: true
    });

    return buttonMenuToggle;
  }

  private async saveEncryptionKeyBeforeSwitchingAccounts() {
    const isUsingPasscode = await DeferredIsUsingPasscode.isUsingPasscode();
    if(!isUsingPasscode) return;

    const openTabs = apiManagerProxy.getOpenTabsCount();

    openTabs <= 1 && await sessionStorage.set({
      encryption_key: await EncryptionKeyStore.getAsBase64()
    });
  }


  private async createMoreSubmenu(
    {middleware}: CreateSubmenuArgs,
    closeTabsBefore: (clb: () => void) => void
  ) {
    const toggleTheme = () => {
      const item = btns[0].element;
      const icon = item.querySelector('.tgico');
      const rect = icon.getBoundingClientRect();
      themeController.switchTheme(undefined, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    };

    const darkModeText = document.createElement('span');
    darkModeText.append(i18n(themeController.isNight() ? 'DisableDarkMode': 'EnableDarkMode'));
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
          sessionStorage.set({kz_version: 'Z'}),
          sessionStorage.delete('tgme_sync')
        ]).then(() => {
          appNavigationController.navigateToUrl('https://web.telegram.org/a/');
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
    }, {
      icon: 'pip',
      // The More submenu is rebuilt on every open (createMoreSubmenu runs per open), so reading the live
      // pip state here keeps the label in sync: while popped out the entry flips to "Exit". The whole app
      // — including this menu — lives in the pip window when active, so that's where the user sees it.
      text: isClientPipOpen() ? 'ClientPip.Exit' : 'PictureInPicture',
      onClick: () => {
        // The click is the user gesture `requestWindow` needs; closing the menu doesn't consume it.
        if(isClientPipOpen()) {
          closeClientPip();
        } else {
          openClientPip();
        }
      },
      // Document Picture-in-Picture is Chromium-only — gate the entry on actual support.
      verify: () => DOCUMENT_PICTURE_IN_PICTURE_SUPPORTED
    }];


    async function hasAnimations() {
      const [appSettings] = useAppSettings();
      return !appSettings.liteMode.animations;
    }

    async function initAnimationsToggleIcon() {
      updateAnimationsToggleButton(await hasAnimations());
    }

    async function toggleAnimations() {
      updateAnimationsToggleButton(!(await hasAnimations()));
      const [, setAppSettings] = useAppSettings();
      await setAppSettings('liteMode', 'animations', await hasAnimations());
    }

    async function updateAnimationsToggleButton(enabled: boolean) {
      const animationToggleButton = btns.find((button) => button.id === 'animations-toggle')?.element;
      if(!animationToggleButton) return;

      const icon = animationToggleButton.querySelector('.tgico');
      enabled ?
        icon?.classList.add('animations-icon-off') :
        icon?.classList.remove('animations-icon-off');

      animationsText.replaceChildren(i18n(enabled ? 'DisableAnimations' : 'EnableAnimations'));
    }

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

    if(!middleware()) return;

    return menu;
  }

  private createNewChatsMenuOptions(closeBefore?: boolean, singular?: boolean): ButtonMenuItemOptionsVerifiable[]  {
    const closeTabsBefore = async(clb: () => void) => {
      if(closeBefore) {
        this.closeEverythingInside() && await pause(200);
      }
      clb();
    }

    const onNewGroupClick = () => {
      closeTabsBefore(() => {
        createNewGroupTab(this);
      });
    };

    const onContactsClick = () => {
      closeTabsBefore(() => {
        this.createTab(AppContactsTab).open();
      });
    };

    return [{
      icon: 'newchannel',
      text: singular ? 'Channel' : 'NewChannel',
      onClick: () => {
        closeTabsBefore(() => {
          this.createTab(AppNewChannelTab).open();
        });
      }
    }, {
      icon: 'newgroup',
      text: singular ? 'Group' : 'NewGroup',
      onClick: onNewGroupClick
    }, {
      icon: 'newprivate',
      text: singular ? 'PrivateChat' : 'NewPrivateChat',
      onClick: onContactsClick
    }];
  }

  private createNewChatsMenuButton() {
    const btnMenu = ButtonMenuToggle({
      direction: 'top-left',
      buttons: this.createNewChatsMenuOptions(false),
      noIcon: true,
      positionPadding: {bottom: 10}
    });
    btnMenu.className = 'btn-new-menu btn-circle rp btn-corner z-depth-1 btn-menu-toggle animated-button-icon';
    btnMenu.tabIndex = -1;
    const icons: Icon[] = ['newchat_filled', 'close'];
    btnMenu.prepend(...icons.map((icon, idx) => Icon(icon, 'animated-button-icon-icon', 'animated-button-icon-icon-' + (idx === 0 ? 'first' : 'last'))));
    btnMenu.id = 'new-menu';

    return btnMenu;
  }

  private createNewChatsSubmenu() {
    return ButtonMenu({
      buttons: this.createNewChatsMenuOptions(true, true)
    });
  }

  public initSearch() {
    if(this.searchInitResult) return this.searchInitResult;

    const searchContainer = this.sidebarEl.querySelector('#search-container') as HTMLDivElement;

    const scrollable = new Scrollable(searchContainer);

    const close = () => {
      simulateClickEvent(this.backBtn);
    };

    const searchListenerSetter = new ListenerSetter();
    const middleware = this.middlewareHelper.get();
    this.searchGroups = {
      contacts: createSearchGroup({name: 'SearchAllChatsShort', type: 'contacts', onFound: close, middleware}),
      globalContacts: createSearchGroup({name: 'GlobalSearch', type: 'contacts', onFound: close, middleware}),
      messages: createSearchGroup({name: 'SearchMessages', type: 'messages', middleware}),
      people: createSearchGroup({name: false, type: 'contacts', className: 'search-group-people', autonomous: false, onFound: close, noIcons: true, middleware, scrollableX: true}),
      recent: createSearchGroup({name: 'Recent', type: 'contacts', className: 'search-group-recent', onFound: close, middleware})
    };

    this.searchGroups.messages.createPlaceholder = () => {
      const placeholder = new EmptySearchPlaceholder;
      if(chatTypeMenu.props.selected !== 'all' && !chatTypeMenu.props.hidden)
        placeholder.feedProps({
          onAllChats: () => {
            chatTypeMenu.props.selected = 'all';
            updateSearchQuery({search: this.inputSearch.value, chatType: 'all'})
          }
        });

      return placeholder;
    };

    const chatTypeMenu = new ChatTypeMenu();
    chatTypeMenu.feedProps({
      onChange: (chatType) => void updateSearchQuery({search: this.inputSearch.value, chatType}),
      selected: 'all'
    });

    this.searchGroups.messages.setNameRight({
      children: chatTypeMenu
    });

    const searchSuper = this.searchSuper = new AppSearchSuper({
      mediaTabs: [{
        inputFilter: 'inputMessagesFilterEmpty',
        name: 'FilterChats',
        type: 'chats'
      }, {
        name: 'ChannelsTab',
        type: 'channels'
      }, {
        name: 'MiniApps.AppsSearch',
        type: 'apps'
      }, {
        name: 'PostsSearch.TabName',
        type: 'posts'
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
      managers: this.managers,
      scrollOffset: 16
    });

    let prevTab: SearchSuperMediaType;
    searchSuper.onChangeTab = (tab) => {
      if(prevTab === 'posts') {
        simulateClickEvent(this.inputSearch.clearBtn);
      }

      prevTab = tab.type;
      searchSuper.searchContext.chatType = 'all';
      if(tab.type === 'posts') {
        searchSuper.globalPostsSearch?.setQuery(this.inputSearch.value);
      }
    };

    this.watchChannelsTabVisibility(searchListenerSetter);

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
        pause(0).then(() => chatTypeMenu.props.hidden = true);

        this.inputSearch.input.style.setProperty(
          '--paddingLeft',
          (pickedElements[pickedElements.length - 1].getBoundingClientRect().right - this.inputSearch.input.getBoundingClientRect().left) + 'px'
        );
      } else {
        chatTypeMenu.props.hidden = false;
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

      target.classList.remove('selector-user-primary');
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
        fallbackIcon: 'calendarfilter',
        primary: true
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
      if(searchSuper.mediaTab.type !== 'chats') {
        chatTypeMenu.props.selected = 'all';
      }
      updateSearchQuery({search: value, chatType: chatTypeMenu.props.selected});
    };

    this.inputSearch.onEnter = (value) => {
      const trimmed = value.trim();
      if(!trimmed) return;
      const wrapped = wrapUrl(trimmed);
      if(!wrapped.onclick) return;
      this.inputSearch.value = '';
      this.inputSearch.onChange?.('');
      simulateClickEvent(this.backBtn);
      appImManager.openUrl(trimmed);
    };

    type UpdateSearchQueryArgs = {
      search?: string;
      chatType?: RequestHistoryOptions['chatType'];
    };

    const updateSearchQuery = ({search: value, chatType}: UpdateSearchQueryArgs) => {
      if(searchSuper.mediaTab.type === 'posts') {
        searchSuper.globalPostsSearch?.setQuery(value);
        return
      }

      // spot input
      searchSuper.cleanupHTML();
      searchSuper.setQuery({
        peerId: selectedPeerId,
        folderId: selectedPeerId ? undefined : 0,
        query: value,
        chatType,
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

    let first = true;
    let hideNewBtnMenuTimeout: number;
    // const transition = Transition.bind(null, searchContainer.parentElement, 150);
    const cleanup = () => {
      pickedElements.forEach((el) => {
        el.middlewareHelper.destroy();
        el.remove();
      });
      pickedElements.length = 0;

      this.inputSearch.value = '';
      this.inputSearch.container.classList.remove('is-picked', 'is-picked-twice');
      this.inputSearch.input.style.removeProperty('--paddingLeft');
      this.inputSearch.onChange = undefined;
      this.inputSearch.onClear = undefined;

      searchSuper.destroy();
      helperMiddlewareHelper.destroy();
      searchContainer.replaceChildren();
      searchListenerSetter.removeAll();

      this.searchInitResult = undefined;
      this.searchSuper = undefined;

      this.inputSearch.input.addEventListener('focus', () => this.initSearch(), {once: true});
    };

    const transition = TransitionSlider({
      content: searchContainer.parentElement,
      type: 'zoom-fade',
      transitionTime: 150,
      listenerSetter: searchListenerSetter,
      onTransitionStart: (id) => {
        searchContainer.parentElement.parentElement.classList.toggle('is-search-active', id === 1);
      },
      onTransitionEnd: (id) => {
        if(hideNewBtnMenuTimeout) clearTimeout(hideNewBtnMenuTimeout);

        if(id === 0 && !first) {
          cleanup();
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

    const onFocus = () => {
      // toolsBtn/backBtn `.is-visible` and the animated icon's `.state-back`
      // are owned by the Solid effect in init() — flipping `isSearchActive`
      // below propagates to all three classes.
      this.newBtnMenu.classList.add('is-hidden');
      this.updateBtn.classList.add('is-hidden');

      const navigationType: NavigationItem['type'] = 'global-search';
      if(!IS_MOBILE_SAFARI && !appNavigationController.findItemByType(navigationType)) {
        appNavigationController.pushItem({
          onPop: () => {
            if(this.isAnimatingCollapse) return false;
            close();
          },
          type: navigationType
        });
      }

      transition(1);

      // Decide whether the burger should grow/shrink with a transition.
      // Only set it on the first focus of this open cycle — re-focusing the
      // input while search is already open would otherwise see the burger's
      // own `.is-visible` and flip the flag off, breaking the close
      // animation. Driven structurally off the search trigger's class
      // because the user prefers checking button presence over proxying
      // through `.is-collapsed`.
      if(!this.buttonsContainer.classList.contains('is-visible')) {
        const triggerIsVisible = this.searchTriggerWhenCollapsed.classList.contains('is-visible');
        this.buttonsContainer.classList.toggle('appear-animated', !triggerIsVisible);
      }

      this.buttonsContainer.classList.add('is-visible');
      this.isSearchActive = true;
      this.onSomethingOpenInsideChange();
    };

    searchListenerSetter.add(this.inputSearch.input)('focus', onFocus);
    onFocus();

    attachClickEvent(this.backBtn, (e) => {
      // Burger state classes flip back when `isSearchActive` becomes false
      // — see the init() effect that owns toolsBtn/backBtn/state-back.
      appNavigationController.removeByType('global-search');

      transition(0);
      this.buttonsContainer.classList.remove('is-visible');
      this.isSearchActive = false;
      this.onSomethingOpenInsideChange();

      chatTypeMenu.props.selected = 'all';
    }, {listenerSetter: searchListenerSetter});

    this.searchGroups.recent.setNameRight({
      onClick: () => {
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
      },
      children: i18n('ClearRecentSearch')
    });

    const focusInput = () => {
      this.inputSearch.input.focus({preventScroll: true});
    };

    return this.searchInitResult = {
      open: (focus = true) => {
        onFocus();
        if(focus) focusInput();
      },
      openWithPeerId: (peerId: PeerId) => {
        onFocus();
        focusInput();

        selectedPeerId = peerId;

        this.inputSearch.onChange(this.inputSearch.value = '');

        const element = renderEntity(peerId);
        this.inputSearch.container.append(element);

        element.addEventListener('click', () => {
          unselectEntity(element);
        });

        pickedElements.push(element);
        fastRaf(() => {
          updatePicked();
        });
      },
      close: () => {
        close();
      }
    };
  }

  private async watchChannelsTabVisibility(listenerSetter: ListenerSetter) {
    const checkChannelsVisiblity = async() => {
      if(!this.searchSuper) return;
      const dialogs = await this.managers.dialogsStorage.getCachedDialogs();

      if(!this.searchSuper) return;
      let hasChannels = false;
      for(const dialog of dialogs) {
        hasChannels = await this.managers.appPeersManager.isBroadcast(dialog.peerId);
        if(hasChannels) break;
      }

      if(!this.searchSuper) return;
      const channelsTab = this.searchSuper.mediaTabs.find((tab) => tab.type === 'channels');
      channelsTab.menuTab?.classList.toggle('hide', !hasChannels);
    };

    checkChannelsVisiblity();

    listenerSetter.add(rootScope)('channel_update', () => {
      pause(200).then(() => checkChannelsVisiblity());
    });
    listenerSetter.add(rootScope)('peer_deleted', () => {
      checkChannelsVisiblity();
    });
  }

  public closeSearch() {
    simulateClickEvent(this.backBtn);
  }

  public createTab<T extends SliderSuperTab>(
    ctor: SliderSuperTabConstructable<T>,
    destroyable = true,
    doNotAppend?: boolean
  ) {
    const ctorsToOpenInPopup = [AppSettingsTab, AppEditFolderTab, AppChatFoldersTab]
    if(this.isCollapsed() && !mediaSizes.isLessThanFloatingLeftSidebar && ctorsToOpenInPopup.includes(ctor as any)) {
      const popup = new SettingsSliderPopup(this.managers);
      popup.show();
      return popup.slider.createTab(ctor, destroyable, doNotAppend);
    }
    return super.createTab(ctor, destroyable, doNotAppend);
  }

  // Every non-main tab in the left sidebar gets `.item-secondary`. The
  // chatlist (HTML-declared `.item-main`) keeps its identity; archive /
  // settings / contacts / etc. (all SliderSuperTab-created) flow through
  // `addTab` and pick up the marker here, so SCSS rules that target
  // "secondary" tabs don't have to enumerate every subclass.
  public addTab(tab: SliderSuperTab) {
    super.addTab(tab);
    if(!tab.container.classList.contains('item-main')) {
      tab.container.classList.add('item-secondary');
    }
  }

  public async closeTabsBefore(clb: () => void) {
    this.closeEverythingInside() && await pause(200);
    clb();
  }

  public openArchiveTab() {
    this.closeTabsBefore(() => {
      this.createTab(AppArchivedTab).open();
    });
  }

  public addAccount = async(e: MouseEvent | TouchEvent) => {
    const totalAccounts = await AccountController.getTotalAccounts();
    if(totalAccounts >= MAX_ACCOUNTS) return;

    const hasSomeonePremium = await apiManagerProxy.hasSomeonePremium();

    if(totalAccounts === MAX_ACCOUNTS_FREE && !hasSomeonePremium) {
      new AccountsLimitPopup().show();
      return;
    }

    localStorage.setItem('previous-account', getCurrentAccount() + '');
    const isUsingPasscode = await DeferredIsUsingPasscode.isUsingPasscode();
    const openTabs = apiManagerProxy.getOpenTabsCount();

    const newTab = e.ctrlKey || e.metaKey || (openTabs <= 1 && isUsingPasscode);
    if(!newTab) {
      appImManager.goOffline();

      localStorage.setItem('should-animate-auth', 'true');

      const chatsPageEl = document.querySelector('.page-chats');
      chatsPageEl.classList.add('main-screen-exit');
      await doubleRaf();
      chatsPageEl.classList.add('main-screen-exiting');
      await pause(200);
    }

    changeAccount((totalAccounts + 1) as ActiveAccountNumber, newTab);
  };
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
  t.textContent = `Telegram Web${App.suffix} ${App.version} (${App.build})`;
  btnMenuFooter.append(t);

  return btnMenuFooter;
}

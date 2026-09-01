import {createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {AppPrivacyAndSecurityTab} from '@components/solidJsTabs/tabs';
import {AppChatFoldersTab} from '@components/solidJsTabs/tabs';
import {
  AppEditProfileTab,
  AppGeneralSettingsTab,
  AppKeyboardShortcutsTab,
  AppLanguageTab,
  AppNotificationsTab,
  AppSpeakersAndCameraTab,
  getEditProfileInitArgs
} from '@components/solidJsTabs';
import lottieLoader from '@lib/lottie/lottieLoader';
import {AppDataAndStorageTab} from '@components/solidJsTabs/tabs';
import ButtonIcon from '@components/buttonIcon';
import rootScope from '@lib/rootScope';
import Row from '@components/rowTsx';
import {AppActiveSessionsTab} from '@components/solidJsTabs/tabs';
import {i18n, LangPackKey} from '@lib/langPack';
import {SliderSuperTabConstructable, SliderSuperTabEventable} from '@components/sliderTab';
import {AccountAuthorizations, Authorization, ConnectedBot} from '@layer';
import PopupElement from '@components/popups';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import Section from '@components/section';
import {AppStickersAndEmojiTab} from '@components/solidJsTabs/tabs';
import PopupPremium from '@components/popups/premium';
import apiManagerProxy from '@lib/apiManagerProxy';
import useStars, {hasTonTransactions} from '@stores/stars';
import PopupStars from '@components/popups/stars';
import {renderPeerProfile} from '@components/peerProfile';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import showMyQrCodePopup from '@components/popups/myQrCode';
import showSendGiftPicker from '@components/popups/sendGiftPicker';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import showLogOutPopup from '@components/popups/logOut';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import InputSearch from '@components/inputSearch';
import Scrollable from '@components/scrollable2';
import InlinePortal from '@helpers/solid/inlinePortal';
import cancelEvent from '@helpers/dom/cancelEvent';
import SettingsSearchResults from '@components/sidebarLeft/settingsSearchResults';
import TransitionSlider from '@components/transition';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {SettingsSearchItem} from '@lib/settingsSearch';
import {openSettingsSearchItem} from '@lib/settingsSearch/navigate';
import {ROOT_SECTION_ID} from '@lib/settingsSearch/registry';
import {bumpRecentSettingsSearch} from '@lib/settingsSearch/recent';

// ─────────────────────────────────────────────────────────────────────────────
// Helper — wraps a sub-tab declaration. If the tab has a static `getInitArgs`,
// fires the prefetch immediately so the per-domain promises (themes / filters /
// privacy bundle / etc.) start downloading the moment Settings opens.
// On click we await whatever was prefetched, hand it to `tab.open(...)`, and
// re-arm the prefetch after the sub-tab is destroyed.
// ─────────────────────────────────────────────────────────────────────────────

type SubTabConfig = {
  icon: Icon;
  text: LangPackKey;
  tabConstructor: SliderSuperTabConstructable;
  getInitArgs?: () => any[];
  args?: any;
};

const makeSubTabConfig = (
  icon: Icon,
  text: LangPackKey,
  tabConstructor: SliderSuperTabConstructable,
  fromTab: any
): SubTabConfig => {
  let getInitArgs: (() => any[]) | undefined;
  const g = (tabConstructor as any).getInitArgs;
  if(g) {
    getInitArgs = () => [g(fromTab)];
  }
  return {
    icon,
    text,
    tabConstructor,
    getInitArgs,
    args: getInitArgs?.()
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab UI
// ─────────────────────────────────────────────────────────────────────────────

const Settings = () => {
  const promiseCollector = usePromiseCollector();
  const [tab] = useSuperTab();

  // ── Header: search and the overflow menu, the way tdesktop keeps it — editing
  //    the profile and the QR code are rare enough to live in the menu.
  const searchBtn = ButtonIcon('search');
  const btnMenu = ButtonMenuToggle({
    listenerSetter: tab.listenerSetter,
    direction: 'bottom-left',
    buttons: [{
      icon: 'edit',
      text: 'EditAccount.Title',
      // fresh args on every open, so a failed connected-bot request isn't retained
      onClick: () => tab.slider.createTab(AppEditProfileTab).open(getEditProfileInitArgs(true))
    }, {
      icon: 'qr',
      text: 'QRCode.Title',
      onClick: () => showMyQrCodePopup()
    }, {
      icon: 'logout',
      text: 'EditAccount.Logout',
      danger: true,
      onClick: () => showLogOutPopup()
    }]
  });

  // ── Search over every setting (see @lib/settingsSearch). It is a second layer
  //    of the tab, cross-faded in over the settings the same way the left
  //    sidebar swaps the chat list for its search — except this one brings its
  //    own header, since it covers the tab's header too.
  const [searchQuery, setSearchQuery] = createSignal<string>(undefined);
  const isSearching = () => searchQuery() !== undefined;

  const mainLayer = document.createElement('div');
  mainLayer.classList.add('transition-item', 'settings-layer');

  const searchLayer = document.createElement('div');
  searchLayer.classList.add('transition-item', 'settings-layer', 'settings-search-layer');

  const searchBackBtn = ButtonIcon('left sidebar-close-button', {noRipple: true});

  const inputSearch = new InputSearch({
    placeholder: 'Search',
    // the same field the left sidebar's own search uses
    oldStyle: true,
    onChange: setSearchQuery,
    // The clear button empties the query; pressing it on an empty field leaves search.
    onClear: (e, wasEmpty) => wasEmpty && closeSearch(),
    alwaysShowClear: true
  });

  inputSearch.input.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') {
      cancelEvent(e);
      closeSearch();
    }
  });

  let selectLayer: ReturnType<typeof TransitionSlider>;

  // Search is a state to come back from, not a tab: Escape and the back gesture
  // leave it and keep the settings open, the way they do in the left sidebar.
  const NAVIGATION_TYPE: NavigationItem['type'] = 'settings-search';

  const openSearch = () => {
    if(isSearching()) {
      closeSearch();
      return;
    }

    setSearchQuery('');
    selectLayer(1);
    inputSearch.input.focus();

    if(!appNavigationController.findItemByType(NAVIGATION_TYPE)) {
      appNavigationController.pushItem({
        type: NAVIGATION_TYPE,
        onPop: () => void closeSearch(true)
      });
    }
  };

  const closeSearch = (fromNavigation?: boolean) => {
    if(!isSearching()) return;

    if(!fromNavigation) {
      appNavigationController.removeByType(NAVIGATION_TYPE);
    }

    setSearchQuery(undefined);
    selectLayer(0);
    inputSearch.value = '';
    // the field goes off screen, and typing into what cannot be seen is worse
    // than typing nowhere
    inputSearch.input.blur();
  };

  attachClickEvent(searchBackBtn, () => closeSearch(), {listenerSetter: tab.listenerSetter});

  // A section can take a request to open, and a second click while it is in
  // flight would open it twice — the list stays clickable, the navigation does not.
  let opening: Promise<void>;

  const onResultSelect = (item: SettingsSearchItem) => {
    if(opening) return;

    bumpRecentSettingsSearch(item.id);

    // A result that lives on this very screen opens no section of its own: the
    // search layer is the only thing between the user and it, so it steps aside.
    // Anything else keeps it — the layer stays behind the section that opens, so
    // going back returns to the results with the query still typed.
    if(item.sectionId === ROOT_SECTION_ID) {
      closeSearch();
    }

    opening = openSettingsSearchItem(item, tab)
    .catch((err) => console.error('settings search: cannot open', item.id, err))
    .finally(() => {
      opening = undefined;
    });
  };

  onMount(() => {
    tab.container.classList.add('settings-container', 'transition', 'zoom-fade');
    tab.header.append(searchBtn, btnMenu);

    // The tab's own header and content become the first layer, so the search can
    // fade in over both of them.
    mainLayer.append(tab.header, tab.content);
    tab.container.append(mainLayer, searchLayer);

    selectLayer = TransitionSlider({
      content: tab.container,
      type: 'zoom-fade',
      transitionTime: 150,
      listenerSetter: tab.listenerSetter
    });

    // Tell the slider which layer is showing — without it the first switch has
    // nothing to fade out of and both layers end up visible.
    selectLayer(0, false);
  });

  onCleanup(() => {
    appNavigationController.removeByType(NAVIGATION_TYPE);
    inputSearch.remove();
    // the header outlives the component (it belongs to the tab), so take the
    // buttons back out — otherwise a hot reload leaves a second set behind
    for(const button of [searchBtn, btnMenu]) button.remove();
    tab.container.append(tab.header, tab.content);
    mainLayer.remove();
    searchLayer.remove();
  });

  attachClickEvent(searchBtn, openSearch, {listenerSetter: tab.listenerSetter});

  // ── Sub-tab rows (notifications/data/privacy/general/folders/stickers).
  const subTabConfigs: SubTabConfig[] = [
    makeSubTabConfig('bell_filled', 'AccountSettings.Notifications', AppNotificationsTab, tab),
    makeSubTabConfig('data_filled', 'DataSettings', AppDataAndStorageTab, tab),
    makeSubTabConfig('key_filled', 'AccountSettings.PrivacyAndSecurity', AppPrivacyAndSecurityTab, tab),
    makeSubTabConfig('general_filled', 'Telegram.GeneralSettingsViewController', AppGeneralSettingsTab, tab),
    makeSubTabConfig('limit_folders_filled', 'AccountSettings.Filters', AppChatFoldersTab, tab),
    makeSubTabConfig('reactions_filled', 'StickersName', AppStickersAndEmojiTab, tab),
    makeSubTabConfig('speaker_filled', 'AccountSettings.SpeakersAndCamera', AppSpeakersAndCameraTab, tab)
  ];

  const onSubTabClick = (item: SubTabConfig) => async() => {
    const args = item.args ? await item.args : [];
    const subTab = tab.slider.createTab(item.tabConstructor as any);
    subTab.open(...args);

    if(subTab instanceof SliderSuperTabEventable && item.getInitArgs) {
      (subTab as SliderSuperTabEventable).eventListener.addEventListener('destroyAfter', (promise) => {
        item.args = promise.then(() => item.getInitArgs() as any);
      });
    }
  };

  // ── Devices row + active sessions fetch (we wait on this so the tab opens
  //    with the device count already filled in).
  let authorizations: Authorization.authorization[] | undefined;
  let authorizationTTLDays: number | undefined;
  let connectedBot: ConnectedBot.connectedBot | undefined;
  let getAuthorizationsPromise: Promise<AccountAuthorizations.accountAuthorizations> | undefined;
  const [authCount, setAuthCount] = createSignal('');
  const updateAuthCount = () => {
    if(authorizations) {
      setAuthCount('' + (authorizations.length + (connectedBot ? 1 : 0)));
    }
  };

  const getAuthorizations = (overwrite?: boolean) => {
    if(getAuthorizationsPromise && !overwrite) return getAuthorizationsPromise;

    const promise = getAuthorizationsPromise = rootScope.managers.appAccountManager.getAuthorizations()
    .finally(() => {
      if(getAuthorizationsPromise === promise) {
        getAuthorizationsPromise = undefined;
      }
    });

    return promise;
  };

  const updateActiveSessions = (overwrite?: boolean) => {
    return Promise.all([
      getAuthorizations(overwrite),
      rootScope.managers.appBusinessManager.getConnectedBot(overwrite).then((bot) => {
        connectedBot = bot;
      }, () => {})
    ]).then(([auths]) => {
      authorizations = auths.authorizations;
      authorizationTTLDays = auths.authorization_ttl_days;
      updateAuthCount();
    });
  };

  subscribeOn(rootScope)('chat_automation_update', (bot) => {
    connectedBot = bot;
    updateAuthCount();
  });

  // Fire-and-forget: `account.getAuthorizations` is a real MTProto roundtrip
  // every time (no caching). Letting the device count fill in via the
  // `authCount` signal after the tab is shown matches the legacy behaviour.
  updateActiveSessions();

  const onDevicesClick = async() => {
    if(!authorizations) {
      await updateActiveSessions();
    }

    try {
      connectedBot = await rootScope.managers.appBusinessManager.getConnectedBot(true);
      updateAuthCount();
    } catch{
      // Keep the latest event-backed snapshot. Active Sessions still exposes
      // device authorizations, and the next open retries the bot request.
    }

    const subTab = tab.slider.createTab(AppActiveSessionsTab);
    subTab.eventListener.addEventListener('destroy', () => {
      authorizations = undefined;
      authorizationTTLDays = undefined;
      connectedBot = undefined;
      updateActiveSessions(true);
    }, {once: true});
    subTab.open({authorizations, connectedBot, ttlDays: authorizationTTLDays});
  };

  // ── Premium section. Signal-backed so `<Show>` re-evaluates when the
  //    "purchase blocked" check resolves before `selectTab` fires — the section
  //    either appears with the rest of the tab, or doesn't appear at all.
  const [premiumBlocked, setPremiumBlocked] = createSignal(false);
  promiseCollector.collect(
    Promise.resolve(apiManagerProxy.isPremiumPurchaseBlocked()).then(setPremiumBlocked)
  );

  // ── Reactive star balances drive the titleRight text and stars row
  //    visibility. Keep the starsTon row available when it has a balance or
  //    transaction history, including after the balance returns to zero.
  const stars = useStars();
  const starsTon = useStars(true);

  // ── Self profile (avatar + name + collapse-on-scroll). The avatar inside
  //    `PeerProfileAvatars` is filled async via `setPeer()` (peer photo IPC →
  //    appearance render → thumb load) — without waiting, the gradient header
  //    is rendered empty and the avatar pops in mid-transition. We collect the
  //    `onAvatarReady` promise so the tab opens with the avatar already in DOM.
  const peerProfileElement = renderPeerProfile({
    peerId: rootScope.myId,
    isDialog: false,
    scrollable: tab.scrollable,
    setCollapsedOn: mainLayer,
    onAvatarReady: (promise) => promiseCollector.collect(promise)
  }, SolidJSHotReloadGuardProvider);

  // Lottie workers preload — fire and forget.
  lottieLoader.loadLottieWorkers();

  return (
    <>
      <InlinePortal mount={searchLayer}>
        <div class="sidebar-header">
          {searchBackBtn}
          {inputSearch.container}
        </div>
        <div class="sidebar-content">
          <Scrollable>
            <Show when={isSearching()}>
              <SettingsSearchResults query={searchQuery()} onSelect={onResultSelect} />
            </Show>
          </Scrollable>
        </div>
      </InlinePortal>
      {peerProfileElement}
      <Section>
        <div class="profile-buttons">
          <For each={subTabConfigs}>
            {(item) => (
              <Row clickable={onSubTabClick(item)}>
                <Row.Icon icon={item.icon} />
                <Row.Title>{i18n(item.text)}</Row.Title>
              </Row>
            )}
          </For>
          <Row clickable={onDevicesClick}>
            <Row.Icon icon="devices_filled" />
            <Row.Title titleRight={<span>{authCount()}</span>} titleRightSecondary>
              {i18n('Devices')}
            </Row.Title>
          </Row>
          <Row clickable={() => tab.slider.createTab(AppLanguageTab).open()}>
            <Row.Icon icon="web_filled" />
            <Row.Title titleRight={i18n('LanguageName')} titleRightSecondary>
              {i18n('AccountSettings.Language')}
            </Row.Title>
          </Row>
          <Row clickable={() => tab.slider.createTab(AppKeyboardShortcutsTab).open()}>
            <Row.Icon icon="keyboard_filled" />
            <Row.Title>{i18n('KeyboardShortcuts.Title')}</Row.Title>
          </Row>
        </div>
      </Section>
      <Show when={!premiumBlocked()}>
        <Section>
          <Row clickable={() => PopupPremium.show()}>
            <Row.Icon icon="premium_badge" />
            <Row.Title>{i18n('Premium.Boarding.Title')}</Row.Title>
          </Row>
          <Show when={!!stars()}>
            <Row clickable={() => PopupElement.createPopup(PopupStars)}>
              <Row.Icon icon="star_circle_filled" />
              <Row.Title titleRight={'' + stars()} titleRightSecondary>
                {i18n('MenuTelegramStars')}
              </Row.Title>
            </Row>
          </Show>
          <Show when={hasTonTransactions() || String(starsTon()) !== '0'}>
            <Row clickable={() => PopupElement.createPopup(PopupStars, {ton: true})}>
              <Row.Icon icon="gram_filled" />
              <Row.Title titleRight={formatNanoton(starsTon())} titleRightSecondary>
                {i18n('MenuTelegramStarsTon')}
              </Row.Title>
            </Row>
          </Show>
          <Row clickable={() => showSendGiftPicker()}>
            <Row.Icon icon="gift_filled" />
            <Row.Title>{i18n('Chat.Menu.SendGift')}</Row.Title>
          </Row>
        </Section>
      </Show>
    </>
  );
};

export default Settings;

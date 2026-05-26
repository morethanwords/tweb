import {createSignal, For, onMount, Show} from 'solid-js';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import AppPrivacyAndSecurityTab from '@components/sidebarLeft/tabs/privacyAndSecurity';
import AppChatFoldersTab from '@components/sidebarLeft/tabs/chatFolders';
import {
  AppEditProfileTab,
  AppGeneralSettingsTab,
  AppKeyboardShortcutsTab,
  AppLanguageTab,
  AppNotificationsTab,
  AppSpeakersAndCameraTab,
  getEditProfileInitArgs
} from '@components/solidJsTabs';
import lottieLoader from '@lib/rlottie/lottieLoader';
import AppDataAndStorageTab from '@components/sidebarLeft/tabs/dataAndStorage';
import ButtonIcon from '@components/buttonIcon';
import rootScope from '@lib/rootScope';
import Row from '@components/rowTsx';
import AppActiveSessionsTab from '@components/sidebarLeft/tabs/activeSessions';
import {i18n, LangPackKey} from '@lib/langPack';
import {SliderSuperTabConstructable, SliderSuperTabEventable} from '@components/sliderTab';
import {AccountAuthorizations, Authorization} from '@layer';
import PopupElement from '@components/popups';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import Section from '@components/section';
import AppStickersAndEmojiTab from '@components/sidebarLeft/tabs/stickersAndEmoji';
import PopupPremium from '@components/popups/premium';
import apiManagerProxy from '@lib/apiManagerProxy';
import useStars from '@stores/stars';
import PopupStars from '@components/popups/stars';
import {renderPeerProfile} from '@components/peerProfile';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import showPickUserPopup from '@components/popups/pickUser';
import PopupSendGift from '@components/popups/sendGift';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import showLogOutPopup from '@components/popups/logOut';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {subscribeOn} from '@helpers/solid/subscribeOn';

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

  // ── Header (edit + overflow menu)
  const editBtn = ButtonIcon('edit');
  const btnMenu = ButtonMenuToggle({
    listenerSetter: tab.listenerSetter,
    direction: 'bottom-left',
    buttons: [{
      icon: 'logout',
      text: 'EditAccount.Logout',
      onClick: () => showLogOutPopup()
    }]
  });

  onMount(() => {
    tab.container.classList.add('settings-container');
    tab.header.append(editBtn, btnMenu);
  });

  // ── Edit profile click — prefetch args, refresh on user_update.
  let editProfileArgs: ReturnType<typeof getEditProfileInitArgs>;
  const refreshEditProfileArgs = () => {
    editProfileArgs = getEditProfileInitArgs();
  };
  refreshEditProfileArgs();
  attachClickEvent(editBtn, () => {
    tab.slider.createTab(AppEditProfileTab).open(editProfileArgs);
  }, {listenerSetter: tab.listenerSetter});

  subscribeOn(rootScope)('user_update', (userId) => {
    if(rootScope.myId.toUserId() === userId) {
      refreshEditProfileArgs();
    }
  });

  // ── Sub-tab rows (notifications/data/privacy/general/folders/stickers).
  const subTabConfigs: SubTabConfig[] = [
    makeSubTabConfig('unmute', 'AccountSettings.Notifications', AppNotificationsTab, tab),
    makeSubTabConfig('data', 'DataSettings', AppDataAndStorageTab, tab),
    makeSubTabConfig('lock', 'AccountSettings.PrivacyAndSecurity', AppPrivacyAndSecurityTab, tab),
    makeSubTabConfig('settings', 'Telegram.GeneralSettingsViewController', AppGeneralSettingsTab, tab),
    makeSubTabConfig('folder', 'AccountSettings.Filters', AppChatFoldersTab, tab),
    makeSubTabConfig('stickers_face', 'StickersName', AppStickersAndEmojiTab, tab),
    makeSubTabConfig('videocamera', 'AccountSettings.SpeakersAndCamera', AppSpeakersAndCameraTab, tab)
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
  let getAuthorizationsPromise: Promise<AccountAuthorizations.accountAuthorizations> | undefined;
  const [authCount, setAuthCount] = createSignal('');

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
    return getAuthorizations(overwrite).then((auths) => {
      authorizations = auths.authorizations;
      setAuthCount('' + authorizations.length);
    });
  };

  // Fire-and-forget: `account.getAuthorizations` is a real MTProto roundtrip
  // every time (no caching). Letting the device count fill in via the
  // `authCount` signal after the tab is shown matches the legacy behaviour.
  updateActiveSessions();

  const onDevicesClick = async() => {
    if(!authorizations) {
      await updateActiveSessions();
    }

    const subTab = tab.slider.createTab(AppActiveSessionsTab);
    subTab.authorizations = authorizations;
    subTab.eventListener.addEventListener('destroy', () => {
      authorizations = undefined;
      updateActiveSessions(true);
    }, {once: true});
    subTab.open();
  };

  // ── Premium section. Signal-backed so `<Show>` re-evaluates when the
  //    "purchase blocked" check resolves before `selectTab` fires — the section
  //    either appears with the rest of the tab, or doesn't appear at all.
  const [premiumBlocked, setPremiumBlocked] = createSignal(false);
  promiseCollector.collect(
    Promise.resolve(apiManagerProxy.isPremiumPurchaseBlocked()).then(setPremiumBlocked)
  );

  // ── Reactive star balances (drive both the visibility and titleRight text
  //    of stars / starsTon rows).
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
    setCollapsedOn: tab.container,
    onAvatarReady: (promise) => promiseCollector.collect(promise)
  }, SolidJSHotReloadGuardProvider);

  // Lottie workers preload — fire and forget.
  lottieLoader.loadLottieWorkers();

  const onSendGiftClick = () => {
    showPickUserPopup({
      titleLangKey: 'SendGiftTo',
      placeholder: 'Chat.Menu.SendGift',
      selfPresence: 'SendGiftSelfCaption',
      meAsSaved: false,
      onSelect: (chosen) => {
        PopupElement.createPopup(PopupSendGift, {peerId: chosen[0].peerId});
      },
      filterPeerTypeBy: ['isRegularUser', 'isBroadcast']
    });
  };

  return (
    <>
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
            <Row.Icon icon="activesessions" />
            <Row.Title titleRight={<span>{authCount()}</span>} titleRightSecondary>
              {i18n('Devices')}
            </Row.Title>
          </Row>
          <Row clickable={() => tab.slider.createTab(AppLanguageTab).open()}>
            <Row.Icon icon="language" />
            <Row.Title titleRight={i18n('LanguageName')} titleRightSecondary>
              {i18n('AccountSettings.Language')}
            </Row.Title>
          </Row>
          <Row clickable={() => tab.slider.createTab(AppKeyboardShortcutsTab).open()}>
            <Row.Icon icon="keyboard" />
            <Row.Title>{i18n('KeyboardShortcuts.Title')}</Row.Title>
          </Row>
        </div>
      </Section>
      <Show when={!premiumBlocked()}>
        <Section>
          <Row clickable={() => PopupPremium.show()}>
            <Row.Icon icon="star" class="row-icon-premium-color" />
            <Row.Title>{i18n('Premium.Boarding.Title')}</Row.Title>
          </Row>
          <Show when={!!stars()}>
            <Row clickable={() => PopupElement.createPopup(PopupStars)}>
              <Row.Icon icon="star" class="row-icon-stars-color" />
              <Row.Title titleRight={'' + stars()} titleRightSecondary>
                {i18n('MenuTelegramStars')}
              </Row.Title>
            </Row>
          </Show>
          <Show when={String(starsTon()) !== '0'}>
            <Row clickable={() => PopupElement.createPopup(PopupStars, {ton: true})}>
              <Row.Icon icon="ton" />
              <Row.Title titleRight={formatNanoton(starsTon())} titleRightSecondary>
                {i18n('MenuTelegramStarsTon')}
              </Row.Title>
            </Row>
          </Show>
          <Row clickable={onSendGiftClick}>
            <Row.Icon icon="gift" />
            <Row.Title>{i18n('Chat.Menu.SendGift')}</Row.Title>
          </Row>
        </Section>
      </Show>
    </>
  );
};

export default Settings;

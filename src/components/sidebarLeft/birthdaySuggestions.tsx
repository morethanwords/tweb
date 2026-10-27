import type {ContactBirthdaysState} from '@appManagers/appPromoManager';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import showSendGiftPicker from '@components/popups/sendGiftPicker';
import showSendGiftPopup from '@components/popups/sendGift';
import RippleElement from '@components/rippleElement';
import Row from '@components/rowTsx';
import birthdayStyles from '@components/sidebarLeft/birthdaySuggestions.module.scss';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import {PendingSuggestion, SimpleSuggestion} from '@components/sidebarLeft/pendingSuggestionItem';
import suggestionStyles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import collapsedPanelStyles from '@components/sidebarLeft/collapsedPanelButton.module.scss';
import {StackedAvatarsTsx} from '@components/stackedAvatars';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {useAppState} from '@stores/appState';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {useDismissedSuggestions, usePendingSuggestions, usePromoDataLoaded} from '@stores/promo';
import {createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

const BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY = 'BIRTHDAY_CONTACTS_TODAY';
const BIRTHDAY_SETUP_SUGGESTION_KEY = 'BIRTHDAY_SETUP';

const EMPTY_CONTACT_BIRTHDAYS: ContactBirthdaysState = {
  contacts: [],
  yesterday: [],
  today: [],
  tomorrow: []
};

function BirthdaySetupSuggestion() {
  const emoji = () => wrapEmojiText('🎂');

  const onDismissed = () => {
    rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
  };

  const onClick = () => {
    showBirthdayPopup({
      onSave: async(date) => {
        const managers = bindManagersToSession(rootScope.managers);
        if(await saveMyBirthday(date)) {
          managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
          return;
        }
        return false;
      }
    });
  };

  return (
    <SimpleSuggestion
      emoji={emoji}
      title={i18n('Suggestion.BirthdaySetup', [emoji()])}
      subtitle={i18n('Suggestion.BirthdaySetup.Subtitle')}
      onClick={onClick}
      onClose={onDismissed}
    />
  );
}

function BirthdayContactsSuggestion(props: {
  state: ContactBirthdaysState,
  onDismiss: () => void
}) {
  const [isSidebarCollapsed] = useIsSidebarCollapsed();
  const contacts = () => props.state.today;
  const peerIds = createMemo(() => contacts().slice(0, 3).map(({peerId}) => peerId));
  const multipleAvatarSize = () => peerIds().length === 3 ? 26 : 30;
  const [firstName] = createResource(
    () => contacts().length === 1 ? contacts()[0]?.peerId : undefined,
    (peerId) => getPeerTitle({peerId, plainText: true, onlyFirstName: true, useManagers: true})
  );

  const nearbyContacts = createMemo(() => [
    ...props.state.today,
    ...props.state.yesterday,
    ...props.state.tomorrow
  ]);
  const birthdayPeerIds = createMemo(() => new Set(nearbyContacts().map(({peerId}) => peerId)));
  const yesterdayPeerIds = createMemo(() => new Set(props.state.yesterday.map(({peerId}) => peerId)));
  const todayPeerIds = createMemo(() => new Set(props.state.today.map(({peerId}) => peerId)));

  const openGift = (peerId: PeerId) => {
    showSendGiftPopup({peerId, birthday: birthdayPeerIds().has(peerId)});
  };

  const onClick = () => {
    if(contacts().length === 1) {
      openGift(contacts()[0].peerId);
      return;
    }

    showSendGiftPicker({
      prependPeerIds: nearbyContacts().map(({peerId}) => peerId),
      getSubtitleForElement: (peerId) => {
        const key = todayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Today' :
          yesterdayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Yesterday' :
          birthdayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Tomorrow' : undefined;
        return key ? i18n(key) : undefined;
      },
      onSelect: ([{peerId}]) => openGift(peerId)
    });
  };

  return (
    <Show
      when={isSidebarCollapsed()}
      fallback={
        <PendingSuggestion
          class={suggestionStyles.secondary}
          clickable={onClick}
          closable={props.onDismiss}
        >
          <PendingSuggestion.Title>
            {contacts().length === 1 ? (
              <Show when={firstName()}>{(name) => i18n('Suggestion.BirthdayContacts.Single', [name()])}</Show>
            ) : i18n('Suggestion.BirthdayContacts.Multiple', [contacts().length])}
          </PendingSuggestion.Title>
          <PendingSuggestion.Subtitle>{i18n('Suggestion.BirthdayContacts.Subtitle')}</PendingSuggestion.Subtitle>
          <Row.Media size="abitbigger" class={birthdayStyles.media}>
            <div class={birthdayStyles.avatars}>
              <StackedAvatarsTsx
                peerIds={peerIds()}
                avatarSize={contacts().length === 1 ? 36 : multipleAvatarSize()}
              />
            </div>
          </Row.Media>
        </PendingSuggestion>
      }
    >
      <RippleElement
        component="div"
        class={classNames(collapsedPanelStyles.button, birthdayStyles.collapsed, 'hover-effect')}
        onClick={onClick}
      >
        <div class={birthdayStyles.avatars}>
          <StackedAvatarsTsx
            peerIds={peerIds()}
            avatarSize={contacts().length === 1 ? 32 : multipleAvatarSize()}
          />
        </div>
      </RippleElement>
    </Show>
  );
}

export default function createBirthdaySuggestions() {
  const [{appConfig}] = useAppState();
  const pendingSuggestions = usePendingSuggestions();
  const dismissedSuggestions = useDismissedSuggestions();
  const promoDataLoaded = usePromoDataLoaded();
  const [contactBirthdays, setContactBirthdays] = createSignal<ContactBirthdaysState>();
  let contactBirthdaysRequest = 0;
  let midnightTimeout: number;
  let contactBirthdaysDay = new Date().toDateString();
  let destroyed = false;

  const canLoadBirthdayContacts = () => !appConfig.premium_purchase_blocked;
  const canShowBirthdayContacts = () => (
    canLoadBirthdayContacts() &&
    promoDataLoaded() &&
    !dismissedSuggestions().has(BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY)
  );

  const loadContactBirthdays = async(force = false) => {
    const request = ++contactBirthdaysRequest;

    try {
      const state = await rootScope.managers.appPromoManager.getContactBirthdays(force)
      .catch(() => EMPTY_CONTACT_BIRTHDAYS);
      if(!destroyed && request === contactBirthdaysRequest) {
        setContactBirthdays(state);
      }
    } catch(err) {
      if(!destroyed && request === contactBirthdaysRequest) {
        setContactBirthdays(EMPTY_CONTACT_BIRTHDAYS);
      }
    }
  };

  const scheduleMidnightRefresh = () => {
    window.clearTimeout(midnightTimeout);
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    midnightTimeout = window.setTimeout(() => {
      refreshForNewDay();
      scheduleMidnightRefresh();
    }, nextMidnight.getTime() - now.getTime());
  };

  const refreshForNewDay = () => {
    const day = new Date().toDateString();
    if(day === contactBirthdaysDay) return;
    contactBirthdaysDay = day;
    ++contactBirthdaysRequest;
    setContactBirthdays(undefined);
    void rootScope.managers.appPromoManager.getPromoData(true).catch(() => {});
    if(canLoadBirthdayContacts()) void loadContactBirthdays(true);
  };

  const onVisible = () => {
    if(document.visibilityState !== 'visible') return;
    refreshForNewDay();
    scheduleMidnightRefresh();
  };

  // * the birthdays are of the account's own contacts: the suggestions outlive a switch, the list starts over
  const onAccountSwitched = () => {
    ++contactBirthdaysRequest;
    setContactBirthdays(undefined);
    if(canLoadBirthdayContacts()) {
      void loadContactBirthdays();
    }
  };
  rootScope.addEventListener('account_switched', onAccountSwitched);

  onMount(() => {
    scheduleMidnightRefresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
  });
  onCleanup(() => {
    destroyed = true;
    ++contactBirthdaysRequest;
    window.clearTimeout(midnightTimeout);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    rootScope.removeEventListener('account_switched', onAccountSwitched);
  });

  createEffect(() => {
    if(!canLoadBirthdayContacts()) {
      ++contactBirthdaysRequest;
      setContactBirthdays(undefined);
      return;
    }

    void loadContactBirthdays();
  });

  createEffect(() => {
    if(canShowBirthdayContacts() && contactBirthdays()?.today.length) {
      void rootScope.managers.appGiftsManager.getStarGiftOptions().catch(() => {});
    }
  });

  const dismissBirthdayContacts = () => {
    ++contactBirthdaysRequest;
    setContactBirthdays(undefined);
    rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY);
    toastNew({langPackKey: 'Suggestion.BirthdayContacts.Dismissed'});
  };

  const ContactsSuggestion = () => (
    <Show when={contactBirthdays()}>
      {(state) => <BirthdayContactsSuggestion state={state()} onDismiss={dismissBirthdayContacts} />}
    </Show>
  );

  const contacts: PendingSuggestionController = {
    available: () => canShowBirthdayContacts() && !!contactBirthdays()?.today.length,
    component: ContactsSuggestion
  };
  const setup: PendingSuggestionController = {
    available: () => pendingSuggestions().has(BIRTHDAY_SETUP_SUGGESTION_KEY),
    component: BirthdaySetupSuggestion
  };

  return {
    contacts,
    setup
  };
}

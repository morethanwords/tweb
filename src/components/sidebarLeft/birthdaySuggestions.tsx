import type {ContactBirthdaysState} from '@appManagers/appPromoManager';
import PopupElement from '@components/popups';
import showBirthdayPopup, {saveMyBirthday} from '@components/popups/birthday';
import showPickUserPopup from '@components/popups/pickUser';
import PopupSendGift from '@components/popups/sendGift';
import RippleElement from '@components/rippleElement';
import Row from '@components/rowTsx';
import birthdayStyles from '@components/sidebarLeft/birthdaySuggestions.module.scss';
import type {PendingSuggestionController} from '@components/sidebarLeft/pendingSuggestionController';
import {PendingSuggestion, SimpleSuggestion} from '@components/sidebarLeft/pendingSuggestionItem';
import suggestionStyles from '@components/sidebarLeft/pendingSuggestion.module.scss';
import {StackedAvatarsTsx} from '@components/stackedAvatars';
import {toastNew} from '@components/toast';
import getPeerTitle from '@components/wrappers/getPeerTitle';
import {IS_PREVIEW} from '@config/debug';
import classNames from '@helpers/string/classNames';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {useAppState} from '@stores/appState';
import {useIsSidebarCollapsed} from '@stores/foldersSidebar';
import {useDismissedSuggestions, usePendingSuggestions, usePromoDataLoaded} from '@stores/promo';
import {createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show} from 'solid-js';

const BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY = 'BIRTHDAY_CONTACTS_TODAY';
const BIRTHDAY_SETUP_SUGGESTION_KEY = 'BIRTHDAY_SETUP';

// Preview-only: 1 opens the gift popup directly, 2+ opens the recipient picker.
// Leave peer ids empty to use real contacts from the current preview account.
const TEST_BIRTHDAY_CONTACTS = IS_PREVIEW && true;
const TEST_BIRTHDAY_CONTACTS_TODAY_COUNT = 1;
const TEST_BIRTHDAY_CONTACTS_INCLUDE_NEARBY = true;
const TEST_BIRTHDAY_CONTACT_PEER_IDS: PeerId[] = [];

const EMPTY_CONTACT_BIRTHDAYS: ContactBirthdaysState = {
  contacts: [],
  yesterday: [],
  today: [],
  tomorrow: []
};

function getTestBirthdayContact(peerId: PeerId, dayOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);

  return {
    peerId,
    birthday: {
      _: 'birthday' as const,
      day: date.getDate(),
      month: date.getMonth() + 1
    }
  };
}

async function getTestContactBirthdays(state: ContactBirthdaysState): Promise<ContactBirthdaysState> {
  const nearbyCount = TEST_BIRTHDAY_CONTACTS_INCLUDE_NEARBY ? 2 : 0;
  const requiredCount = TEST_BIRTHDAY_CONTACTS_TODAY_COUNT + nearbyCount;
  const peerIds = [...new Set(TEST_BIRTHDAY_CONTACT_PEER_IDS)];

  if(peerIds.length < requiredCount) {
    const contactPeerIds = await rootScope.managers.appUsersManager.getContactsPeerIds(
      '',
      false,
      'none',
      Math.max(requiredCount * 4, 20)
    );
    const candidates = [...new Set([
      ...state.contacts.map(({peerId}) => peerId),
      ...contactPeerIds
    ])].slice(0, Math.max(requiredCount * 4, 20));
    const areRegularUsers = await Promise.all(candidates.map((peerId) => (
      rootScope.managers.appPeersManager.isRegularUser(peerId)
    )));

    for(let i = 0; i < candidates.length && peerIds.length < requiredCount; ++i) {
      const peerId = candidates[i];
      if(areRegularUsers[i] && !peerIds.includes(peerId)) peerIds.push(peerId);
    }
  }

  const today = peerIds
  .slice(0, TEST_BIRTHDAY_CONTACTS_TODAY_COUNT)
  .map((peerId) => getTestBirthdayContact(peerId, 0));
  const yesterday = TEST_BIRTHDAY_CONTACTS_INCLUDE_NEARBY && peerIds[TEST_BIRTHDAY_CONTACTS_TODAY_COUNT] ?
    [getTestBirthdayContact(peerIds[TEST_BIRTHDAY_CONTACTS_TODAY_COUNT], -1)] : [];
  const tomorrowPeerId = peerIds[TEST_BIRTHDAY_CONTACTS_TODAY_COUNT + 1];
  const tomorrow = TEST_BIRTHDAY_CONTACTS_INCLUDE_NEARBY && tomorrowPeerId ?
    [getTestBirthdayContact(tomorrowPeerId, 1)] : [];

  return {
    contacts: [...today, ...yesterday, ...tomorrow],
    yesterday,
    today,
    tomorrow
  };
}

function BirthdaySetupSuggestion() {
  const emoji = () => wrapEmojiText('🎂');

  const onDismissed = () => {
    rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
  };

  const onClick = () => {
    showBirthdayPopup({
      onSave: async(date) => {
        if(await saveMyBirthday(date)) {
          rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_SETUP_SUGGESTION_KEY);
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
    PopupElement.createPopup(PopupSendGift, {peerId, birthday: birthdayPeerIds().has(peerId)});
  };

  const onClick = () => {
    if(contacts().length === 1) {
      openGift(contacts()[0].peerId);
      return;
    }

    showPickUserPopup({
      titleLangKey: 'SendGiftTo',
      placeholder: 'Chat.Menu.SendGift',
      selfPresence: 'SendGiftSelfCaption',
      meAsSaved: false,
      prependPeerIds: nearbyContacts().map(({peerId}) => peerId),
      getSubtitleForElement: (peerId) => {
        const key = todayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Today' :
          yesterdayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Yesterday' :
          birthdayPeerIds().has(peerId) ? 'Suggestion.BirthdayContacts.Tomorrow' : undefined;
        return key ? i18n(key) : undefined;
      },
      onSelect: ([{peerId}]) => openGift(peerId),
      filterPeerTypeBy: ['isRegularUser', 'isBroadcast']
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
        class={classNames(suggestionStyles.collapsed, birthdayStyles.collapsed, 'hover-effect')}
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
  let destroyed = false;

  const canLoadBirthdayContacts = () => TEST_BIRTHDAY_CONTACTS || !appConfig.premium_purchase_blocked;
  const canShowBirthdayContacts = () => (
    TEST_BIRTHDAY_CONTACTS || (
      canLoadBirthdayContacts() &&
      promoDataLoaded() &&
      !dismissedSuggestions().has(BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY)
    )
  );

  const loadContactBirthdays = async(force = false) => {
    const request = ++contactBirthdaysRequest;

    try {
      const liveState = await rootScope.managers.appPromoManager.getContactBirthdays(force)
      .catch(() => EMPTY_CONTACT_BIRTHDAYS);
      const state = TEST_BIRTHDAY_CONTACTS ? await getTestContactBirthdays(liveState) : liveState;
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
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    midnightTimeout = window.setTimeout(() => {
      setContactBirthdays(undefined);
      scheduleMidnightRefresh();
      void Promise.all([
        rootScope.managers.appPromoManager.getPromoData(true).catch(() => {}),
        loadContactBirthdays(true)
      ]);
    }, nextMidnight.getTime() - now.getTime());
  };

  onMount(scheduleMidnightRefresh);
  onCleanup(() => {
    destroyed = true;
    ++contactBirthdaysRequest;
    window.clearTimeout(midnightTimeout);
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
    if(!TEST_BIRTHDAY_CONTACTS) {
      rootScope.managers.appPromoManager.dismissSuggestion(BIRTHDAY_CONTACTS_TODAY_SUGGESTION_KEY);
    }
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

import {GlobalNotifySettingsKey, SETTINGS_INIT} from '@config/state';
import copy from '@helpers/object/copy';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import convertInputKeyToKey from '@helpers/string/convertInputKeyToKey';
import {InputPeerNotifySettings, ReactionNotificationsFrom, ReactionsNotifySettings} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import {MUTE_UNTIL} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {createProxiedManagersForAccount} from '@lib/getProxiedManagers';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {useAppSettings} from '@stores/appSettings';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import RangeSettingSelector from '@components/rangeSettingSelector';
import Row from '@components/rowTsx';
import Section from '@components/section';
import {createEffect, createMemo, createSignal, getOwner, onCleanup, runWithOwner, Show} from 'solid-js';
import {toastNew} from '@components/toast';
import Button from '@components/buttonTsx';
import cancelEvent from '@helpers/dom/cancelEvent';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import IS_NOTIFICATION_SUPPORTED from '@environment/notificationSupport';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppNotificationsTab} from '@components/solidJsTabs/tabs';
import type {NotifyException} from '@appManagers/appNotificationsManager';
import confirmationPopup from '@components/confirmationPopup';
import createTypeNotifySettings, {InputNotifyKey} from '@components/sidebarLeft/tabs/notificationsTypeSettings';

/**
 * Reset All as the sections see it. Once it is confirmed, and again once it is through, what they write only as the
 * tab closes is put back to what is saved (`discards`), and while it is on its way (`pending`) they write nothing
 * composed from the settings they hold: sent after the reset, either would bring back what it clears. The settings
 * the reset leaves come to them after it
 */
type ResetState = {discards: Set<() => void>, pending: boolean};

const NotifySection = (props: {
  name: LangPackKey,
  typeText: LangPackKey,
  inputKey: InputNotifyKey,
  reset: ResetState
}) => {
  const [enabled, setEnabled] = createSignal(true);
  const [showPreviews, setShowPreviews] = createSignal(true);
  const notifySettings = createTypeNotifySettings(props.inputKey);
  const inputNotifyPeer = {_: props.inputKey};
  // * the toggles as the settings have them
  let saved: {enabled: boolean, showPreviews: boolean};

  createEffect(async() => {
    const _notifySettings = notifySettings();
    if(!_notifySettings) {
      return;
    }

    const muted = await rootScope.managers.appNotificationsManager.isMuted(_notifySettings);
    saved = {enabled: !muted, showPreviews: !!_notifySettings.show_previews};
    setEnabled(saved.enabled);
    setShowPreviews(saved.showPreviews);

    return muted;
  });

  props.reset.discards.add(() => {
    if(saved) {
      setEnabled(saved.enabled);
      setShowPreviews(saved.showPreviews);
    }
  });

  onCleanup(() => {
    // * only what the user switched since the toggles took the settings: not toggles that have yet to take new ones,
    // * nor any while there are none to compose with
    if(
      props.reset.pending ||
      !saved ||
      !notifySettings() ||
      (enabled() === saved.enabled && showPreviews() === saved.showPreviews)
    ) {
      return;
    }

    // * the account the tab was open on
    const managers = createProxiedManagersForAccount(getCurrentAccount());
    const inputSettings: InputPeerNotifySettings = copy(notifySettings()) as any;
    inputSettings._ = 'inputPeerNotifySettings';
    inputSettings.mute_until = enabled() ? 0 : MUTE_UNTIL;
    inputSettings.show_previews = showPreviews();
    managers.appNotificationsManager.updateNotifySettings(
      inputNotifyPeer,
      inputSettings
    );
  });

  const exceptions = createNotifyExceptions(props.inputKey);

  return (
    <Section name={props.name}>
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx checked={enabled()} onChange={setEnabled} toggle />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n(props.typeText)}</Row.Title>
      </Row>
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx checked={showPreviews()} onChange={setShowPreviews} toggle />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('MessagePreview')}</Row.Title>
      </Row>
      <Row clickable={() => exceptions.open()}>
        <Row.Title
          titleRight={<span>{exceptions.list()?.length || ''}</span>}
          titleRightSecondary
        >
          {i18n('NotificationsExceptions')}
        </Row.Title>
      </Row>
    </Section>
  );
};

/**
 * A chat type's exceptions (tdesktop's), asked for as the screen opens and following every change of them; the list
 * the tab of the exceptions shows
 */
const createNotifyExceptions = (inputKey: InputNotifyKey) => {
  const [tab] = useSuperTab<typeof AppNotificationsTab>();
  const [list, setList] = createSignal<NotifyException[]>();
  const key = convertInputKeyToKey<GlobalNotifySettingsKey>(inputKey);

  subscribeOn(rootScope)('notify_exceptions', (event) => {
    if(event.key === key) {
      setList(event.exceptions);
    }
  });

  tab.managers.appNotificationsManager.getNotifyExceptions(inputKey).then(setList);

  return {
    list,
    open: () => tab.slider.createTab(hotReloadGuard.tabs.AppNotificationExceptionsTab).open({inputKey, exceptions: list})
  };
};

// * Global story notifications live on the "users" notify type (inputNotifyUsers),
// * mirroring iOS/Android. `stories_muted` is a 3-state nullable flag:
// *   false  → New Stories on: notify for everyone;
// *   absent → "Important Stories": server notifies only for top contacts (its default);
// *   true   → off: notify for no one.
// * `stories_hide_sender` gates whether the poster's name is shown. Writes go out
// * immediately (not batched on close like NotifySection) so a same-visit change
// * to the sibling Private Chats section — which shares inputNotifyUsers — copies
// * the already-committed story flags instead of reverting them.
const StoriesNotifySection = (props: {reset: ResetState}) => {
  const [enabled, setEnabled] = createSignal(true); // "New Stories" — notify for all
  const [important, setImportant] = createSignal(true); // when !enabled: important-only vs off
  const [showSender, setShowSender] = createSignal(true);
  const inputNotifyPeer = {_: 'inputNotifyUsers'} as const;
  const notifySettings = createTypeNotifySettings(inputNotifyPeer._);

  createEffect(() => {
    const _notifySettings = notifySettings();
    if(!_notifySettings) {
      return;
    }

    const muted = _notifySettings.stories_muted; // true | false | undefined
    setEnabled(muted === false);
    setImportant(muted !== true); // default (absent) and "all" both keep important on
    setShowSender(!_notifySettings.stories_hide_sender);
  });

  const save = () => {
    const _notifySettings = notifySettings();
    if(!_notifySettings || props.reset.pending) {
      return;
    }

    // false → all, undefined → important-only (server default), true → none
    const storiesMuted = enabled() ? false : (important() ? undefined : true);
    const hideSender = !showSender();
    if(
      storiesMuted === _notifySettings.stories_muted &&
      hideSender === !!_notifySettings.stories_hide_sender
    ) {
      return;
    }

    const inputSettings: InputPeerNotifySettings = copy(_notifySettings) as any;
    inputSettings._ = 'inputPeerNotifySettings';
    if(storiesMuted === undefined) delete inputSettings.stories_muted;
    else inputSettings.stories_muted = storiesMuted;
    if(hideSender) inputSettings.stories_hide_sender = true;
    else delete inputSettings.stories_hide_sender;
    rootScope.managers.appNotificationsManager.updateNotifySettings(
      inputNotifyPeer,
      inputSettings
    );
    // Publish the change locally right away (not only after the server round-trip
    // that updateNotifySettings awaits) so the sibling Private Chats NotifySection —
    // which shares inputNotifyUsers and rewrites the whole object on tab-close —
    // refreshes its snapshot before its cleanup can copy stale story flags over ours.
    rootScope.managers.appNotificationsManager.generateLocalNotifySettingsUpdate(
      inputNotifyPeer,
      inputSettings
    );
  };

  return (
    <Section name="Stories" caption={!enabled() ? 'NotificationsStoriesImportantInfo' : undefined}>
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={enabled()}
            onChange={(value) => {
              setEnabled(value);
              save();
            }}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('NotificationsStoriesGlobal')}</Row.Title>
      </Row>
      <Show when={!enabled()}>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={important()}
              onChange={(value) => {
                setImportant(value);
                save();
              }}
              toggle
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('NotificationsStoriesImportant')}</Row.Title>
        </Row>
      </Show>
      <Show when={enabled() || important()}>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={showSender()}
              onChange={(value) => {
                setShowSender(value);
                save();
              }}
              toggle
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('NotificationsStoriesDisplayAuthor')}</Row.Title>
        </Row>
      </Show>
    </Section>
  );
};

// * Reactions notifications (account.getReactionsNotifySettings / set…). Each of
// * messages / stories / poll votes (tdesktop's "Votes in my polls") is a 3-state
// * `ReactionNotificationsFrom`: absent = off, fromContacts, fromAll — chosen via
// * a per-row menu (default "contacts" like iOS).
// * `show_previews` (shown when any category is on) gates the sender's name.
// * `sound` has no UI here, so it's carried through.
type ReactionsFrom = 'off' | 'contacts' | 'all';

const ReactionsNotifySection = (props: {reset: ResetState}) => {
  const [messages, setMessages] = createSignal<ReactionsFrom>('off');
  const [stories, setStories] = createSignal<ReactionsFrom>('off');
  const [pollVotes, setPollVotes] = createSignal<ReactionsFrom>('off');
  const [showPreviews, setShowPreviews] = createSignal(true);
  const [settings, setSettings] = createSignal<ReactionsNotifySettings>();

  const fromToStr = (from: ReactionNotificationsFrom): ReactionsFrom =>
    !from ? 'off' : (from._ === 'reactionNotificationsFromAll' ? 'all' : 'contacts');
  const strToFrom = (v: ReactionsFrom): ReactionNotificationsFrom =>
    v === 'off' ? undefined :
      v === 'all' ? {_: 'reactionNotificationsFromAll'} : {_: 'reactionNotificationsFromContacts'};

  createEffect(() => {
    const s = settings();
    if(!s) {
      return;
    }

    setMessages(fromToStr(s.messages_notify_from));
    setStories(fromToStr(s.stories_notify_from));
    setPollVotes(fromToStr(s.poll_votes_notify_from));
    setShowPreviews(!!s.show_previews);
  });

  const save = () => {
    const s = settings();
    if(!s || props.reset.pending) {
      return;
    }

    rootScope.managers.appNotificationsManager.setReactionsNotifySettings({
      _: 'reactionsNotifySettings',
      sound: s.sound,
      show_previews: showPreviews(),
      messages_notify_from: strToFrom(messages()),
      stories_notify_from: strToFrom(stories()),
      poll_votes_notify_from: strToFrom(pollVotes())
    }).then(setSettings);
  };

  rootScope.managers.appNotificationsManager.getReactionsNotifySettings().then((s) => {
    if(!settings()) {
      setSettings(s);
    }
  });

  // * whatever "Reset All Notifications" left of them, asked for again
  subscribeOn(rootScope)('notify_settings_reset', () => {
    // * nothing is saved from the toggles until they take what the reset left
    setSettings(undefined);
    rootScope.managers.appNotificationsManager.getReactionsNotifySettings().then(setSettings);
  });

  const CategoryRows = (props: {
    title: LangPackKey,
    value: () => ReactionsFrom,
    setValue: (v: ReactionsFrom) => void
  }) => {
    const set = (v: ReactionsFrom) => {
      props.setValue(v);
      save();
    };

    return (
      <>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={props.value() !== 'off'}
              onChange={(checked) => set(checked ? 'contacts' : 'off')}
              toggle
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n(props.title)}</Row.Title>
        </Row>
        <Show when={props.value() !== 'off'}>
          <Row contextMenu={{
            buttons: [{
              text: 'ReactionsNotifyContacts',
              onClick: () => set('contacts')
            }, {
              text: 'ReactionsNotifyEveryone',
              onClick: () => set('all')
            }]
          }}>
            <Row.Title
              titleRight={i18n(props.value() === 'all' ? 'ReactionsNotifyEveryone' : 'ReactionsNotifyContacts')}
              titleRightSecondary
            >
              {i18n('ReactionsNotifyFrom')}
            </Row.Title>
          </Row>
        </Show>
      </>
    );
  };

  return (
    <Section name="Reactions">
      <CategoryRows title="ReactionsNotifyMessages" value={messages} setValue={setMessages} />
      <CategoryRows title="ReactionsNotifyStories" value={stories} setValue={setStories} />
      <CategoryRows title="ReactionsNotifyPollVotes" value={pollVotes} setValue={setPollVotes} />
      <Show when={messages() !== 'off' || stories() !== 'off' || pollVotes() !== 'off'}>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              checked={showPreviews()}
              onChange={(value) => {
                setShowPreviews(value);
                save();
              }}
              toggle
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('NotificationsStoriesDisplayAuthor')}</Row.Title>
        </Row>
      </Show>
    </Section>
  );
};

const OtherSection = (props: {reset: ResetState}) => {
  const [contactJoined, setContactJoined] = createSignal(true);
  const owner = getOwner();
  // * what the server has, to tell a change of the user's from it
  let saved: boolean;
  const load = () => rootScope.managers.appNotificationsManager.getContactSignUpNotification().then((enabled) => {
    saved = enabled;
    setContactJoined(enabled);
  });

  props.reset.discards.add(() => {
    if(saved !== undefined) {
      setContactJoined(saved);
    }
  });

  load().then(() => {
    runWithOwner(owner, () => onCleanup(() => {
      // * only what the user switched since the switch took what is saved, as NotifySection
      const _enabled = contactJoined();
      if(!props.reset.pending && _enabled !== saved) {
        rootScope.managers.appNotificationsManager.setContactSignUpNotification(!_enabled);
      }
    }));
  });

  // * whatever "Reset All Notifications" left of it, asked for again
  subscribeOn(rootScope)('notify_settings_reset', load);

  return (
    <Section name="NotificationsOther">
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={contactJoined()}
            onChange={setContactJoined}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('ContactJoined')}</Row.Title>
      </Row>
    </Section>
  );
};

const NotificationsSection = () => {
  const {uiNotificationsManager} = useHotReloadGuard();
  const [appSettings, setAppSettings] = useAppSettings();
  const [permission, setPermission] = createSignal<NotificationPermission>(
    IS_NOTIFICATION_SUPPORTED ? Notification.permission : 'denied'
  );
  const isGranted = createMemo(() => permission() === 'granted');

  const onClick = (e: MouseEvent) => {
    cancelEvent(e);
    if(!IS_NOTIFICATION_SUPPORTED) {
      toastNew({langPackKey: 'Notifications.Restricted'});
      return;
    }

    // const now = Date.now();
    Notification.requestPermission().then((permission) => {
      setPermission(permission);
      if(permission === 'granted') {
        uiNotificationsManager.onPushConditionsChange();
      } else {
        throw 1;
      }
    }, () => {
      // if((Date.now() - now) < 100) {
      toastNew({langPackKey: 'Notifications.Restricted'});
      // }
    });
  };

  const NotificationRow = (props: Parameters<typeof Row>[0]) => {
    return (
      <Row
        {...props}
        fakeDisabled={!isGranted()}
        clickable={!isGranted() && onClick}
      />
    );
  };

  const NotificationCheckbox = (props: Parameters<typeof CheckboxFieldTsx>[0]) => {
    return (
      <CheckboxFieldTsx
        {...props}
        checked={isGranted() && props.checked}
      />
    );
  };

  return (
    <Section
      name="Notifications.Web"
      caption={isGranted() ? 'MultiAccount.ShowNotificationsFromCaption' : 'Notifications.Default'}
    >
      <NotificationRow>
        <Row.CheckboxFieldToggle>
          <NotificationCheckbox
            checked={appSettings.notifications.desktop}
            onChange={(value) => setAppSettings('notifications', 'desktop', value)}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('Notifications.Show')}</Row.Title>
      </NotificationRow>
      <NotificationRow>
        <Row.CheckboxFieldToggle>
          <NotificationCheckbox
            checked={appSettings.notifications.push}
            onChange={(value) => setAppSettings('notifications', 'push', value)}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('Notifications.Offline')}</Row.Title>
      </NotificationRow>
      <NotificationRow>
        <Row.CheckboxFieldToggle>
          <NotificationCheckbox
            checked={appSettings.notifyAllAccounts}
            onChange={(value) => setAppSettings('notifyAllAccounts', value)}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('MultiAccount.AllAccounts')}</Row.Title>
      </NotificationRow>
      {!isGranted() && (
        <Button
          text="Notifications.Enable"
          class="btn-primary primary btn-transparent"
          icon="unmute"
          disabled={isGranted()}
          onClick={onClick}
        />
      )}
    </Section>
  );
};

const SoundSection = () => {
  const {uiNotificationsManager} = useHotReloadGuard();
  const [appSettings, setAppSettings] = useAppSettings();

  return (
    <Section
      name="Notifications.Sound.Section"
      caption="Notifications.Sound.Caption"
    >
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={appSettings.notifications.sound}
            onChange={(value) => {
              if(value && !appSettings.notifications.volume) {
                setAppSettings('notifications', 'volume', SETTINGS_INIT.notifications.volume);
              }

              setAppSettings('notifications', 'sound', value);
            }}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('Notifications.Sound')}</Row.Title>
      </Row>
      <RangeSettingSelector
        textLeft={i18n('Notifications.Sound.Volume')}
        textRight={(value) => '' + Math.floor(value * 100) + '%'}
        step={0.01}
        value={appSettings.notifications.volume}
        minValue={0}
        maxValue={1}
        onChange={(value) => {
          value = +value.toFixed(2);
          if(!value) {
            setAppSettings('notifications', 'sound', false);
          }

          setAppSettings('notifications', 'volume', value);
        }}
        onMouseUp={() => {
          uiNotificationsManager.testSound(appSettings.notifications.volume);
        }}
      />
    </Section>
  );
};

const SoundEffectsSection = () => {
  const [appSettings, setAppSettings] = useAppSettings();

  return (
    <Section name="Notifications.Sound.Effects">
      <Row>
        <Row.CheckboxFieldToggle>
          <CheckboxFieldTsx
            checked={appSettings.notifications.sentMessageSound}
            onChange={(value) => setAppSettings('notifications', 'sentMessageSound', value)}
            toggle
          />
        </Row.CheckboxFieldToggle>
        <Row.Title>{i18n('Notifications.Sound.Sent')}</Row.Title>
      </Row>
    </Section>
  );
};

// * iOS's and Android's "Reset All Notifications" (tdesktop has none): every exception and every type's settings
// * back to the server's defaults
const ResetSection = (props: {reset: ResetState}) => {
  const [tab] = useSuperTab<typeof AppNotificationsTab>();

  const onClick = async() => {
    const {managers} = tab;
    try {
      await confirmationPopup({
        titleLangKey: 'ResetNotificationsAlertTitle',
        descriptionLangKey: 'ResetNotificationsAlert',
        button: {
          langKey: 'Reset',
          isDanger: true
        }
      });
    } catch(err) {
      return;
    }

    const discardUnsaved = () => props.reset.discards.forEach((discard) => discard());
    discardUnsaved();
    props.reset.pending = true;
    try {
      await managers.appNotificationsManager.resetNotifySettings();
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
      return;
    } finally {
      props.reset.pending = false;
      // * and what was switched while it was out, on toggles that had yet to take what it left
      discardUnsaved();
    }

    toastNew({langPackKey: 'ResetNotificationsText'});
  };

  return (
    <Section caption="UndoAllCustom">
      <Button
        class="btn-primary btn-transparent danger"
        icon="delete"
        text="ResetAllNotifications"
        onClick={onClick}
      />
    </Section>
  );
};

const Notifications = () => {
  const reset: ResetState = {discards: new Set(), pending: false};

  return (
    <>
      <NotificationsSection />
      <SoundSection />
      <SoundEffectsSection />
      <NotifySection
        name="NotificationsPrivateChats"
        typeText="NotificationsForPrivateChats"
        inputKey="inputNotifyUsers"
        reset={reset}
      />
      <NotifySection
        name="NotificationsGroups"
        typeText="NotificationsForGroups"
        inputKey="inputNotifyChats"
        reset={reset}
      />
      <NotifySection
        name="NotificationsChannels"
        typeText="NotificationsForChannels"
        inputKey="inputNotifyBroadcasts"
        reset={reset}
      />
      <StoriesNotifySection reset={reset} />
      <ReactionsNotifySection reset={reset} />
      <OtherSection reset={reset} />
      <ResetSection reset={reset} />
    </>
  );
}

export default Notifications;

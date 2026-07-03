import {SETTINGS_INIT} from '@config/state';
import copy from '@helpers/object/copy';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import convertKeyToInputKey from '@helpers/string/convertKeyToInputKey';
import {InputNotifyPeer, InputPeerNotifySettings, PeerNotifySettings, ReactionNotificationsFrom, ReactionsNotifySettings, Update} from '@layer';
import {i18n, LangPackKey} from '@lib/langPack';
import {MUTE_UNTIL} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
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

type InputNotifyKey = Exclude<InputNotifyPeer['_'], 'inputNotifyPeer' | 'inputNotifyForumTopic'>;

const NotifySection = (props: {
  name: LangPackKey,
  typeText: LangPackKey,
  inputKey: InputNotifyKey,
}) => {
  const [enabled, setEnabled] = createSignal(true);
  const [showPreviews, setShowPreviews] = createSignal(true);
  const [notifySettings, setNotifySettings] = createSignal<PeerNotifySettings>();
  const inputNotifyPeer = {_: props.inputKey};

  createEffect(async() => {
    const _notifySettings = notifySettings();
    if(!_notifySettings) {
      return;
    }

    const muted = await rootScope.managers.appNotificationsManager.isMuted(_notifySettings);
    setEnabled(!muted);
    setShowPreviews(!!_notifySettings.show_previews);

    return muted;
  });

  onCleanup(async() => {
    const mute = !enabled();
    const _showPreviews = showPreviews();
    const _notifySettings = notifySettings();
    const isMuted = await rootScope.managers.appNotificationsManager.isMuted(_notifySettings);
    if(
      mute === isMuted &&
      _showPreviews === _notifySettings.show_previews
    ) {
      return;
    }

    const inputSettings: InputPeerNotifySettings = copy(_notifySettings) as any;
    inputSettings._ = 'inputPeerNotifySettings';
    inputSettings.mute_until = mute ? MUTE_UNTIL : 0;
    inputSettings.show_previews = _showPreviews;
    rootScope.managers.appNotificationsManager.updateNotifySettings(
      inputNotifyPeer,
      inputSettings
    );
  });

  subscribeOn(rootScope)('notify_settings', (update: Update.updateNotifySettings) => {
    const inputKey = convertKeyToInputKey(update.peer._) as any;
    if(props.inputKey === inputKey) {
      setNotifySettings(update.notify_settings);
    }
  });

  const ret = rootScope.managers.appNotificationsManager.getNotifySettings(inputNotifyPeer);
  (ret instanceof Promise ? ret : Promise.resolve(ret)).then((_notifySettings) => {
    if(!notifySettings()) {
      setNotifySettings(_notifySettings);
    }
  });

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
    </Section>
  );
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
const StoriesNotifySection = () => {
  const [enabled, setEnabled] = createSignal(true); // "New Stories" — notify for all
  const [important, setImportant] = createSignal(true); // when !enabled: important-only vs off
  const [showSender, setShowSender] = createSignal(true);
  const [notifySettings, setNotifySettings] = createSignal<PeerNotifySettings>();
  const inputNotifyPeer = {_: 'inputNotifyUsers'} as const;

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
    if(!_notifySettings) {
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

  subscribeOn(rootScope)('notify_settings', (update: Update.updateNotifySettings) => {
    const inputKey = convertKeyToInputKey(update.peer._) as any;
    if(inputNotifyPeer._ === inputKey) {
      setNotifySettings(update.notify_settings);
    }
  });

  const ret = rootScope.managers.appNotificationsManager.getNotifySettings(inputNotifyPeer);
  (ret instanceof Promise ? ret : Promise.resolve(ret)).then((_notifySettings) => {
    if(!notifySettings()) {
      setNotifySettings(_notifySettings);
    }
  });

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
// * messages / stories is a 3-state `ReactionNotificationsFrom`: absent = off,
// * fromContacts, fromAll — chosen via a per-row menu (default "contacts" like iOS).
// * `show_previews` (shown when either category is on) gates the sender's name.
// * `sound` / `poll_votes_notify_from` have no UI here, so they're carried through.
type ReactionsFrom = 'off' | 'contacts' | 'all';

const ReactionsNotifySection = () => {
  const [messages, setMessages] = createSignal<ReactionsFrom>('off');
  const [stories, setStories] = createSignal<ReactionsFrom>('off');
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
    setShowPreviews(!!s.show_previews);
  });

  const save = () => {
    const s = settings();
    if(!s) {
      return;
    }

    rootScope.managers.appNotificationsManager.setReactionsNotifySettings({
      _: 'reactionsNotifySettings',
      sound: s.sound,
      show_previews: showPreviews(),
      messages_notify_from: strToFrom(messages()),
      stories_notify_from: strToFrom(stories()),
      poll_votes_notify_from: s.poll_votes_notify_from
    }).then(setSettings);
  };

  rootScope.managers.appNotificationsManager.getReactionsNotifySettings().then((s) => {
    if(!settings()) {
      setSettings(s);
    }
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
      <Show when={messages() !== 'off' || stories() !== 'off'}>
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

const OtherSection = () => {
  const [contactJoined, setContactJoined] = createSignal(true);
  const owner = getOwner();
  rootScope.managers.appNotificationsManager.getContactSignUpNotification().then((enabled) => {
    setContactJoined(enabled);

    runWithOwner(owner, () => onCleanup(() => {
      const _enabled = contactJoined();
      if(_enabled !== enabled) {
        rootScope.managers.appNotificationsManager.setContactSignUpNotification(!_enabled);
      }
    }));
  });

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
  const [permission, setPermission] = createSignal<NotificationPermission>(Notification.permission);
  const isGranted = createMemo(() => permission() === 'granted');

  const onClick = (e: MouseEvent) => {
    cancelEvent(e);
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

const Notifications = () => {
  return (
    <>
      <NotificationsSection />
      <SoundSection />
      <SoundEffectsSection />
      <NotifySection
        name="NotificationsPrivateChats"
        typeText="NotificationsForPrivateChats"
        inputKey="inputNotifyUsers"
      />
      <NotifySection
        name="NotificationsGroups"
        typeText="NotificationsForGroups"
        inputKey="inputNotifyChats"
      />
      <NotifySection
        name="NotificationsChannels"
        typeText="NotificationsForChannels"
        inputKey="inputNotifyBroadcasts"
      />
      <StoriesNotifySection />
      <ReactionsNotifySection />
      <OtherSection />
    </>
  );
}

export default Notifications;

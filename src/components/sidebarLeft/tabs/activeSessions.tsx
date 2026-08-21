import {Component, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import PeerTitle from '@components/peerTitle';
import Section from '@components/section';
import InlineSelect from '@components/sidebarLeft/tabs/passcodeLock/inlineSelect';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {
  AppConnectedBotSessionTab,
  AppSessionTab,
  type AppActiveSessionsTab
} from '@components/solidJsTabs/tabs';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {DurationType} from '@helpers/formatDuration';
import anchorCallback from '@helpers/dom/anchorCallback';
import getSessionPlatformIcon from '@helpers/sessionPlatformIcon';
import {Authorization, ConnectedBot} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const TERMINATE_CONNECTED_BOT_KEY = 'ChatAutomation.TerminateConnectedBot';
/** tdesktop's `kMaxDeviceModelLength`. */
const MAX_DEVICE_MODEL_LENGTH = 32;
/** tdesktop's `kShortPollTimeout` — the sessions list has no update to listen to. */
const REFRESH_INTERVAL = 60e3;
/** The periods tdesktop offers for `account.setAuthorizationTTL`, in days. */
const TTL_OPTIONS = [
  {days: 7, duration: 1, type: DurationType.Weeks},
  {days: 30, duration: 1, type: DurationType.Months},
  {days: 90, duration: 3, type: DurationType.Months},
  {days: 180, duration: 6, type: DurationType.Months},
  {days: 365, duration: 1, type: DurationType.Years}
].map((option) => ({
  value: option.days,
  label: () => wrapFormattedDuration([option])
}));

const isSameHash = (a: Authorization.authorization, b: Authorization.authorization) => {
  return '' + a.hash === '' + b.hash;
};

/** A server is free to hold a period this list doesn't offer (183 days, say). */
const nearestTTLOption = (days: number) => TTL_OPTIONS.reduce((nearest, option) => {
  return Math.abs(days - option.value) < Math.abs(days - nearest.value) ? option : nearest;
}, TTL_OPTIONS[0]).value;

const ActiveSessions: Component = () => {
  const [tab] = useSuperTab<typeof AppActiveSessionsTab>();
  const {
    rootScope,
    Row,
    i18n,
    confirmationPopup,
    toastNew,
    useAppSettings,
    AvatarNewTsx,
    PeerTitleTsx
  } = useHotReloadGuard();
  const [appSettings, setAppSettings] = useAppSettings();

  const [authorizations, setAuthorizations] = createSignal(tab.payload.authorizations || []);
  const [connectedBot, setConnectedBot] = createSignal(tab.payload.connectedBot);
  const [ttlDays, setTtlDays] = createSignal(tab.payload.ttlDays || 0);

  // A renamed device only reaches the server on the next initConnection, so
  // show the local name right away — as tdesktop does.
  const currentSession = createMemo(() => {
    const authorization = authorizations().find((authorization) => authorization.pFlags.current);
    const customDeviceModel = appSettings.customDeviceModel;
    if(!authorization || !customDeviceModel) return authorization;

    return {...authorization, device_model: customDeviceModel};
  });

  // Sessions that entered the right code but never the password have no access
  // to the account; tdesktop keeps them in their own section.
  const incompleteSessions = createMemo(() => authorizations().filter((authorization) => {
    return !authorization.pFlags.current && !!authorization.pFlags.password_pending;
  }));
  const otherSessions = createMemo(() => authorizations().filter((authorization) => {
    return !authorization.pFlags.current && !authorization.pFlags.password_pending;
  }));
  const hasOtherSessions = () => !!otherSessions().length ||
    !!incompleteSessions().length ||
    !!connectedBot();

  const refresh = () => {
    return tab.managers.appAccountManager.getAuthorizations().then((result) => {
      setAuthorizations(result.authorizations as Authorization.authorization[]);
      setTtlDays(result.authorization_ttl_days || 0);
    }, () => {});
  };

  tab.listenerSetter.add(rootScope)('chat_automation_update', (bot) => {
    setConnectedBot(bot);
  });

  // A new login neither dispatches a sessions event nor arrives as an update we
  // could apply, so poll like tdesktop and refresh eagerly on what we do hear.
  tab.listenerSetter.add(rootScope)('unconfirmed_authorizations_update', () => {
    refresh();
  });

  onMount(() => {
    if(tab.payload.ttlDays === undefined) {
      refresh();
    }

    const interval = setInterval(refresh, REFRESH_INTERVAL);
    onCleanup(() => clearInterval(interval));
  });

  const onError = (err: ApiError) => {
    toastNew({
      langPackKey: err?.type === 'FRESH_RESET_AUTHORISATION_FORBIDDEN' ?
        'RecentSessions.Error.FreshReset' :
        'Error.AnError'
    });
  };

  const confirmTerminate = () => confirmationPopup({
    titleLangKey: 'AreYouSureSessionTitle',
    descriptionLangKey: 'TerminateSessionText',
    button: {
      langKey: 'Terminate',
      isDanger: true
    }
  });

  const terminateSession = async(authorization: Authorization.authorization) => {
    try {
      await confirmTerminate();
    } catch(err) {
      return false;
    }

    try {
      const terminated = await tab.managers.appAccountManager.resetAuthorization(authorization.hash);
      if(terminated) {
        // not identity: a refresh in between swaps every entry for a fresh one
        setAuthorizations((list) => list.filter((item) => !isSameHash(item, authorization)));
      }

      return terminated;
    } catch(err) {
      onError(err as ApiError);
      return false;
    }
  };

  const terminateConnectedBot = async(bot: ConnectedBot.connectedBot) => {
    try {
      await confirmTerminate();
    } catch(err) {
      return;
    }

    // The row disappears through `chat_automation_update`.
    tab.managers.appBusinessManager.updateConnectedBot({
      previousBotId: bot.bot_id as UserId
    }).catch(onError);
  };

  const terminateAll = async() => {
    const bot = connectedBot();
    const options = {
      titleLangKey: 'AreYouSureSessionsTitle',
      descriptionLangKey: 'AreYouSureSessions',
      button: {
        langKey: 'Terminate',
        isDanger: true
      }
    } as const;

    let alsoTerminateBot = false;
    try {
      if(bot) {
        alsoTerminateBot = await confirmationPopup({
          ...options,
          checkbox: {
            text: TERMINATE_CONNECTED_BOT_KEY,
            textArgs: [new PeerTitle({
              peerId: (bot.bot_id as UserId).toPeerId(false),
              username: true
            }).element]
          }
        });
      } else {
        await confirmationPopup(options);
      }
    } catch(err) {
      return;
    }

    try {
      const terminated = await tab.managers.appAccountManager.resetAuthorizations();
      if(!terminated) {
        toastNew({langPackKey: 'Error.AnError'});
        return;
      }

      setAuthorizations((list) => list.filter((authorization) => authorization.pFlags.current));

      if(alsoTerminateBot) {
        await tab.managers.appBusinessManager.updateConnectedBot({
          previousBotId: bot.bot_id as UserId
        });
      }
    } catch(err) {
      onError(err as ApiError);
    }
  };

  const renameDevice = async() => {
    const inputField = new InputField({
      maxLength: MAX_DEVICE_MODEL_LENGTH,
      label: 'AuthSessions.DeviceName'
    });
    inputField.value = appSettings.customDeviceModel || '';

    try {
      await confirmationPopup({
        titleLangKey: 'AuthSessions.RenameDevice',
        inputField,
        button: {langKey: 'Save'}
      });
    } catch(err) {
      return;
    }

    // networkerFactory picks this up and re-inits the connection with the new name
    setAppSettings('customDeviceModel', inputField.value.trim());
  };

  const renameAnchor = () => {
    const anchor = anchorCallback(renameDevice);
    anchor.append(i18n('AuthSessions.RenameDevice'));
    return anchor;
  };

  const setTTL = async(days: number) => {
    const previous = ttlDays();
    setTtlDays(days);

    try {
      await tab.managers.appAccountManager.setAuthorizationTTL(days);
    } catch(err) {
      setTtlDays(previous);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  const openSession = (authorization: Authorization.authorization) => {
    tab.slider.createTab(AppSessionTab).open({
      authorization,
      onTerminate: authorization.pFlags.current ? undefined : () => terminateSession(authorization),
      onSettingsChanged: (updated) => setAuthorizations((list) => {
        return list.map((item) => isSameHash(item, updated) ? {...item, pFlags: updated.pFlags} : item);
      })
    });
  };

  const terminateMenu = (onClick: () => void) => ({
    buttons: [{
      icon: 'stop' as Icon,
      text: 'Terminate' as const,
      danger: true,
      onClick
    }]
  });

  const TTLRow = () => {
    const [rowEl, setRowEl] = createSignal<HTMLElement>();
    const [isOpen, setIsOpen] = createSignal(false);
    const selected = createMemo(() => nearestTTLOption(ttlDays()));

    return (
      <Row ref={setRowEl} clickable={() => setIsOpen(true)}>
        <Row.Title>{i18n('AuthSessions.TerminateIfAwayFor')}</Row.Title>
        <Row.RightContent>
          <InlineSelect
            value={selected()}
            isOpen={isOpen()}
            onClose={() => setIsOpen(false)}
            options={TTL_OPTIONS}
            onChange={(days: number) => {
              setIsOpen(false);
              if(days !== selected()) setTTL(days);
            }}
            parent={rowEl()}
          />
        </Row.RightContent>
      </Row>
    );
  };

  const SessionRow = (props: {authorization: Authorization.authorization}) => {
    const authorization = () => props.authorization;
    const isCurrent = () => !!authorization().pFlags.current;
    const lastActive = () => formatDateAccordingToTodayNew(
      new Date(Math.max(authorization().date_active, authorization().date_created) * 1000)
    );

    return (
      <Row
        class="session-row"
        clickable={() => openSession(authorization())}
        role="button"
        tabIndex={0}
        contextMenu={isCurrent() ? undefined : terminateMenu(() => {
          terminateSession(authorization());
        })}
      >
        <Row.Icon icon={getSessionPlatformIcon(authorization())} />
        <Row.Title titleRight={isCurrent() ? undefined : lastActive()}>
          {[authorization().app_name, authorization().app_version].filter(Boolean).join(' ')}
        </Row.Title>
        <Row.Midtitle>
          {[authorization().device_model, authorization().system_version || authorization().platform].filter(Boolean).join(', ')}
        </Row.Midtitle>
        <Row.Subtitle>
          {[authorization().ip, authorization().country].filter(Boolean).join(' - ')}
        </Row.Subtitle>
      </Row>
    );
  };

  const ConnectedBotRow = (props: {connectedBot: ConnectedBot.connectedBot}) => {
    const bot = () => props.connectedBot;
    const peerId = () => (bot().bot_id as UserId).toPeerId(false);

    return (
      <Row
        class="session-row"
        clickable={() => tab.slider.createTab(AppConnectedBotSessionTab).open({connectedBot: bot()})}
        role="button"
        tabIndex={0}
        contextMenu={terminateMenu(() => {
          terminateConnectedBot(bot());
        })}
      >
        <Row.Media size="40">
          <AvatarNewTsx peerId={peerId()} size={40} />
        </Row.Media>
        <Row.Title titleRight={bot().date ? formatDateAccordingToTodayNew(new Date(bot().date * 1000)) : undefined}>
          <PeerTitleTsx peerId={peerId()} />
        </Row.Title>
        <Row.Midtitle>
          {[bot().device, bot().location].filter(Boolean).join(', ')}
        </Row.Midtitle>
        <Row.Subtitle>{i18n('ChatAutomation.Session')}</Row.Subtitle>
      </Row>
    );
  };

  return (
    <>
      <Section
        name="CurrentSession"
        nameRight={renameAnchor()}
        caption={hasOtherSessions() ? 'ClearOtherSessionsHelp' : undefined}
      >
        <Show when={currentSession()}>
          {(authorization) => <SessionRow authorization={authorization()} />}
        </Show>
        <Show when={hasOtherSessions()}>
          <Button
            class="btn-primary btn-transparent danger"
            icon="stop"
            text="TerminateAllSessions"
            onClick={terminateAll}
          />
        </Show>
      </Section>

      <Show when={incompleteSessions().length}>
        <Section name="AuthSessions.IncompleteAttempts" caption="AuthSessions.IncompleteAttemptsInfo">
          <For each={incompleteSessions()}>
            {(authorization) => <SessionRow authorization={authorization} />}
          </For>
        </Section>
      </Show>

      <Show when={otherSessions().length || connectedBot()}>
        <Section name="OtherSessions" caption="SessionsListInfo">
          <Show when={connectedBot()}>
            {(bot) => <ConnectedBotRow connectedBot={bot()} />}
          </Show>
          <For each={otherSessions()}>
            {(authorization) => <SessionRow authorization={authorization} />}
          </For>
        </Section>
      </Show>

      <Show when={ttlDays()}>
        <Section name="AuthSessions.TerminateIfAwayTitle">
          <TTLRow />
        </Section>
      </Show>
    </>
  );
};

export default ActiveSessions;

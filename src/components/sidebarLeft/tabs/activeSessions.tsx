import {Component, createMemo, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import PeerTitle from '@components/peerTitle';
import Section from '@components/section';
import InactivityPeriodRow, {SESSION_TTL_OPTIONS} from '@components/sidebarLeft/tabs/inactivityPeriodRow';
import {joinSessionParts} from '@components/sidebarLeft/tabs/joinSessionParts';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {type AppActiveSessionsTab} from '@components/solidJsTabs/tabs';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import anchorCallback from '@helpers/dom/anchorCallback';
import getAuthorizationErrorLangKey from '@helpers/getAuthorizationErrorLangKey';
import getSessionPlatformIcon from '@helpers/sessionPlatformIcon';
import {Authorization, ConnectedBot} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';

const TERMINATE_CONNECTED_BOT_KEY = 'ChatAutomation.TerminateConnectedBot';
/** tdesktop's `kMaxDeviceModelLength`. */
const MAX_DEVICE_MODEL_LENGTH = 32;
/** tdesktop's `kShortPollTimeout` — the sessions list has no update to listen to. */
const REFRESH_INTERVAL = 60e3;

const isSameHash = (a: Authorization.authorization, b: Authorization.authorization) => {
  return '' + a.hash === '' + b.hash;
};

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
  const ttlDaysSignal = createSignal(tab.payload.ttlDays || 0);
  const [ttlDays, setTtlDays] = ttlDaysSignal;

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
    toastNew({langPackKey: getAuthorizationErrorLangKey(err)});
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

  const openSession = (authorization: Authorization.authorization) => {
    tab.slider.createTab(hotReloadGuard.tabs.AppSessionTab).open({
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
          {joinSessionParts([authorization().device_model, authorization().system_version || authorization().platform], ', ')}
        </Row.Midtitle>
        <Row.Subtitle>
          {joinSessionParts([{ltr: authorization().ip}, authorization().country], ' - ')}
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
        clickable={() => tab.slider.createTab(hotReloadGuard.tabs.AppConnectedBotSessionTab).open({connectedBot: bot()})}
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
          {joinSessionParts([bot().device, bot().location], ', ')}
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
          <InactivityPeriodRow
            title="AuthSessions.TerminateIfAwayFor"
            options={SESSION_TTL_OPTIONS}
            days={ttlDaysSignal}
            save={(days) => tab.managers.appAccountManager.setAuthorizationTTL(days)}
            reload={() => tab.managers.appAccountManager.getAuthorizationTTL()}
          />
        </Section>
      </Show>
    </>
  );
};

export default ActiveSessions;

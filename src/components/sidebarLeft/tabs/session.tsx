import {createSignal, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import MediaHeader from '@components/mediaHeader';
import Row from '@components/rowTsx';
import Section from '@components/section';
import SessionInfoRow from '@components/sidebarLeft/tabs/sessionInfoRow';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppSessionTab} from '@components/solidJsTabs/tabs';
import {formatDate} from '@helpers/date';
import {getRowIconBackgroundImage} from '@helpers/rowIconBackground';
import getSessionPlatformIcon from '@helpers/sessionPlatformIcon';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import styles from '@components/sidebarLeft/tabs/sessionDetails.module.scss';

export default function SessionTab() {
  const [tab] = useSuperTab<typeof AppSessionTab>();

  const authorization = () => tab.payload.authorization;
  const isCurrent = () => !!authorization().pFlags.current;
  const icon = () => getSessionPlatformIcon(authorization());

  const application = () => [authorization().app_name, authorization().app_version].filter(Boolean).join(' ');
  const system = () => authorization().system_version || authorization().platform;
  const location = () => [authorization().region, authorization().country].filter(Boolean).join(', ');

  const terminate = async() => {
    if(await tab.payload.onTerminate()) {
      tab.close();
    }
  };

  const canTerminate = () => !!tab.payload.onTerminate;

  // `call_requests_disabled` / `encrypted_requests_disabled` are stored inverted
  // — the switches read as "accept". The current session has hash 0, which the
  // server accepts here just like any other; Settings > Speakers and Camera
  // edits the same call flag and re-reads it on open, so the two agree.
  // The secret-chat switch governs whether the session being viewed accepts
  // them, so it is hidden for this one: tweb has no secret chats to accept.
  const [acceptsCalls, setAcceptsCalls] = createSignal(!authorization().pFlags.call_requests_disabled);
  const [acceptsSecretChats, setAcceptsSecretChats] = createSignal(
    !authorization().pFlags.encrypted_requests_disabled
  );

  const changeSetting = async(
    setter: (value: boolean) => void,
    accepted: boolean,
    options: {callRequestsDisabled?: boolean, encryptedRequestsDisabled?: boolean}
  ) => {
    setter(accepted);

    try {
      await rootScope.managers.appAccountManager.changeAuthorizationSettings(
        authorization().hash,
        options
      );

      tab.payload.onSettingsChanged?.({
        ...authorization(),
        pFlags: {
          ...authorization().pFlags,
          call_requests_disabled: acceptsCalls() ? undefined : true,
          encrypted_requests_disabled: acceptsSecretChats() ? undefined : true
        }
      });
    } catch(err) {
      setter(!accepted);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  return (
    <>
      <MediaHeader class={styles.heroHeader}>
        <MediaHeader.Sticker
          size={100}
          element={
            <div
              class={styles.deviceIcon}
              style={{'background-image': getRowIconBackgroundImage(icon())}}
            >
              <IconTsx icon={icon()} />
            </div>
          }
        />
        <MediaHeader.Title class={styles.deviceName}>
          {authorization().device_model || application()}
        </MediaHeader.Title>
        <MediaHeader.Subtitle secondary>
          {isCurrent() ?
            i18n('Online') :
            formatDate(
              new Date(Math.max(authorization().date_active, authorization().date_created) * 1000),
              {withTime: true, shortMonth: true}
            )}
        </MediaHeader.Subtitle>
      </MediaHeader>

      <Section
        name="Info"
        caption={location() ? 'AuthSessions.View.LocationInfo' : undefined}
      >
        <SessionInfoRow label={i18n('AuthSessions.View.Application')} value={application()} />
        <SessionInfoRow label={i18n('AuthSessions.View.System')} value={system()} />
        <SessionInfoRow label={i18n('AuthSessions.View.Location')} value={location()} />
      </Section>

      <Section name="AuthSessions.View.AcceptTitle">
        <Show when={!isCurrent()}>
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                toggle
                checked={acceptsSecretChats()}
                onChange={(checked: boolean) => changeSetting(
                  setAcceptsSecretChats,
                  checked,
                  {encryptedRequestsDisabled: !checked}
                )}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('AuthSessions.View.AcceptSecretChats')}</Row.Title>
          </Row>
        </Show>
        <Row>
          <Row.CheckboxFieldToggle>
            <CheckboxFieldTsx
              toggle
              checked={acceptsCalls()}
              onChange={(checked: boolean) => changeSetting(
                setAcceptsCalls,
                checked,
                {callRequestsDisabled: !checked}
              )}
            />
          </Row.CheckboxFieldToggle>
          <Row.Title>{i18n('AuthSessions.View.AcceptIncomingCalls')}</Row.Title>
        </Row>
      </Section>

      <Show when={canTerminate()}>
        <Section>
          <Button
            class="btn-primary btn-transparent danger"
            icon="stop"
            text="AuthSessions.View.TerminateSession"
            onClick={terminate}
          />
        </Section>
      </Show>
    </>
  );
}

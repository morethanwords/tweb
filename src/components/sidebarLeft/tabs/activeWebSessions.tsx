import {Component, createSignal, For, Show} from 'solid-js';
import Button from '@components/buttonTsx';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppActiveWebSessionsTab} from '@components/solidJsTabs/tabs';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {WebAuthorization} from '@layer';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const ActiveWebSessions: Component = () => {
  const [tab] = useSuperTab<typeof AppActiveWebSessionsTab>();
  const {Row, confirmationPopup, toastNew, wrapPeerTitle, AvatarNewTsx, PeerTitleTsx} = useHotReloadGuard();

  const [sessions, setSessions] = createSignal(tab.payload || []);

  const disconnectAll = async() => {
    try {
      await confirmationPopup({
        descriptionLangKey: 'AreYouSureWebSessions',
        button: {
          langKey: 'Disconnect',
          isDanger: true
        }
      });
    } catch(err) {
      return;
    }

    try {
      await tab.managers.appSeamlessLoginManager.resetWebAuthorizations();
      tab.close();
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  const disconnect = async(session: WebAuthorization) => {
    const peerId = session.bot_id.toPeerId();

    try {
      await confirmationPopup({
        descriptionLangKey: 'TerminateWebSessionText',
        descriptionLangArgs: [await wrapPeerTitle({peerId})],
        button: {
          langKey: 'Disconnect',
          isDanger: true
        }
      });
    } catch(err) {
      return;
    }

    try {
      await tab.managers.appSeamlessLoginManager.resetWebAuthorization(session.hash);
      const left = sessions().filter((item) => item !== session);
      if(!left.length) {
        tab.close();
        return;
      }

      setSessions(left);
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  const WebSessionRow = (props: {session: WebAuthorization}) => {
    const session = () => props.session;
    const peerId = () => session().bot_id.toPeerId();

    return (
      <Row
        class="session-row"
        clickable={() => disconnect(session())}
        role="button"
        tabIndex={0}
      >
        <Row.Media size="big">
          <AvatarNewTsx peerId={peerId()} size={48} />
        </Row.Media>
        <Row.Title
          titleRight={formatDateAccordingToTodayNew(
            new Date(Math.max(session().date_active, session().date_created) * 1000)
          )}
        >
          <PeerTitleTsx peerId={peerId()} />
        </Row.Title>
        <Row.Midtitle>
          {[session().domain, session().browser, session().platform].filter(Boolean).join(', ')}
        </Row.Midtitle>
        <Row.Subtitle>
          {[session().ip, session().region].filter(Boolean).join(' - ')}
        </Row.Subtitle>
      </Row>
    );
  };

  return (
    <>
      <Section caption="ClearOtherWebSessionsHelp">
        <Button
          class="btn-primary btn-transparent danger"
          icon="stop"
          text="TerminateAllWebSessions"
          onClick={disconnectAll}
        />
      </Section>

      <Show when={sessions().length}>
        <Section name="OtherWebSessions" caption="TerminateWebSessionInfo">
          <For each={sessions()}>
            {(session) => <WebSessionRow session={session} />}
          </For>
        </Section>
      </Show>
    </>
  );
};

export default ActiveWebSessions;

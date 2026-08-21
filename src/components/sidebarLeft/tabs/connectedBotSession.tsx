import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import confirmationPopup from '@components/confirmationPopup';
import MediaHeader from '@components/mediaHeader';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import SessionInfoRow from '@components/sidebarLeft/tabs/sessionInfoRow';
import {
  AppChatAutomationTab,
  AppConnectedBotSessionTab
} from '@components/solidJsTabs/tabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {formatDate} from '@helpers/date';
import isSameUserId from '@helpers/isSameUserId';
import {ConnectedBot} from '@layer';
import {i18n} from '@lib/langPack';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {createSignal, Show} from 'solid-js';
import {toastNew} from '@components/toast';
import styles from '@components/sidebarLeft/tabs/sessionDetails.module.scss';

type AppConnectedBotSessionTabType = typeof AppConnectedBotSessionTab;

export default function ConnectedBotSessionTab() {
  const [tab] = useSuperTab<AppConnectedBotSessionTabType>();
  const [connectedBot, setConnectedBot] = createSignal(tab.payload.connectedBot);
  const botId = () => connectedBot().bot_id as UserId;

  tab.listenerSetter.add(rootScope)('chat_automation_update', (bot) => {
    if(!bot || !isSameUserId(bot.bot_id as UserId, botId())) {
      tab.close();
      return;
    }

    setConnectedBot(bot);
  });

  const openAutomation = () => {
    tab.slider.createTab(AppChatAutomationTab).open({connectedBot: connectedBot()});
  };

  const terminate = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'AreYouSureSessionTitle',
        descriptionLangKey: 'TerminateSessionText',
        button: {
          langKey: 'Terminate',
          isDanger: true
        }
      });
    } catch(err) {
      return;
    }

    try {
      await tab.managers.appBusinessManager.updateConnectedBot({
        previousBotId: botId()
      });
    } catch(err) {
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  return (
    <>
      <MediaHeader class={styles.heroHeader}>
        <MediaHeader.Sticker
          size={100}
          element={<AvatarNewTsx peerId={botId().toPeerId(false)} size={100} />}
        />
        <MediaHeader.Title>
          <PeerTitleTsx peerId={botId().toPeerId(false)} />
        </MediaHeader.Title>
        <MediaHeader.Subtitle>
          <div>{i18n('ChatAutomation.Session')}</div>
          <button
            type="button"
            class={styles.profileLink}
            onClick={() => appImManager.setInnerPeer({peerId: botId().toPeerId(false)})}
          >
            <PeerTitleTsx peerId={botId().toPeerId(false)} username />
          </button>
        </MediaHeader.Subtitle>
      </MediaHeader>

      <Section name="ChatAutomation.ConnectedFrom">
        <SessionInfoRow
          label={i18n('ChatAutomation.SessionDevice')}
          value={connectedBot().device}
          valueClass={styles.deviceValue}
        />
        <Show when={connectedBot().date}>
          {(date) => (
            <SessionInfoRow
              label={i18n('ChatAutomation.SessionDate')}
              value={formatDate(new Date(date() * 1000), {withTime: true, shortMonth: true})}
            />
          )}
        </Show>
        <SessionInfoRow
          label={i18n('ChatAutomation.SessionLocation')}
          value={connectedBot().location}
        />
      </Section>

      <Section>
        <Row
          class={styles.manageRow}
          clickable={openAutomation}
          role="button"
          tabIndex={0}
        >
          <Row.Title>{i18n('ChatAutomation.ManageAutomation')}</Row.Title>
        </Row>
      </Section>

      <Section>
        <Button
          class="btn-primary btn-transparent danger"
          icon="stop"
          text="ChatAutomation.TerminateSession"
          onClick={terminate}
        />
      </Section>
    </>
  );
}

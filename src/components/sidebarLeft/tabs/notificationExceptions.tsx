/*
 * One chat type's notification exceptions — tdesktop's `settings_notifications_type.cpp`: the chats with settings of
 * their own, each with its state, one more added through the chat picker and the mute popup, one or all of them
 * handed back to the type's settings.
 */

import {createMemo, For, Show} from 'solid-js';
import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Row from '@components/rowTsx';
import Section from '@components/section';
import confirmationPopup from '@components/confirmationPopup';
import showMutePopup from '@components/popups/mute';
import showPickUserPopup from '@components/popups/pickUser';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppNotificationExceptionsTab, AppNotificationExceptionsTabPayload} from '@components/solidJsTabs/tabs';
import type {IsPeerType} from '@appManagers/appPeersManager';
import {i18n} from '@lib/langPack';

const PEER_TYPES: {[key in AppNotificationExceptionsTabPayload['inputKey']]: IsPeerType[]} = {
  inputNotifyUsers: ['isUser'],
  inputNotifyChats: ['isAnyGroup'],
  inputNotifyBroadcasts: ['isBroadcast']
};

const NotificationExceptions = () => {
  const [tab] = useSuperTab<typeof AppNotificationExceptionsTab>();
  const {inputKey, exceptions} = tab.payload;
  const {managers} = tab;

  const peerIds = createMemo(() => (exceptions() || []).map(({peerId}) => peerId));
  const mutedPeerIds = createMemo(() => new Set(
    (exceptions() || []).filter(({muted}) => muted).map(({peerId}) => peerId)
  ));

  const resetPeers = (peerIds: PeerId[]) => {
    managers.appNotificationsManager.resetPeersNotifySettings(peerIds);
  };

  const addException = () => {
    showPickUserPopup({
      titleLangKey: 'NotificationsAddAnException',
      placeholder: 'Search',
      filterPeerTypeBy: PEER_TYPES[inputKey],
      exceptSelf: true,
      excludeMonoforums: true,
      excludePeerIds: new Set(peerIds()),
      // * the choice made in the mute popup is what makes it an exception, as in tdesktop's mute menu
      onSelect: ([{peerId}]) => showMutePopup(peerId)
    });
  };

  const deleteAll = async() => {
    try {
      await confirmationPopup({
        titleLangKey: 'NotificationsDeleteAllExceptionTitle',
        descriptionLangKey: 'NotificationsDeleteAllExceptionAlert',
        button: {
          langKey: 'Delete',
          isDanger: true
        }
      });
    } catch(err) {
      return;
    }

    resetPeers(peerIds());
  };

  const ExceptionRow = (props: {peerId: PeerId}) => {
    const muted = () => mutedPeerIds().has(props.peerId);

    return (
      <Row
        contextMenu={{
          buttons: [{
            icon: 'mute',
            text: 'ChatList.Context.Mute',
            onClick: () => showMutePopup(props.peerId),
            verify: () => !muted()
          }, {
            icon: 'unmute',
            text: 'ChatList.Context.Unmute',
            onClick: () => managers.appMessagesManager.togglePeerMute({peerId: props.peerId, mute: false}),
            verify: muted
          }, {
            icon: 'delete',
            className: 'danger',
            text: 'Remove',
            onClick: () => resetPeers([props.peerId])
          }]
        }}
      >
        <Row.Media size="abitbigger">
          <AvatarNewTsx peerId={props.peerId} size={42} isDialog />
        </Row.Media>
        <Row.Title>
          <PeerTitleTsx peerId={props.peerId} withIcons />
        </Row.Title>
        <Row.Subtitle>
          {i18n(muted() ? 'NotificationsMuted' : 'NotificationsUnmuted')}
        </Row.Subtitle>
      </Row>
    );
  };

  return (
    <>
      <Section>
        <Button
          class="btn-primary btn-transparent primary"
          icon="add"
          text="NotificationsAddAnException"
          onClick={addException}
        />
      </Section>
      <Show when={peerIds().length}>
        <Section name="NotificationsExceptions">
          <For each={peerIds()}>{(peerId) => <ExceptionRow peerId={peerId} />}</For>
        </Section>
        <Section>
          <Button
            class="btn-primary btn-transparent danger"
            icon="delete"
            text="NotificationsDeleteAllException"
            onClick={deleteAll}
          />
        </Section>
      </Show>
    </>
  );
};

export default NotificationExceptions;

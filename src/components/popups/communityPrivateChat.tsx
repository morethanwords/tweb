import {createMemo, createSignal, Show} from 'solid-js';
import {AvatarNewTsx} from '@components/avatarNew';
import {IconTsx} from '@components/iconTsx';
import MediaHeader from '@components/mediaHeader';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import appImManager from '@lib/appImManager';
import apiManagerProxy from '@lib/apiManagerProxy';
import {i18n} from '@lib/langPack';
import styles from '@components/popups/communityPrivateChat.module.scss';

export default function showCommunityPrivateChat(options: {
  peerId: PeerId,
  requestedByPeerId?: PeerId,
  memberCount?: number,
  canOpenChat?: boolean
}) {
  const [show, setShow] = createSignal(false);
  const close = () => setShow(false);
  const kind = createMemo(() => {
    const peer = apiManagerProxy.getPeer(options.peerId);
    if(peer?._ === 'user' && peer.pFlags.bot) {
      return 'bot';
    }
    if(peer?._ === 'channel' && peer.pFlags.broadcast) {
      return 'channel';
    }
    return 'group';
  });
  const infoKey = () => {
    switch(kind()) {
      case 'bot':
        return 'Community.PrivateBotInfo' as const;
      case 'channel':
        return 'Community.PrivateChannelInfo' as const;
      default:
        return 'Community.PrivateChatInfo' as const;
    }
  };
  const messageOwnerKey = () => {
    switch(kind()) {
      case 'bot':
        return 'Community.MessageBotOwner' as const;
      case 'channel':
        return 'Community.MessageChannelOwner' as const;
      default:
        return 'Community.MessageOwner' as const;
    }
  };
  createPopup(() => (
    <PopupElement
      class={styles.popup}
      show={show()}
      old
    >
      <PopupElement.Header class={styles.header}>
        <PopupElement.CloseButton />
      </PopupElement.Header>
      <PopupElement.Body>
        <MediaHeader class={styles.mediaHeader} marginBottom>
          <MediaHeader.Sticker
            size={100}
            element={(
              <AvatarNewTsx
                peerId={options.peerId}
                size={100}
                isBig
              />
            )}
          />
          <MediaHeader.Title>
            <PeerTitleTsx peerId={options.peerId} />
          </MediaHeader.Title>
          <Show when={options.memberCount !== undefined}>
            <MediaHeader.Subtitle secondary>
              {i18n(kind() === 'channel' ? 'Subscribers' : 'Members', [
                options.memberCount
              ])}
            </MediaHeader.Subtitle>
          </Show>
        </MediaHeader>
        <div class={styles.info}>
          <IconTsx
            class="inline-icon inline-icon-left"
            icon="eye2"
          />
          <span>{i18n(infoKey())}</span>
        </div>
      </PopupElement.Body>
      <PopupElement.Footer>
        <Show when={options.canOpenChat}>
          <PopupElement.FooterButton
            color="secondary"
            langKey={kind() === 'channel' ? 'OpenChannel2' : 'OpenChat'}
            callback={() => {
              void appImManager.setInnerPeer({peerId: options.peerId});
            }}
          />
        </Show>
        <PopupElement.FooterButton
          disabled={!options.requestedByPeerId}
          callback={() => {
            if(options.requestedByPeerId) {
              void appImManager.setInnerPeer({
                peerId: options.requestedByPeerId
              });
            }
          }}
        >
          {i18n(messageOwnerKey())}
        </PopupElement.FooterButton>
      </PopupElement.Footer>
    </PopupElement>
  ));

  queueMicrotask(() => setShow(true));
  return close;
}

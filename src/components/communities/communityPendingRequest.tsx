import {Show} from 'solid-js';
import type {CommunityPeerRequest} from '@layer';
import type {AppManagers} from '@lib/managers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import apiManagerProxy from '@lib/apiManagerProxy';
import {i18n, LangPackKey} from '@lib/langPack';
import {AvatarNewTsx} from '@components/avatarNew';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import Row from '@components/rowTsx';
import {toastNew} from '@components/toast';
import {
  getCommunityPeerParticipantsCount
} from '@components/communities/communityPeerStatus';
import showCommunityPrivateChat from '@components/popups/communityPrivateChat';
import {
  isCommunityRequestPrivate
} from '@components/communities/communityRequestNavigation';
import styles from '@components/communities/communityManagement.module.scss';
import sharedStyles from '@components/communities/communityShared.module.scss';
import formatNumber from '@helpers/number/formatNumber';

export {
  getCommunityRequestOpenPeerId,
  isCommunityRequestPrivate
} from '@components/communities/communityRequestNavigation';

export async function showCommunityRequestError(options: {
  error: ApiError,
  managers: AppManagers,
  peerId?: PeerId
}) {
  if(options.error.type === 'COMMUNITY_PEERS_TOO_MUCH') {
    try {
      const isBot = !!options.peerId?.isUser();
      const limit = await options.managers.appCommunitiesManager
      .getPeersLimit(isBot);
      toastNew({
        langPackKey: isBot ?
          'Community.BotPeersLimit' :
          'Community.PeersLimit',
        langPackArguments: [limit]
      });
      return;
    } catch{
      // Fall through to the request error below.
    }
  }

  toastNew({
    langPackKey: options.error.type === 'CHAT_ADMIN_REQUIRED' ?
      'Community.AdminRequired' :
      'Community.RequestFailed'
  });
}

function getSuggestedKey(peerId: PeerId): LangPackKey {
  const peer = apiManagerProxy.getPeer(peerId);
  if(peer?._ === 'user' && peer.pFlags.bot) {
    return 'Community.SuggestedBot';
  }
  if(peer?._ === 'channel' && peer.pFlags.broadcast) {
    return 'Community.SuggestedChannel';
  }
  return 'Community.SuggestedGroup';
}

export function CommunityPendingRequestRow(props: {
  request: CommunityPeerRequest,
  disabled?: boolean,
  onApply: (request: CommunityPeerRequest, reject: boolean) => void
}) {
  const peerId = getPeerId(props.request.peer);
  const requestedBy = props.request.requested_by.toPeerId(false);
  const requester = apiManagerProxy.getPeer(requestedBy);
  const peer = apiManagerProxy.getPeer(peerId);
  const membersCount = getCommunityPeerParticipantsCount(peer);
  const openRequest = () => {
    if(props.disabled) {
      return;
    }

    showCommunityPrivateChat({
      peerId,
      requestedByPeerId: requester ? requestedBy : undefined,
      memberCount: membersCount,
      canOpenChat: !isCommunityRequestPrivate(props.request)
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if(!props.disabled && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.currentTarget.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      }));
    }
  };

  return (
    <Row
      clickable={openRequest}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
      on:keydown={onKeyDown}
      disabled={props.disabled}
    >
      <Row.Media
        size="abitbigger"
        class={`${sharedStyles.avatarMedia} ${styles.requestAvatarMedia}`}
      >
        <AvatarNewTsx
          class={sharedStyles.peerAvatar}
          peerId={peerId}
          size={42}
        />
        <Show when={requester}>
          <span class={sharedStyles.peerAvatarOverlay}>
            <AvatarNewTsx
              peerId={requestedBy}
              size={18}
            />
          </span>
        </Show>
      </Row.Media>
      <Row.Title
        titleRight={(
          <span class={styles.requestMetadata}>
            <Show when={membersCount !== undefined}>
              <span
                class={styles.requestMetadataPill}
                aria-label={i18n('Members', [membersCount!]).textContent}
              >
                <IconTsx
                  class={styles.requestMetadataIcon}
                  icon="group_filled"
                  aria-hidden="true"
                />
                <span>{formatNumber(membersCount!, 1)}</span>
              </span>
            </Show>
            <Show when={!props.request.pFlags.visible}>
              <span
                class={styles.requestMetadataPill}
                aria-label={i18n('Community.Hidden').textContent}
              >
                <IconTsx
                  class={styles.requestMetadataIcon}
                  icon="eye2_filled"
                  aria-hidden="true"
                />
              </span>
            </Show>
          </span>
        )}
      >
        <PeerTitleTsx peerId={peerId} />
      </Row.Title>
      <Row.Subtitle>
        <Show
          when={requester}
          fallback={i18n('Community.SuggestedBySomeone')}
        >
          <PeerTitleTsx peerId={requestedBy} />
          {' '}
          {i18n(getSuggestedKey(peerId))}
        </Show>
      </Row.Subtitle>
      <div class={styles.requestActions}>
        <Button
          class={`${styles.requestAction} btn-control-small`}
          primaryFilled
          disabled={props.disabled}
          text="Add"
          onClick={(event) => {
            event.stopPropagation();
            props.onApply(props.request, false);
          }}
        />
        <Button
          class={`${styles.requestAction} btn-control-small`}
          primaryTransparent
          disabled={props.disabled}
          text="Decline"
          onClick={(event) => {
            event.stopPropagation();
            props.onApply(props.request, true);
          }}
        />
      </div>
    </Row>
  );
}

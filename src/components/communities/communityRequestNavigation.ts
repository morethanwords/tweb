import type {CommunityPeerRequest} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import apiManagerProxy from '@lib/apiManagerProxy';

export function isCommunityRequestPrivate(
  request: CommunityPeerRequest
) {
  const peerId = getPeerId(request.peer);
  const peer = apiManagerProxy.getPeer(peerId);
  const hasPublicUsername = peer?._ === 'channel' && (
    !!peer.username ||
    !!peer.usernames?.some((username) => username.pFlags.active)
  );

  return peer?._ === 'channelForbidden' ||
    (
      peer?._ === 'channel' &&
      !request.pFlags.visible &&
      !!peer.pFlags.left &&
      !hasPublicUsername
    );
}

export function getCommunityRequestOpenPeerId(
  request: CommunityPeerRequest
) {
  const peerId = getPeerId(request.peer);
  const requestedBy = request.requested_by.toPeerId(false);
  const requester = apiManagerProxy.getPeer(requestedBy);

  return isCommunityRequestPrivate(request) && requester ?
    requestedBy :
    peerId;
}

import type {Chat, CommunityPeer} from '@layer';
import type {
  Dialog,
  MyMessage
} from '@appManagers/appMessagesManager';
import type {
  CommunityDialog
} from '@appManagers/appCommunitiesManager';
import getCommunityLinkedPeerKind, {
  CommunityLinkedPeerKind
} from '@appManagers/utils/communities/getCommunityLinkedPeerKind';
import type apiManagerProxy from '@lib/apiManagerProxy';

export type CommunityLinkedChatKind = CommunityLinkedPeerKind;

export type CommunityLinkedChat = {
  linked: CommunityPeer,
  peerId: PeerId,
  dialog?: Dialog,
  lastMessage?: MyMessage,
  muted?: boolean,
  kind: CommunityLinkedChatKind,
  order: number,
  activityDate?: number
};

type Peer = ReturnType<typeof apiManagerProxy.getPeer>;
export type CommunityLinkedChatOpenAction =
  'open' |
  'join' |
  'hidden';

export function shouldCloseCommunityForum(options: {
  communityId: ChatId,
  community?: Chat.community | Chat.communityForbidden,
  communityDialog?: CommunityDialog,
  joinedCommunities: Array<Chat.community | Chat.communityForbidden> | null,
  hadCommunityDialog: boolean
}) {
  const {community} = options;
  if(
    community?._ === 'communityForbidden' ||
    (community?._ === 'community' && community.pFlags.left)
  ) {
    return true;
  }

  if(
    options.joinedCommunities !== null &&
    !options.joinedCommunities.some((community) => {
      return community.id.toChatId() === options.communityId;
    })
  ) {
    return true;
  }

  return options.hadCommunityDialog && !options.communityDialog;
}

function hasKind<K extends CommunityLinkedChatKind>(kind: K) {
  return (
    item: CommunityLinkedChat
  ): item is CommunityLinkedChat & {kind: K} => item.kind === kind;
}

export function getCommunityLinkedChatKind(
  peer: Peer,
  linked: CommunityPeer,
  dialog?: Dialog
): CommunityLinkedChatKind {
  return getCommunityLinkedPeerKind(peer, linked, dialog);
}

export function getCommunityLinkedChatOpenAction(options: {
  kind: CommunityLinkedChatKind,
  peerType?: Peer['_'],
  visible?: boolean
}): CommunityLinkedChatOpenAction {
  if(
    options.kind === 'hidden' ||
    options.kind === 'excluded' ||
    (
      options.kind === 'requestable' &&
      options.visible === false
    )
  ) {
    return 'hidden';
  }
  if(
    options.kind === 'joined' ||
    options.kind === 'viewable' ||
    options.peerType === 'user'
  ) {
    return 'open';
  }

  if(options.kind === 'requestable') {
    return 'join';
  }

  return 'hidden';
}

export function getCommunityChatSections(items: CommunityLinkedChat[]) {
  const byActivity = (a: CommunityLinkedChat, b: CommunityLinkedChat) => {
    return (b.activityDate || 0) - (a.activityDate || 0) ||
      a.order - b.order;
  };

  return {
    joined: items.filter(hasKind('joined')).sort(byActivity),
    viewable: items.filter(hasKind('viewable')).sort(byActivity),
    requestable: items.filter(hasKind('requestable')).sort(byActivity),
    hidden: items.filter(hasKind('hidden')).sort(byActivity)
  };
}

import type {LangPackKey} from '@lib/langPack';
import type {Chat} from '@layer';

export type CommunityServicePeerKind = 'bot' | 'group' | 'channel';
export type CommunityServiceAuthorKind = 'self' | 'user' | 'unknown';

export function getCommunityServiceTitle(community?: Chat) {
  if(
    community?._ !== 'community' &&
    community?._ !== 'communityForbidden'
  ) {
    return;
  }

  return community.title || undefined;
}

export default function getCommunityServiceMessageKey({
  isAdded,
  peerKind,
  authorKind
}: {
  isAdded: boolean,
  peerKind: CommunityServicePeerKind,
  authorKind: CommunityServiceAuthorKind
}): LangPackKey {
  if(peerKind === 'bot') {
    return isAdded ?
      'Chat.Service.CommunityAdded.Bot' :
      'Chat.Service.CommunityRemoved.Bot';
  }

  if(peerKind === 'channel') {
    return isAdded ?
      'Chat.Service.CommunityAdded.Channel' :
      'Chat.Service.CommunityRemoved.Channel';
  }

  if(isAdded) {
    if(authorKind === 'self') {
      return 'Chat.Service.CommunityAdded.Group.You';
    }

    return authorKind === 'user' ?
      'Chat.Service.CommunityAdded.Group.By' :
      'Chat.Service.CommunityAdded.Group.Unknown';
  }

  return authorKind === 'self' ?
    'Chat.Service.CommunityRemoved.Group.You' :
    'Chat.Service.CommunityRemoved.Group.By';
}

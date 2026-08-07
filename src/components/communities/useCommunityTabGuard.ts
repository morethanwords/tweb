import {createEffect} from 'solid-js';
import type {Chat} from '@layer';
import {
  useCommunity,
  useJoinedCommunities
} from '@stores/communities';

export function shouldCloseCommunityTab(options: {
  communityId: ChatId,
  community?: Chat.community | Chat.communityForbidden,
  joinedCommunities: Array<Chat.community | Chat.communityForbidden> | null
}) {
  const {community} = options;
  if(
    community?._ === 'communityForbidden' ||
    (community?._ === 'community' && community.pFlags.left)
  ) {
    return true;
  }

  return options.joinedCommunities !== null &&
    !options.joinedCommunities.some((item) => {
      return item.id.toChatId() === options.communityId;
    });
}

export default function useCommunityTabGuard(
  tab: {close: () => unknown},
  communityId?: ChatId
) {
  if(!communityId) {
    return;
  }

  const community = useCommunity(() => communityId);
  const joinedCommunities = useJoinedCommunities();
  let closing = false;
  createEffect(() => {
    if(
      closing ||
      !shouldCloseCommunityTab({
        communityId,
        community: community(),
        joinedCommunities: joinedCommunities()
      })
    ) {
      return;
    }

    closing = true;
    queueMicrotask(() => tab.close());
  });
}

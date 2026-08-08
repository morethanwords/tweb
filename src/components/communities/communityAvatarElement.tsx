import {render} from 'solid-js/web';
import CommunityAvatar from '@components/communities/communityAvatar';
import {useCommunity} from '@stores/communities';

/**
 * A Community avatar for the imperative parts of the app (chat-list rows, popups): the
 * same decorated avatar the Solid components render, in a plain element. It keeps itself
 * up to date with the Community, so call `dispose` when the host goes away.
 */
export default function createCommunityAvatarElement(
  communityId: ChatId,
  size: number
) {
  const mount = document.createElement('div');
  const dispose = render(() => {
    const community = useCommunity(() => communityId);
    return (
      <CommunityAvatar
        community={community()}
        title={community()?.title}
        size={size}
      />
    );
  }, mount);

  return {
    dispose,
    element: mount.firstElementChild as HTMLElement
  };
}

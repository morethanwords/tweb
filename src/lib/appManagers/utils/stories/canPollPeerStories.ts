import type {Chat, User} from '@layer';

/** how long what the server said a peer has in stories stands before it is asked again, as in the other apps
 * (iOS `AccountViewTracker.refreshStoryStatsForPeerIds`, Android `UserListPoller`) */
export const PEER_STORIES_POLL_INTERVAL = 60 * 60e3;

/**
 * Whether what a peer on screen has in stories is worth asking the server again (`stories.getPeerMaxIDs`):
 * the feed brings the stories of contacts and of the chats one is in, so it is everyone else who can have
 * them - chosen as Android's `UserListPoller` and Web A's `usePeerStoriesPolling` choose them: a user who is
 * no contact, no bot and not oneself, with a status to show, and a channel or supergroup one is not in.
 * A `min` peer is left out: it may not be addressable on its own, and one bad peer fails the whole request.
 */
export default function canPollPeerStories(peer: User | Chat) {
  if(peer?._ === 'user') {
    const {pFlags, status} = peer;
    return !pFlags.self &&
      !pFlags.contact &&
      !pFlags.bot &&
      !pFlags.support &&
      !pFlags.deleted &&
      !pFlags.min &&
      !!status &&
      status._ !== 'userStatusEmpty';
  }

  return peer?._ === 'channel' &&
    !!peer.pFlags.left &&
    !peer.pFlags.min &&
    !peer.pFlags.monoforum;
}

import {ForumTab} from '@components/forumTab/forumTab';

export default function findForumTabByPeerId(
  history: readonly unknown[],
  peerId: PeerId
) {
  return history.find((tab) => {
    return tab instanceof ForumTab && tab.peerId === peerId;
  }) as ForumTab | undefined;
}

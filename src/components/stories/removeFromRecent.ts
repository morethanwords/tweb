import {toastNew} from '@components/toast';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import rootScope from '@lib/rootScope';

/**
 * Takes a top correspondent who is not a contact out of the stories feed — the one way to get rid of
 * their stories, since the server does not archive them
 */
export default async function removeStoriesFromRecent(peerId: PeerId) {
  await rootScope.managers.appStoriesManager.removeTopPeerFromStories(peerId);
  toastNew({
    langPackKey: 'StoriesRemovedFromRecent',
    langPackArguments: [await wrapPeerTitle({peerId})]
  });
}

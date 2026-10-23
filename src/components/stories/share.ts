import {StoryItem} from '@layer';
import rootScope from '@lib/rootScope';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export function makeStoryLink(username: string, storyId: number) {
  return `https://t.me/${username}/s/${storyId}`;
}

/**
 * A story shared the way messages are forwarded, as iOS and Android share one: to as many chats as
 * are picked, after a comment if one is written, with its link to copy while nobody is picked.
 */
export async function handleShareStory(options: {
  story: StoryItem,
  peerId: PeerId,
  onClose?: () => void,
  /** says where the story went, in place of the toast */
  onSent?: (text: HTMLElement) => void
}) {
  const managers = bindManagersToSession(rootScope.managers);
  const {story, peerId} = options;
  // * only a public story of a peer with a username has a link anyone can open
  const username = (story as StoryItem.storyItem).pFlags?.public && await managers.appPeersManager.getPeerUsername(peerId);
  hotReloadGuard.showForwardPopup(undefined, undefined, undefined, options.onClose, {
    peerId,
    id: story.id,
    link: username ? makeStoryLink(username, story.id) : undefined,
    onSent: options.onSent
  });
}

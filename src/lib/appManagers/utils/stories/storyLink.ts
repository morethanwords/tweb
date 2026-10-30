import type {Chat, StoryItem, User} from '@layer';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';

export function makeStoryLink(username: string, storyId: number) {
  return `https://t.me/${username}/s/${storyId}`;
}

/**
 * Whether a story has a link anyone can open: a public one has it by its peer's username, or, for a peer
 * without one, from the server where it exports such links (`stories_export_nopublic_link`; see
 * `appStoriesManager.getStoryLink`)
 */
export function canCopyStoryLink(story: StoryItem, peer: User | Chat, appConfig: MTAppConfig) {
  return story?._ === 'storyItem' &&
    !!story.pFlags.public &&
    (!!getPeerActiveUsernames(peer)[0] || !!appConfig?.stories_export_nopublic_link);
}

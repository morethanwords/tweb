import {StoryItem} from '@layer';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import type {ReadingManagers} from '@lib/managers';
import apiManagerProxy from '@lib/apiManagerProxy';
import {canCopyStoryLink} from '@appManagers/utils/stories/storyLink';
import {copyPendingTextToClipboard} from '@helpers/clipboard';
import {toastNew} from '@components/toast';
import {appState} from '@stores/appState';

/** Whether a story has a link to copy (`canCopyStoryLink`), by what the tab knows of its peer and the app config */
export function hasStoryLink(story: StoryItem, peerId: PeerId) {
  return canCopyStoryLink(story, apiManagerProxy.getPeer(peerId), appState.appConfig);
}

/**
 * Copies a story's link (`appStoriesManager.getStoryLink`: the username's at once, or the server's) and says
 * so; a link the server would not give, or a write the browser refused, is said to be an error. To be called
 * within the click, where the write starts (`copyPendingTextToClipboard`). Resolves to whether it was copied.
 */
export async function copyStoryLink(managers: ReadingManagers, peerId: PeerId, storyId: number) {
  let linkError: ApiError;
  const link = Promise.resolve(managers.appStoriesManager.getStoryLink(peerId, storyId)).catch((err: ApiError) => {
    throw linkError = err;
  });

  try {
    await copyPendingTextToClipboard(link);
  } catch(err) {
    // * an account left meanwhile says nothing
    if(linkError?.type !== 'MIDDLEWARE') {
      toastNew({langPackKey: 'Error.AnError'});
    }

    return false;
  }

  toastNew({langPackKey: 'LinkCopied'});
  return true;
}

/**
 * A story shared the way messages are forwarded, as iOS and Android share one: to as many chats as
 * are picked, after a comment if one is written, with its link to copy while nobody is picked.
 */
export function handleShareStory(options: {
  story: StoryItem,
  peerId: PeerId,
  onClose?: () => void,
  /** says where the story went, in place of the toast */
  onSent?: (text: HTMLElement) => void
}) {
  const {story, peerId} = options;
  hotReloadGuard.showForwardPopup(undefined, undefined, undefined, options.onClose, {
    peerId,
    id: story.id,
    canCopyLink: hasStoryLink(story, peerId),
    onSent: options.onSent
  });
}

import {StoryItem, MediaArea} from '../../../../layer';

export default function getStoryRepostInfo(story: StoryItem.storyItem) {
  const fwdFrom = story.fwd_from;
  let mediaAreaChannelPost: MediaArea.mediaAreaChannelPost;
  if(!fwdFrom) {
    mediaAreaChannelPost = (story.media_areas || []).find((mediaArea) => mediaArea._ === 'mediaAreaChannelPost') as MediaArea.mediaAreaChannelPost;
    if(!mediaAreaChannelPost) {
      return;
    }
  }

  return {fwdFrom, mediaAreaChannelPost};
}

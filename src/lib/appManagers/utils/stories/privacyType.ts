import {StoryItem} from '../../../../layer';

export type StoryPrivacyType = 'public' | 'close' | 'contacts' | 'selected';

export default function getStoryPrivacyType(story: StoryItem.storyItem) {
  let privacyType: StoryPrivacyType;
  if(story.pFlags.close_friends) {
    privacyType = 'close';
  } else if(story.pFlags.public) {
    privacyType = 'public';
  } else if(story.pFlags.selected_contacts) {
    privacyType = 'selected';
  } else if(story.pFlags.contacts) {
    privacyType = 'contacts';
  } else if(story.privacy) {
    if(story.privacy.some((privacyRule) => privacyRule._ === 'privacyValueAllowContacts')) {
      privacyType = 'contacts';
    } else {
      privacyType = 'selected';
    }
  }

  return privacyType;
}

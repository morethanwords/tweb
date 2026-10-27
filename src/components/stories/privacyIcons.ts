import type {StoryPrivacyType} from '@appManagers/utils/stories/privacyType';
import type {LangPackKey} from '@lib/langPack';

/** The glyph each audience of a story is shown with: in the viewer's header, on a profile's tiles */
export const STORY_PRIVACY_ICONS: {[key in StoryPrivacyType]: Icon} = {
  close: 'star_filled',
  contacts: 'newprivate_filled',
  public: 'newchannel_filled',
  selected: 'newgroup_filled'
};

/** What the audiences a tile marks are called, for whoever cannot see the glyph */
export const STORY_PRIVACY_TITLES: {[key in Exclude<StoryPrivacyType, 'public'>]: LangPackKey} = {
  close: 'StoryPrivacyOptionCloseFriends',
  contacts: 'Contacts',
  selected: 'StoryPrivacyOptionSelectedContacts'
};

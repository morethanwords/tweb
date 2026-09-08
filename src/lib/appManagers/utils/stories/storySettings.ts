import {StoryPrivacyType} from '@appManagers/utils/stories/privacyType';

export type StorySettings = {
  /** Absent for personal stories. Chat stories have no personal audience lists. */
  peerType?: 'channel' | 'group',
  privacyType: StoryPrivacyType,
  /** Separate lists preserve each audience's selection when switching between them. */
  everyoneExcept: PeerId[],
  contactsExcept: PeerId[],
  closeFriends: PeerId[],
  selectedContacts: PeerId[],
  /** Account-wide story blocklist, staged along with the draft settings. */
  hideFrom: PeerId[],
  allowScreenshots: boolean,
  keepOnPage: boolean
};

export type StorySettingsSaveResult = {
  saved: boolean,
  /** Confirmed writes, also returned when a later step fails. */
  applied: Partial<StorySettings>
};

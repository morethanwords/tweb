import {
  canSetMainProfileTabForMediaType,
  getMediaTypeForProfileTab,
  getProfileTabForMediaType,
  orderMediaTabsByMain
} from '@components/sharedMediaProfileTab';

describe('shared media main profile tab', () => {
  test.each([
    ['stories', 'profileTabPosts'],
    ['gifts', 'profileTabGifts'],
    ['media', 'profileTabMedia'],
    ['files', 'profileTabFiles'],
    ['music', 'profileTabMusic'],
    ['voice', 'profileTabVoice'],
    ['links', 'profileTabLinks'],
    ['gifs', 'profileTabGifs']
  ] as const)('maps %s to the API profile tab', (mediaType, profileTabType) => {
    const profileTab = getProfileTabForMediaType(mediaType);
    expect(profileTab).toEqual({_: profileTabType});
    expect(getMediaTypeForProfileTab(profileTab)).toBe(mediaType);
  });

  test('excludes tabs without an API profile tab', () => {
    expect(getProfileTabForMediaType('members')).toBeUndefined();
    expect(getProfileTabForMediaType('saved')).toBeUndefined();
  });

  test('allows only posts and gifts on the own user profile', () => {
    const options = {isSelf: true, isSavedMessages: false, isEditableBroadcast: false};
    expect(canSetMainProfileTabForMediaType('stories', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('gifts', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('media', options)).toBe(false);
  });

  test('allows every mapped tab in Saved Messages', () => {
    const options = {isSelf: true, isSavedMessages: true, isEditableBroadcast: false};
    expect(canSetMainProfileTabForMediaType('media', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('files', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('savedDialogs', options)).toBe(false);
  });

  test('allows every mapped tab on an editable broadcast channel', () => {
    const options = {isSelf: false, isSavedMessages: false, isEditableBroadcast: true};
    expect(canSetMainProfileTabForMediaType('media', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('files', options)).toBe(true);
    expect(canSetMainProfileTabForMediaType('members', options)).toBe(false);
  });

  test('moves an available main tab to the front', () => {
    const tabs = [
      {type: 'stories', visible: true},
      {type: 'media', visible: true},
      {type: 'files', visible: true}
    ];
    expect(orderMediaTabsByMain(tabs, 'files', (tab) => tab.visible).map((tab) => tab.type))
    .toEqual(['files', 'stories', 'media']);
  });

  test('keeps the normal order when the configured tab is unavailable', () => {
    const tabs = [
      {type: 'stories', visible: true},
      {type: 'media', visible: true},
      {type: 'files', visible: false}
    ];
    expect(orderMediaTabsByMain(tabs, 'files', (tab) => tab.visible).map((tab) => tab.type))
    .toEqual(['stories', 'media', 'files']);
  });
});

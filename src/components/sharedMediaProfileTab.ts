import {ProfileTab} from '@layer';

export type ProfileTabMediaType = 'stories' | 'gifts' | 'media' | 'files' |
  'music' | 'voice' | 'links' | 'gifs';

const PROFILE_TAB_BY_MEDIA_TYPE: Record<ProfileTabMediaType, ProfileTab> = {
  stories: {_: 'profileTabPosts'},
  gifts: {_: 'profileTabGifts'},
  media: {_: 'profileTabMedia'},
  files: {_: 'profileTabFiles'},
  music: {_: 'profileTabMusic'},
  voice: {_: 'profileTabVoice'},
  links: {_: 'profileTabLinks'},
  gifs: {_: 'profileTabGifs'}
};

const MEDIA_TYPE_BY_PROFILE_TAB: Record<ProfileTab['_'], ProfileTabMediaType> = {
  profileTabPosts: 'stories',
  profileTabGifts: 'gifts',
  profileTabMedia: 'media',
  profileTabFiles: 'files',
  profileTabMusic: 'music',
  profileTabVoice: 'voice',
  profileTabLinks: 'links',
  profileTabGifs: 'gifs'
};

export function getProfileTabForMediaType(type: string): ProfileTab | undefined {
  return PROFILE_TAB_BY_MEDIA_TYPE[type as ProfileTabMediaType];
}

export function getMediaTypeForProfileTab(tab?: ProfileTab): ProfileTabMediaType | undefined {
  return tab ? MEDIA_TYPE_BY_PROFILE_TAB[tab._] : undefined;
}

export function canSetMainProfileTabForMediaType(type: string, options: {
  isSelf: boolean,
  isSavedMessages: boolean,
  isEditableBroadcast: boolean
}) {
  if(!getProfileTabForMediaType(type)) {
    return false;
  }

  return options.isEditableBroadcast ||
    options.isSavedMessages ||
    (options.isSelf && (type === 'stories' || type === 'gifts'));
}

export function orderMediaTabsByMain<T extends {type: string}>(
  tabs: readonly T[],
  mainType?: ProfileTabMediaType,
  isVisible: (tab: T) => boolean = () => true
): T[] {
  const ordered = [...tabs];
  const mainIndex = ordered.findIndex((tab) => tab.type === mainType && isVisible(tab));
  if(mainIndex <= 0) {
    return ordered;
  }

  const [mainTab] = ordered.splice(mainIndex, 1);
  ordered.unshift(mainTab);
  return ordered;
}

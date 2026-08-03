import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';

export type SearchSuperMediaInputFilter = Extract<
  MyInputMessagesFilter,
  'inputMessagesFilterPhotos' | 'inputMessagesFilterPhotoVideo' | 'inputMessagesFilterVideo'
>;

export type SharedMediaFilters = {
  photos: boolean,
  videos: boolean
};

export function getSharedMediaInputFilter(filters: SharedMediaFilters): SearchSuperMediaInputFilter {
  return filters.photos && filters.videos ?
    'inputMessagesFilterPhotoVideo' :
    filters.photos ? 'inputMessagesFilterPhotos' : 'inputMessagesFilterVideo';
}

export function getSharedMediaFilters(inputFilter: SearchSuperMediaInputFilter): SharedMediaFilters {
  return {
    photos: inputFilter !== 'inputMessagesFilterVideo',
    videos: inputFilter !== 'inputMessagesFilterPhotos'
  };
}

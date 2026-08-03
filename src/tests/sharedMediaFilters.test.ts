import {getSharedMediaFilters, getSharedMediaInputFilter} from '@components/sharedMediaFilters';

describe('shared media filters', () => {
  test.each([
    [{photos: true, videos: true}, 'inputMessagesFilterPhotoVideo'],
    [{photos: true, videos: false}, 'inputMessagesFilterPhotos'],
    [{photos: false, videos: true}, 'inputMessagesFilterVideo']
  ] as const)('maps selected media types to the search filter', (filters, inputFilter) => {
    expect(getSharedMediaInputFilter(filters)).toBe(inputFilter);
  });

  test.each([
    ['inputMessagesFilterPhotoVideo', {photos: true, videos: true}],
    ['inputMessagesFilterPhotos', {photos: true, videos: false}],
    ['inputMessagesFilterVideo', {photos: false, videos: true}]
  ] as const)('restores selected media types from the committed search filter', (inputFilter, filters) => {
    expect(getSharedMediaFilters(inputFilter)).toEqual(filters);
  });
});

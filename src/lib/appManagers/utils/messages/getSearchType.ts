import type {RequestHistoryOptions} from '@appManagers/appMessagesManager';

export default function getSearchType(options: RequestHistoryOptions): RequestHistoryOptions['searchType'] {
  // return 'uncached';

  const isSearch = !!(options.inputFilter || options.savedReaction || options.query || options.isPublicHashtag);
  if(!isSearch) {
    return;
  }

  if(options.isCacheableSearch) {
    return 'cached';
  }

  // * a chat's media between some dates is not its media list, which the cached storage of the filter is
  return options.query || !options.peerId || options.fromPeerId || options.minDate || options.maxDate ?
    'uncached' :
    'cached';
}

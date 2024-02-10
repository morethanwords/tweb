import type {RequestHistoryOptions} from '../../appMessagesManager';

export default function getSearchType(options: RequestHistoryOptions): RequestHistoryOptions['searchType'] {
  // return 'uncached';

  const isSearch = !!(options.inputFilter || options.savedReaction || options.query);
  if(!isSearch) {
    return;
  }

  return options.query || !options.peerId || options.fromPeerId ? 'uncached' : 'cached';
}

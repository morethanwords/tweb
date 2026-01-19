import type {HistoryStorage, HistoryStorageKey} from '@appManagers/appMessagesManager';
import SlicedArray, {SliceEnd} from '@helpers/slicedArray';
import getHistoryStorageKey from '@appManagers/utils/messages/getHistoryStorageKey';

export default function createHistoryStorage(options: Parameters<typeof getHistoryStorageKey>[0] | HistoryStorageKey) {
  const type = typeof(options) === 'string' ? options.split('_')[0] as HistoryStorage['type'] : options.type;
  const key = typeof(options) === 'string' ? options : getHistoryStorageKey(options);

  const historyStorage: HistoryStorage = {
    history: new SlicedArray(),
    type,
    key,
    count: null,
    _maxId: undefined,
    get maxId() {
      const maxId = historyStorage._maxId;
      if(maxId) {
        return maxId;
      }

      const first = historyStorage.history.first;
      if(first.isEnd(SliceEnd.Bottom)) {
        return first[0];
      }
    }
  };

  return historyStorage;
}

export function createHistoryStorageSearchSlicedArray() {
  const slicedArray: HistoryStorage['searchHistory'] = new SlicedArray();
  slicedArray.insertSlice = (slice) => {
    slicedArray.first.push(...slice);
    return slicedArray.first;
  };

  slicedArray.findOffsetInSlice = (offsetId, slice) => {
    const index = slice.indexOf(offsetId);
    if(index !== -1) {
      return {
        slice,
        offset: index + 1
      };
    }
  };

  return slicedArray;
}

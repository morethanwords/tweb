import insertInDescendSortedArray from '../../../../helpers/array/insertInDescendSortedArray';
import {StoryItem} from '../../../../layer';
import StoriesCacheType from './cacheType';

export default function insertStory(array: any[], storyItem: StoryItem, onlyId: boolean, cacheType: StoriesCacheType, pinnedToTop?: Map<number, number>) {
  const valueToInsert = onlyId ? storyItem.id : storyItem;
  if(cacheType === StoriesCacheType.Pinned) {
    return insertInDescendSortedArray(
      array,
      valueToInsert,
      (_storyItem) => {
        const storyId = onlyId ? _storyItem as number : (_storyItem as StoryItem).id;
        const pinnedIndex = onlyId ? pinnedToTop.get(storyId) : (_storyItem as StoryItem.storyItem).pinnedIndex;
        return pinnedIndex !== undefined ? 0xFFFFFFFF - pinnedIndex : storyId;
      }
    );
  } else if(cacheType === StoriesCacheType.Archive) {
    return insertInDescendSortedArray(
      array,
      valueToInsert,
      onlyId ? (storyId) => storyId as number : (storyItem) => (storyItem as StoryItem).id
    );
  } else {
    return insertInDescendSortedArray(
      array,
      valueToInsert,
      onlyId ? (storyId) => 0xFFFFFFFF - (storyId as number) : (storyItem) => 0xFFFFFFFF - (storyItem as StoryItem).id
    );
  }
}

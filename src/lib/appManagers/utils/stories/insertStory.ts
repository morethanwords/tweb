import insertInDescendSortedArray from '../../../../helpers/array/insertInDescendSortedArray';
import {StoryItem} from '../../../../layer';
import StoriesCacheType from './cacheType';

export default function insertStory<T extends StoryItem | number>(array: T[], storyItem: T, cacheType: StoriesCacheType) {
  if(cacheType !== StoriesCacheType.Stories) {
    // @ts-ignore
    return insertInDescendSortedArray(
      array,
      storyItem,
      typeof(storyItem) !== 'number' ? 'id' : undefined
    );
  } else {
    return insertInDescendSortedArray(
      array,
      storyItem,
      typeof(storyItem) !== 'number' ? (storyItem) => 0xFFFFFFFF - (storyItem as StoryItem).id : (storyId) => 0xFFFFFFFF - (storyId as number)
    );
  }
}

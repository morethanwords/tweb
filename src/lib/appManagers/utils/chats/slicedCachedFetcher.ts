import {insertInSortedSlicedArray} from '../../../../helpers/array/insertInSortedSlicedArray';
import lastItem from '../../../../helpers/array/lastItem';
import compareLong from '../../../../helpers/long/compareLong';


type Id = string | number;

type FetchItemsArgs = {
  limit: number;
  offsetId?: Id;
};

type GetItemsArgs<T> = FetchItemsArgs & {
  fetchItems: (args: FetchItemsArgs) => Promise<T[]>;
  getId: (item: T) => Id;
  backLimit?: number;
};

/**
 * Fetches in only one direction if given an offset (and if no cache is found). If no offset is given, it will always fetch first
 */
export class SlicedCachedFetcher<T> {
  private isEnd = false;
  private cachedSlices: string[][] = [];
  private cachedItemsMap = new Map<string, T>();

  public async getItems({limit, offsetId, fetchItems, getId, backLimit = 0}: GetItemsArgs<T>) {
    let result: Array<Id> = [];
    let remainingLimit = limit;
    let tookFromLastSlice = false;

    if(offsetId) for(const slice of this.cachedSlices) {
      const idx = slice.indexOf(String(offsetId));
      if(idx === -1) continue;

      tookFromLastSlice = slice === lastItem(this.cachedSlices);
      const startIdx = Math.max(0, idx - backLimit);
      result = slice.slice(startIdx, idx + limit + 1); // keeps the item with offsetId to make sure the slices merge if this is the last item in the slice
      remainingLimit = Math.max(0, limit + 1 - result.length - (idx - startIdx));
    }

    const dontFetch = tookFromLastSlice && this.isEnd;

    if(remainingLimit && !dontFetch) {
      const lastCachedItem = lastItem(result);
      // adding + 1 to include the last cached item for the slices to merge
      const cachedOffsetId = lastCachedItem ? (BigInt(lastItem(result)) + BigInt(1)).toString() : undefined;

      const fetchLimit = remainingLimit + (lastCachedItem ? 1 : 0);

      const items = await fetchItems({
        limit: fetchLimit,
        offsetId: cachedOffsetId || offsetId
      });

      if(items.length < fetchLimit) this.isEnd = true;

      insertInSortedSlicedArray(
        items.map(item => String(getId(item))),
        this.cachedSlices,
        (a, b) => -1 * compareLong(a, b)
      );

      for(const item of items) {
        this.cachedItemsMap.set(String(getId(item)), item);
      }

      const newlyFetchedItems = new Set(items.map(item => String(getId(item))));

      result = [
        ...result.filter(id => !newlyFetchedItems.has(String(id))),
        ...items.map(getId)
      ];
    }

    const items = result
    // remove the item with offsetId, was used only for making sure slices overlap
    .filter(id => String(id) !== String(offsetId))
    .slice(0, limit)
    .map(id => this.cachedItemsMap.get(String(id)));

    return {items, isEnd: this.isEnd};
  }
}

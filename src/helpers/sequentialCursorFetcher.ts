export type SequentialCursorFetcherResult<T> = {
  cursor: T;
  count: number;
  totalCount?: number;
};

export class SequentialCursorFetcher<T> {
  private fetchedItemsCount = 0;
  private neededCount = 0;

  private cursor: T;

  private isFetching = false;

  private needToFetchMore = false;

  constructor(private fetcher: (cursor: T | undefined) => Promise<SequentialCursorFetcherResult<T>>) {}

  public fetchUntil(neededCount: number, currentCount?: number) {
    this.neededCount = Math.max(this.neededCount, neededCount);
    if(typeof currentCount !== 'undefined') this.fetchedItemsCount = currentCount;

    this.triggerFetching();
  }

  public tryToFetchMore() {
    this.needToFetchMore = true;
    this.triggerFetching();
  }

  public setFetchedItemsCount(count: number) {
    this.fetchedItemsCount = count;
  }

  public setNeededCount(count: number) {
    this.neededCount = count;
  }

  public setCursor(cursor: T) {
    this.cursor = cursor;
  }

  public reset() {
    this.fetchedItemsCount = 0;
    this.neededCount = 0;
    this.isFetching = false;
    this.cursor = undefined;
  }

  private triggerFetching() {
    if(this.isFetching) return;

    this.isFetching = true;
    this.fetchUntilNeededCount().catch(() => {}).finally(() => {
      this.isFetching = false;
    });
  }

  private async fetchUntilNeededCount() {
    while(this.fetchedItemsCount < this.neededCount || this.needToFetchMore) {
      const {cursor, count, totalCount} = await this.fetcher(this.cursor);

      this.needToFetchMore = false;

      if(count === 0) break;
      this.cursor = cursor;

      if(totalCount !== undefined)
        this.fetchedItemsCount = totalCount;
      else
        this.fetchedItemsCount += count;
    }
  }
}

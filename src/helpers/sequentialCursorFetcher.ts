export type SequentialCursorFetcherResult<T> = {
  cursor: T;
  count: number;
};

export class SequentialCursorFetcher<T> {
  private fetchedItemsCount = 0;
  private neededCount = 0;

  private cursor: T;

  private isFetching = false;

  constructor(private fetcher: (cursor: T | undefined) => Promise<SequentialCursorFetcherResult<T>>) {}

  public fetchUntil(neededCount: number) {
    this.neededCount = Math.max(this.neededCount, neededCount);

    if(this.isFetching) return;

    this.isFetching = true;
    this.fetchUntilNeededCount().catch(() => {}).finally(() => {
      this.isFetching = false;
    });
  }

  public reset() {
    this.fetchedItemsCount = 0;
    this.neededCount = 0;
    this.isFetching = false;
    this.cursor = undefined;
  }

  private async fetchUntilNeededCount() {
    while(this.fetchedItemsCount < this.neededCount) {
      const {cursor, count} = await this.fetcher(this.cursor);
      if(count === 0) break;
      this.cursor = cursor;
      this.fetchedItemsCount += count;
    }
  }
}

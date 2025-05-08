export class SequentialCursorFetcher<T> {
  private fetchedItemsCount = 0;
  private neededCount = 0;

  private cursor: T;

  private isFetching = false;

  constructor(private fetcher: (cursor: T | undefined) => Promise<{cursor: T, count: number}>) {}

  public fetchUntil(neededCount: number) {
    this.neededCount = Math.max(this.neededCount, neededCount);

    if(this.isFetching) return;

    this.isFetching = true;
    this.fetchUntilNeededCount().finally(() => {
      this.isFetching = false;
    });
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

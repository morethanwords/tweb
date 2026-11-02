/**
 * The intervals tabs keep in the worker (apiManagerProxy.setInterval): a page's timers are throttled in a
 * background tab, the worker's are not. Each one ticks for the tab that set it, and goes with that tab - the
 * worker outlives a tab that is closed or reloaded, and one left running would tick for good.
 */
export default class TabIntervals {
  private bySource = new Map<MessageEventSource, Set<number>>();

  constructor(private tick: (intervalId: number, source: MessageEventSource) => void) {}

  public set(timeout: number, source: MessageEventSource) {
    const intervalId = setInterval(() => {
      this.tick(intervalId, source);
    }, timeout) as any as number;

    let intervals = this.bySource.get(source);
    if(!intervals) {
      this.bySource.set(source, intervals = new Set());
    }

    intervals.add(intervalId);
    return intervalId;
  }

  public clear(intervalId: number, source: MessageEventSource) {
    clearInterval(intervalId);

    const intervals = this.bySource.get(source);
    if(intervals?.delete(intervalId) && !intervals.size) {
      this.bySource.delete(source);
    }
  }

  public releaseSource(source: MessageEventSource) {
    const intervals = this.bySource.get(source);
    if(!intervals) {
      return;
    }

    this.bySource.delete(source);
    intervals.forEach((intervalId) => clearInterval(intervalId));
  }
}

import type Scrollable from '@components/scrollable';
import safeAssign from '@helpers/object/safeAssign';

/**
 * Re-checks a scrollable's load triggers after a load, for as long as the loads
 * keep producing something.
 *
 * `Scrollable.checkForTriggers` fires `onScrolledBottom` whenever the container
 * sits within `onScrollOffset` of its end — and a list that does not overflow is
 * ALWAYS at its end (`scrollSize === clientSize`, `scrollPosition === 0`), so the
 * trigger fires every single time it is called. That is deliberate: it is what
 * fills a list whose first page is shorter than the viewport, and half a dozen
 * callers poke `checkForTriggers()` by hand for exactly that reason.
 *
 * The flip side is that a loader which re-arms the check from its own completion
 * handler spins forever the moment it stops rendering anything. The profile
 * sidebar did exactly that — ~9000 `AppSearchSuper.load` calls a second with
 * nobody touching the page — because its `savedDialogs` tab never marks itself
 * loaded, so nothing else could ever end the chain.
 *
 * So the re-arm is conditional: after the first check, it is scheduled only while
 * the caller's `getProgress` keeps going UP. A load that produced nothing would
 * produce nothing again, which makes it the end of the chain; real scrolls and
 * resizes call `checkForTriggers` directly and are untouched.
 *
 * `getProgress` has to be monotonic — a count of what has been loaded or shown,
 * reset through `reset()` and never otherwise going backwards. That is the whole
 * reason this terminates, and it is why it must not be a *measurement*: an
 * element's height reads 0 while its container is hidden and N once it is shown,
 * which is not progress in either direction but differs from the last reading
 * both ways round, and hands the loop straight back.
 *
 * A loader that KNOWS when it has reached the end does not need any of this — see
 * `ScrollableLoader`, which drops `onScrolledBottom` outright. This is for lists
 * whose end is not observable from the outside.
 */
export default class ScrollableRefiller<Key extends string = string> {
  private scrollable: Pick<Scrollable, 'checkForTriggers'>;
  private getProgress: (key: Key) => number;

  private progress: Map<Key, number> = new Map();
  private scheduled: Set<Key> = new Set();

  constructor(options: {
    scrollable: ScrollableRefiller<Key>['scrollable'],
    getProgress: ScrollableRefiller<Key>['getProgress']
  }) {
    safeAssign(this, options);
  }

  /**
   * Call once a load for `key` has finished. `middleware` cancels the check when
   * whatever loaded is gone by the time it runs.
   */
  public schedule(key: Key, middleware?: () => boolean) {
    if(this.scheduled.has(key)) { // several loads finishing in one tick are one check
      return;
    }

    this.scheduled.add(key);
    setTimeout(() => {
      this.scheduled.delete(key);
      if(middleware && !middleware()) {
        return;
      }

      // * the first check after a reset always goes through - that one is "we
      // * have just loaded a page, is the viewport full yet", which is the
      // * question the chain exists to ask
      const progress = this.getProgress(key);
      const last = this.progress.get(key);
      if(last !== undefined && progress <= last) { // nothing new to show, another load would find nothing either
        return;
      }

      this.progress.set(key, progress);
      this.scrollable.checkForTriggers();
    }, 0);
  }

  public reset(key?: Key) {
    if(key === undefined) {
      this.progress.clear();
      this.scheduled.clear();
      return;
    }

    this.progress.delete(key);
    this.scheduled.delete(key);
  }
}

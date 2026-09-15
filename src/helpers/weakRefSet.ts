/*
 * A set that points at its members without owning them.
 *
 * The shape behind three memory fixes in this codebase: a long-lived registry (a shared
 * subscription, a lookup map) must be able to reach objects it does not keep alive, because the
 * owner that should have unregistered them cannot be relied on to do it - a queue whose popup was
 * dropped, a scrollable whose tab was replaced, an avatar whose row was discarded. Holding them
 * strongly turns the registry into the retainer of every DOM subtree hanging off them.
 *
 * Liveness follows whatever the app already reasons about (usually the element), and a member that
 * has been collected is dropped the next time the set is walked - so nothing has to be told.
 */
export default class WeakRefSet<T extends object> extends Set<WeakRef<T>> {
  /** Register `value` and return the ref to pass back to `delete` when the owner does clean up. */
  public track(value: T) {
    const ref = new WeakRef(value);
    this.add(ref);
    return ref;
  }

  /** Call back for every member still alive, forgetting the ones that are not. */
  public forEachLive(callback: (value: T) => void) {
    for(const ref of this) {
      const value = ref.deref();
      if(!value) {
        this.delete(ref);
        continue;
      }

      callback(value);
    }
  }
}

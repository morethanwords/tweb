/**
 * The operations of a key, one after another: one starts once every one queued before it for its key has settled -
 * at once when none is on its way, so what it reads as it starts is read in the turn it is asked in. The promise `run`
 * gives has the operation's own outcome, and one that fails never holds the ones after it. A key is let go once its
 * last operation has settled.
 *
 * `createSerializedQueue` is the one for a queue of its own that may start its work a turn later.
 */
export default class KeyedQueue<Key> {
  private tails = new Map<Key, Promise<void>>();

  public run<T>(key: Key, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key);
    let result: Promise<T>;
    try {
      result = previous ? previous.then(operation) : operation();
    } catch(error) {
      result = Promise.reject(error);
    }

    // * let go of as the operation settles, before what awaits it goes on: a turn later, what it queues next would wait
    const settle = () => {
      if(this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    };
    const tail = result.then(settle, settle);
    this.tails.set(key, tail);

    return result;
  }

  public isPending(key: Key) {
    return this.tails.has(key);
  }

  public forget(key: Key) {
    this.tails.delete(key);
  }

  public clear() {
    this.tails.clear();
  }
}

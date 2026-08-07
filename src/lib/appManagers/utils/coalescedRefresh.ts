import noop from '@helpers/noop';

export default class CoalescedRefresh<Key> {
  private pending = new Map<Key, Promise<void>>();
  private reruns = new Map<Key, () => Promise<void>>();

  public run(
    key: Key,
    task: () => Promise<void>,
    rerunIfPending = false
  ) {
    const pending = this.pending.get(key);
    if(pending) {
      if(rerunIfPending) {
        this.reruns.set(key, task);
      }
      return pending;
    }

    const promise = task();
    this.pending.set(key, promise);
    promise.catch(noop).finally(() => {
      if(this.pending.get(key) !== promise) {
        return;
      }

      this.pending.delete(key);
      const rerun = this.reruns.get(key);
      this.reruns.delete(key);
      if(rerun) {
        this.run(key, rerun);
      }
    });
    return promise;
  }

  public isPending(key: Key) {
    return this.pending.has(key);
  }

  public forget(key: Key) {
    this.pending.delete(key);
    this.reruns.delete(key);
  }

  public clear() {
    this.pending.clear();
    this.reruns.clear();
  }
}

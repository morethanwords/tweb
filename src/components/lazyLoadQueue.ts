import VisibilityIntersector, {OnVisibilityChangeItem} from '@components/visibilityIntersector';
import findAndSpliceAll from '@helpers/array/findAndSpliceAll';
import findAndSplice from '@helpers/array/findAndSplice';
import LazyLoadQueueIntersector, {LazyLoadElement} from '@components/lazyLoadQueueIntersector';
import useHeavyAnimationCheck, {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';

// * ONE subscription for every queue, instead of one per queue. Each queue used to register its own
// * pair of handlers on the module-level heavy-animation listener and drop the unsubscribe function
// * on the floor, so those closures captured its `this` for the tab's lifetime - and through the
// * queue, every element it still had queued. Queues are made per popup, per tab, per sticker grid,
// * so this grew without bound: a heap snapshot of a day-old tab charged 12 915 detached nodes to
// * this module, whole peer lists among them. The registry is weak, so an abandoned queue is
// * collectable and a heavy animation only locks the ones still alive.
const heavyAnimationQueues: Set<WeakRef<LazyLoadQueue>> = new Set();
let subscribedToHeavyAnimation = false;

const forEachLiveQueue = (callback: (queue: LazyLoadQueue) => void) => {
  for(const ref of heavyAnimationQueues) {
    const queue = ref.deref();
    if(!queue) {
      heavyAnimationQueues.delete(ref);
      continue;
    }

    callback(queue);
  }
};

const subscribeToHeavyAnimation = () => {
  if(subscribedToHeavyAnimation) {
    return;
  }

  subscribedToHeavyAnimation = true;
  useHeavyAnimationCheck(
    () => forEachLiveQueue((queue) => queue.lock()),
    () => forEachLiveQueue((queue) => queue.unlockAndRefresh())
  );
};

export default class LazyLoadQueue extends LazyLoadQueueIntersector {
  constructor(parallelLimit?: number, ignoreHeavyAnimation?: boolean) {
    super(parallelLimit);

    this.intersector = new VisibilityIntersector(this.onVisibilityChange);

    if(!ignoreHeavyAnimation) {
      heavyAnimationQueues.add(new WeakRef(this));
      subscribeToHeavyAnimation();

      // * useHeavyAnimationCheck used to fire handleAnimationStart right away for a queue born
      // * mid-animation; the shared subscription cannot, so lock here instead
      if(!getHeavyAnimationPromise().isFulfilled) {
        this.lock();
      }
    }
  }

  private onVisibilityChange = ({target, visible}: OnVisibilityChangeItem) => {
    // if(DEBUG) {
    //   this.log('isIntersecting', target, visible);
    // }

    // if visible - will move to the end of visible arary
    findAndSpliceAll(this.queue, (i) => i.div === target).forEach((item) => {
      if(visible) {
        item.wasSeen = true;
      }

      item.visible = visible;
      const index = this.queue.findIndex((item) => !item.visible);
      this.queue.splice(Math.max(0, index), 0, item);
    });

    this.setProcessQueueTimeout();
  };

  protected getItem() {
    return findAndSplice(this.queue, (item) => item.wasSeen);
  }

  public async processItem(item: LazyLoadElement) {
    await super.processItem(item);
    this.intersector.unobserve(item.div);
  }

  protected addElement(method: 'push' | 'unshift', el: LazyLoadElement) {
    const inserted = super.addElement(method, el);

    if(!inserted) return false;

    this.observe(el);
    /* if(el.wasSeen) {
      this.processQueue(el);
    } else  */
    el.wasSeen ??= false;

    return true;
  }

  public setAllSeen() {
    this.queue.forEach((item) => {
      item.wasSeen = true;
    });

    this.setProcessQueueTimeout();
  }
}

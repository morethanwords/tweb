import Scrollable from '@components/scrollable';
import {animateSingle, createAnimationInstance} from '@helpers/animation';
import ScrollSaver from '@helpers/scrollSaver';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';

export default function animateSomethingWithScroll(
  promise: Promise<any>,
  scrollable: Scrollable,
  scrollSaver: ScrollSaver,
  resizeTarget?: Element
) {
  dispatchHeavyAnimationEvent(promise);

  if(resizeTarget && typeof ResizeObserver !== 'undefined') {
    const instance = createAnimationInstance(scrollable.container);
    // A Web Animation can update its height after rAF's layout read. Restore after that layout,
    // before paint, or the scroll follows the shrinking placeholder a frame late.
    const observer = new ResizeObserver(() => {
      if(!instance.isCancelled) scrollSaver.restore();
    });
    observer.observe(resizeTarget);
    instance.deferred.then(() => observer.disconnect());

    const finish = () => {
      observer.disconnect();
      if(instance.isCancelled) return;
      // The animation's cleanup removes the placeholder before this promise resolves.
      scrollSaver.restore();
      instance.deferred.resolve();
    };
    promise.then(finish, finish);
    return;
  }

  let finished = false;
  promise.then(() => {
    finished = true;
  });

  animateSingle(() => {
    if(finished) {
      return false;
    }

    scrollSaver.restore();
    return true;
  }, scrollable.container);
}

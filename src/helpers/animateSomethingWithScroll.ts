import Scrollable from '@components/scrollable';
import {animateSingle} from '@helpers/animation';
import ScrollSaver from '@helpers/scrollSaver';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';

export default function animateSomethingWithScroll(promise: Promise<any>, scrollable: Scrollable, scrollSaver: ScrollSaver) {
  let finished = false;
  promise.then(() => {
    finished = true;
  });

  dispatchHeavyAnimationEvent(promise);

  animateSingle(() => {
    if(finished) {
      return false;
    }

    scrollSaver.restore();
    return true;
  }, scrollable.container);
}

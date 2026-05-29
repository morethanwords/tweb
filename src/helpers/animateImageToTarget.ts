import {animateValue} from './animateValue';
import deferredPromise from './cancellablePromise';
import {lerp} from './lerp';

type AnimateImageToTargetArgs = {
  animatedImg: HTMLImageElement;
  target: HTMLElement;
  targetIsRound?: boolean;
};

export function animateImageToTarget({animatedImg, target, targetIsRound}: AnimateImageToTargetArgs) {
  const deferred = deferredPromise<void>();

  const bcr = animatedImg.getBoundingClientRect();
  const left = bcr.left + bcr.width / 2, top = bcr.top + bcr.height / 2, width = bcr.width, height = bcr.height;
  const targetBcr = target.getBoundingClientRect();
  const leftDiff = (targetBcr.left + targetBcr.width / 2) - left;
  const topDiff = (targetBcr.top + targetBcr.height / 2) - top;

  const cancelAnimation = animateValue(
    0, 1, 200,
    (progress) => {
      animatedImg.style.transform = `translate(calc(${ progress * leftDiff }px - 50%), calc(${ progress * topDiff }px - 50%))`;
      animatedImg.style.width = lerp(width, targetBcr.width, progress) + 'px';
      animatedImg.style.height = lerp(height, targetBcr.height, progress) + 'px';

      if(targetIsRound) {
        animatedImg.style.borderRadius = lerp(0, 50, progress) + '%';
      }
    },
    {
      onEnd: () => {
        deferred.resolve();
      }
    }
  );

  return {
    promise: deferred,
    cancel: (reject?: boolean) => {
      cancelAnimation();
      if(reject) {
        deferred.reject();
      }
    }
  };
}

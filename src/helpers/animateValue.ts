import BezierEasing from '@vendor/bezierEasing';
import {lerp} from '@helpers/lerp';
import {requestRAF} from '@helpers/solid/requestRAF';


type AnimateValueOptions = {
  easing?: (progress: number) => number;
  onEnd?: () => void;
};

const defaultEasing = BezierEasing(0.42, 0.0, 0.58, 1.0);
export const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1);

export function animateValue<T extends number | number[]>(
  start: T,
  end: T,
  duration: number,
  callback: (value: T) => void,
  {easing = defaultEasing, onEnd = () => {}}: AnimateValueOptions = {}
) {
  let startTime: number;
  let canceled = false;

  function animateFrame() {
    if(canceled) return;
    const currentTime = performance.now();
    if(!startTime) startTime = currentTime;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    if(start instanceof Array && end instanceof Array) {
      const currentValues = start.map((startVal, index) => lerp(startVal, end[index], easedProgress));
      callback(currentValues as T);
    } else {
      callback(lerp(start as number, end as number, easedProgress) as T);
    }

    if(progress < 1) {
      requestRAF(animateFrame);
    } else {
      onEnd();
    }
  }

  requestRAF(animateFrame);

  return () => {
    canceled = true;
  };
}

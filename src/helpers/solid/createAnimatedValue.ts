import {createSignal, onCleanup, Accessor, createEffect, on} from 'solid-js';

import {simpleEasing} from '../../components/mediaEditor/utils';

import {animate} from '../animation';


export default function createAnimatedValue(value: Accessor<number>, time: number, easing = simpleEasing, shouldAnimate: Accessor<boolean> = () => true) {
  const [current, setCurrent] = createSignal(value());
  const [animating, setAnimating] = createSignal(false);

  createEffect(on(value, () => {
    if(!shouldAnimate()) {
      setCurrent(value());
      return;
    }

    const startValue = current();
    const startTime = performance.now();
    setAnimating(true);

    let cleaned = false;

    animate(() => {
      if(cleaned) return;

      const progress = easing(Math.min(1, (performance.now() - startTime) / time));

      setCurrent((value() - startValue) * progress + startValue);

      if(progress < 1) return true;
      setAnimating(false);
    });

    onCleanup(() => {
      cleaned = true;
      setAnimating(false);
    });
  }, {
    defer: true
  }));


  const result = current as Accessor<number> & {animating: Accessor<boolean>};

  result.animating = animating;

  return result;
}

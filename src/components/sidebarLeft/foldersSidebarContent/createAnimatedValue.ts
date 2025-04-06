import {createSignal, onCleanup, Accessor, createEffect, on} from 'solid-js';

import {animate} from '../../../helpers/animation';

import {simpleEasing} from '../../mediaEditor/utils';


export default function createAnimatedValue(value: Accessor<number>, time: number, easing = simpleEasing) {
  const [current, setCurrent] = createSignal(value());

  createEffect(on(value, () => {
    const startValue = current();
    const startTime = performance.now();

    let cleaned = false;

    animate(() => {
      if(cleaned) return;

      const progress = easing(Math.min(1, (performance.now() - startTime) / time));

      setCurrent((value() - startValue) * progress + startValue);

      return progress < 1;
    });

    onCleanup(() => void (cleaned = true));
  }, {
    defer: true
  }));

  return current;
}

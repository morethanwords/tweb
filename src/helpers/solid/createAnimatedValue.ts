import {Accessor, createEffect, createMemo, createSignal, on, onCleanup} from 'solid-js';
import {simpleEasing} from '@helpers/animateValue';
import {animate} from '@helpers/animation';


export default function createAnimatedValue(value: Accessor<number>, time: number, easing = simpleEasing, shouldAnimate: Accessor<boolean> = () => true) {
  // * the animation answers the number changing, not whatever it is computed from: a virtual list
  // * lays all its rows out anew on every update, and a row that stays where it is must keep gliding
  // * to its place - an update that moves nothing does not animate, so it cut the glide to its end
  const target = createMemo(value);
  const [current, setCurrent] = createSignal(target());
  const [animating, setAnimating] = createSignal(false);

  createEffect(on(target, () => {
    if(!shouldAnimate()) {
      setCurrent(target());
      return;
    }

    const startValue = current();
    const startTime = performance.now();
    setAnimating(true);

    let cleaned = false;

    animate(() => {
      if(cleaned) return;

      const progress = easing(Math.min(1, (performance.now() - startTime) / time));

      setCurrent((target() - startValue) * progress + startValue);

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

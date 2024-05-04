import {JSX} from 'solid-js';
import {createListTransition} from './createListTransition';
import {resolveElements} from '@solid-primitives/refs';
import liteMode from '../liteMode';

export function AnimationList(props: {
  children: JSX.Element
  animationOptions: KeyframeAnimationOptions,
  keyframes: Keyframe[],
  animateOnlyReplacement?: boolean,
  itemClassName?: string,
  appear?: boolean
}) {
  const children = resolveElements(() => props.children).toArray;

  const addClassName = props.itemClassName ? (added: Element[]) => {
    added.forEach((element) => {
      element.classList.add(props.itemClassName);
    });
  } : undefined;

  addClassName?.(children());

  const transitionList = createListTransition(children, {
    exitMethod: 'keep-index',
    appear: props.appear,
    onChange: ({added, removed, finishRemoved}) => {
      const options = props.animationOptions;
      if(!liteMode.isAvailable('animations')) {
        options.duration = 0;
      }

      addClassName?.(added);

      const keyframes = props.keyframes;
      queueMicrotask(() => {
        if(!props.animateOnlyReplacement || removed.length) {
          for(const element of added) {
            element.animate(keyframes, options);
          }
        }

        if(props.animateOnlyReplacement && !added.length) {
          finishRemoved(removed);
          return;
        }

        const reversedKeyframes = keyframes.slice().reverse();
        const promises: Promise<any>[] = [];
        for(const element of removed) {
          const animation = element.animate(reversedKeyframes, options);
          promises.push(animation.finished);
        }

        Promise.all(promises).then(() => finishRemoved(removed));
      });
    }
  }) as unknown as JSX.Element;

  return transitionList;
}

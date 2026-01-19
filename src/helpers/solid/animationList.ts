import {JSX} from 'solid-js';
import {createListTransition} from '@helpers/solid/createListTransition';
import {resolveElements} from '@solid-primitives/refs';
import liteMode from '@helpers/liteMode';

function wrapKeyframes(keyframes: Keyframe[] | ((element: Element, removed: boolean) => Keyframe[])) {
  return typeof(keyframes) !== 'function' ? () => keyframes : keyframes;
}

export function AnimationList(props: {
  children: JSX.Element
  animationOptions: KeyframeAnimationOptions,
  keyframes: Keyframe[] | ((element: Element, removed: boolean) => Keyframe[]),
  mode: 'replacement' | 'add-remove'/*  | 'add' */ | 'remove',
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

      const getKeyframes = wrapKeyframes(props.keyframes);
      let shouldAnimateAdded = false, shouldAnimateRemoved = false;
      if(props.mode === 'replacement') {
        shouldAnimateAdded = !!removed.length;
        shouldAnimateRemoved = !!added.length;
      } else if(props.mode === 'remove') {
        shouldAnimateRemoved = !!removed.length;
      } else if(props.mode === 'add-remove') {
        shouldAnimateAdded = !!added.length;
        shouldAnimateRemoved = !!removed.length;
      }

      queueMicrotask(() => {
        if(shouldAnimateAdded) {
          const keyframes = added.map((element) => getKeyframes(element, false));
          added.forEach((element, idx) => {
            element.animate(keyframes[idx], options);
          });
        }

        if(!shouldAnimateRemoved) {
          finishRemoved(removed);
          return;
        }

        const reversedKeyframes = removed.map((element) => getKeyframes(element, true).slice().reverse());
        const promises: Promise<any>[] = [];
        removed.forEach((element, idx) => {
          const animation = element.animate(reversedKeyframes[idx], options);
          promises.push(animation.finished);
        });

        Promise.all(promises).then(() => finishRemoved(removed));
      });
    }
  }) as unknown as JSX.Element;

  return transitionList;
}

import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import {resolveElements} from '@solid-primitives/refs';
import {createListTransition} from '@vendor/createListTransition';
import {JSX} from 'solid-js';

function wrapKeyframes(keyframes: Keyframe[] | ((element: Element, removed: boolean) => Keyframe[])) {
  return typeof(keyframes) !== 'function' ? () => keyframes : keyframes;
}

export function AnimationList(props: {
  children: JSX.Element
  animationOptions: KeyframeAnimationOptions,
  keyframes: Keyframe[] | ((element: Element, removed: boolean) => Keyframe[]),
  mode: 'replacement' | 'add-remove'/*  | 'add' */ | 'remove',
  itemClass?: string,
  appear?: boolean
}) {
  const children = resolveElements(() => props.children).toArray;

  const itemClassSplitted = props.itemClass?.split(' ');
  const addClassName = itemClassSplitted?.length && itemClassSplitted[0].trim() ? (added: Element[]) => {
    added.forEach((element) => {
      element.classList.add(...itemClassSplitted);
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

      // * no need to animate disconnected elements
      queueMicrotask(() => {
        if(shouldAnimateAdded) {
          const elements = added.filter((element) => element.isConnected);
          const keyframes = elements.map((element) => getKeyframes(element, false));
          elements.forEach((element, idx) => {
            element.animate(keyframes[idx], options);
          });
        }

        if(!shouldAnimateRemoved) {
          finishRemoved(removed);
          return;
        }

        const elements = removed.filter((element) => element.isConnected);
        const reversedKeyframes = elements.map((element) => getKeyframes(element, true).slice().reverse());
        const promises: Promise<any>[] = [];
        elements.forEach((element, idx) => {
          const animation = element.animate(reversedKeyframes[idx], options);
          promises.push(animation.finished);
        });

        // * `finished` rejects when an animation is cancelled - without catching it the
        // * exiting elements are never released, so every later replacement stacks on top
        // * of them instead of taking their place
        Promise.all(promises).catch(noop).then(() => finishRemoved(removed));
      });
    }
  }) as unknown as JSX.Element;

  return transitionList;
}

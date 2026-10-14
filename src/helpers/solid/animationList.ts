import {CROSS_FADE_KEYFRAMES} from '@helpers/dom/crossfadeContent';
import {keyframesAtLevel} from '@helpers/reducedKeyframes';
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
  appear?: boolean,
  /** an element is done leaving: its exit has played and it is taken out */
  onAfterExit?: (element: Element) => void
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
    onChange: ({added, removed, finishRemoved: _finishRemoved}) => {
      const finishRemoved = (removed: Element[]) => {
        _finishRemoved(removed);
        removed.forEach((element) => props.onAfterExit?.(element));
      };
      const animationLevel = liteMode.getAnimationLevel();
      const options = props.animationOptions;

      addClassName?.(added);

      const keyframesOf = wrapKeyframes(props.keyframes);
      // * reduced animations keep what the keyframes fade or grow and leave out what they move -
      // * one content sliding in for another crossfades, as screens do - and with animations off
      // * there is nothing to play
      const getKeyframes = (element: Element, removed: boolean) => {
        return keyframesAtLevel(keyframesOf(element, removed), animationLevel) ||
          (animationLevel === 1 && props.mode === 'replacement' ? CROSS_FADE_KEYFRAMES : undefined);
      };
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
            if(keyframes[idx]) element.animate(keyframes[idx], options);
          });
        }

        if(!shouldAnimateRemoved) {
          finishRemoved(removed);
          return;
        }

        const elements = removed.filter((element) => element.isConnected);
        const reversedKeyframes = elements.map((element) => getKeyframes(element, true)?.slice().reverse());
        // * held at their end until they are gone: a frame can be painted between the end and the
        // * removal, which would show the element whole once more - and let go of after, or an
        // * element added back would stay as it left
        const animations = elements.map((element, idx) => {
          return reversedKeyframes[idx] && element.animate(reversedKeyframes[idx], {...options, fill: 'forwards'});
        }).filter(Boolean);

        // * `finished` rejects when an animation is cancelled - without catching it the
        // * exiting elements are never released, so every later replacement stacks on top
        // * of them instead of taking their place
        Promise.all(animations.map((animation) => animation.finished)).catch(noop).then(() => {
          finishRemoved(removed);
          animations.forEach((animation) => animation.cancel());
        });
      });
    }
  }) as unknown as JSX.Element;

  return transitionList;
}

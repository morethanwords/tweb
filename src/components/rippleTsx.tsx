import {resolveFirst} from '@solid-primitives/refs';
import {createEffect, JSX, onCleanup} from 'solid-js';
import ripple from './ripple';

export interface RippleProps {
  children: JSX.Element,
  callback?: (id: number) => Promise<boolean | void>,
  onEnd?: (id: number) => void,
}

export const Ripple = (props: RippleProps) => {
  const {callback, onEnd} = props;
  const element = resolveFirst(() => props.children);
  createEffect(() => {
    const {dispose, element: rippleElement} = ripple(element() as HTMLElement, callback, onEnd, true);
    onCleanup(() => {
      dispose();
      rippleElement.remove();
    });
  });

  return props.children;
};

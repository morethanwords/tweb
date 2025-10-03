import {resolveFirst} from '@solid-primitives/refs';
import {createEffect, JSX, onCleanup} from 'solid-js';
import ripple from './ripple';

export interface RippleProps {
  children: JSX.Element
}

export const Ripple = (props: RippleProps) => {
  const element = resolveFirst(() => props.children);
  createEffect(() => {
    const {dispose, element: rippleElement} = ripple(element() as HTMLElement);
    onCleanup(() => {
      dispose();
      rippleElement.remove();
    });
  });

  return props.children;
};

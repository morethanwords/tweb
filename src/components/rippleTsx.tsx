import {type JSX, createRenderEffect, onMount} from 'solid-js';
import ripple from './ripple';

declare module 'solid-js' {
  namespace JSX {
    interface CustomEvents {
      click: (ev: MouseEvent) => void;
    }
  }
}


export interface RippleProps {
  children: JSX.Element,
  callback?: (id: number) => Promise<boolean | void>,
  onEnd?: (id: number) => void,
}

export const Ripple = (props: RippleProps) => {
  const {children, callback, onEnd} = props
  ripple(children as HTMLElement, callback, onEnd, true)
  return children
}

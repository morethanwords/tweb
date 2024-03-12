import {JSX, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';

import './skeleton.scss';

export interface SkeletonProps {
  loading: boolean;
  class?: string;
  children?: JSX.Element;
}

export const Skeleton = (props: SkeletonProps) => {
  return (
    <Transition name="fade" mode="outin">
      <Show when={props.loading} fallback={props.children && (
        <div class="skeleton-child">{props.children}</div>
      )}>
        <div class={`skeleton ${props.class ?? ''}`} />
      </Show>
    </Transition>
  );
};

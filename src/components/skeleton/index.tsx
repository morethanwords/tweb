import {JSX, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';

import './skeleton.scss';

export interface SkeletonProps {
  loading: boolean | (() => boolean);
  class?: string;
  children?: JSX.Element | (() => JSX.Element);
}

export const Skeleton = (props: SkeletonProps) => {
  const children = () => typeof(props.children) === 'function' ? props.children() : props.children;
  const loading = () => typeof(props.loading) === 'function' ? props.loading() : props.loading;
  const inner = (
    <Show when={loading()} fallback={children() && (
      <div class="skeleton-child">{children()}</div>
    )}>
      <div class={`skeleton ${props.class ?? ''}`} />
    </Show>
  );

  return (
    <Transition name="fade" mode="outin" duration={100}>
      {inner}
    </Transition>
  );
};

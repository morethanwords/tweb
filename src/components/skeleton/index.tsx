import {JSX, Show} from 'solid-js';
import {Transition} from 'solid-transition-group';
import classNames from '@helpers/string/classNames';

import '@components/skeleton/skeleton.scss';

export interface SkeletonProps {
  loading: boolean | (() => boolean);
  secondary?: boolean;
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
      <div class={classNames('skeleton', props.secondary && 'skeleton--secondary', props.class)} />
    </Show>
  );

  return (
    <Transition name="fade" mode="outin" duration={100}>
      {inner}
    </Transition>
  );
};

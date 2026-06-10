import {JSX, Show, splitProps} from 'solid-js';
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
      <Skeleton.Div textLine secondary={props.secondary} class={props.class} />
    </Show>
  );

  return (
    <Transition name="fade" mode="outin" duration={100}>
      {inner}
    </Transition>
  );
};

Skeleton.Div = (inProps: JSX.HTMLAttributes<HTMLDivElement> & {
  textLine?: boolean;
  secondary?: boolean;
}) => {
  const [props, restProps] = splitProps(inProps, ['textLine', 'secondary', 'class']);
  return (
    <div class={classNames('skeleton-base', props.textLine && 'skeleton', props.secondary && 'skeleton-base--secondary', props.class)} {...restProps} />
  );
};

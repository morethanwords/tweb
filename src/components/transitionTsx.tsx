import {createEffect, For, JSX, on, onMount, splitProps} from 'solid-js';
import TransitionSlider, {TransitionSliderOptions} from './transition';
import classNames from '../helpers/string/classNames';

export function TransitionSliderTsx(props: Omit<TransitionSliderOptions, 'content'> & {
  children: JSX.Element[]
  currentPage: number
  class?: string
  tabClass?: string
}) {
  const [, rest] = splitProps(props, ['children', 'currentPage', 'class', 'tabClass']);

  let ref!: HTMLDivElement;
  onMount(() => {
    const transitionTo = TransitionSlider({
      ...rest,
      content: ref
    });

    createEffect(on(() => props.currentPage, (currentPage) => transitionTo(currentPage)));
  })

  return (
    <div class={classNames('tabs-container', props.class)} ref={ref}>
      <For each={props.children}>
        {(child) => (
          <div class={classNames('tabs-tab', props.tabClass)}>
            {child}
          </div>
        )}
      </For>
    </div>
  )
}

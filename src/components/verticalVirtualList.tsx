import {createSignal, onCleanup, onMount, Component, createSelector, createMemo, For, Show, Ref} from 'solid-js';

import createAnimatedValue from '../helpers/solid/createAnimatedValue';

import {observeResize} from './resizeObserver';


export type VerticalVirtualListItemProps<T = any> = {
  item: T;
  top: number;
  idx: number;
};

const VerticalVirtualList: Component<{
  ref: Ref<HTMLUListElement>;
  list: any[];
  ListItem: Component<VerticalVirtualListItemProps>;

  class?: string;
  scrollableHost: HTMLElement;

  itemHeight: number;
  approximateInitialHostHeight: number;
  thresholdPadding: number;
}> = (props) => {
  const totalCount = createMemo(() => props.list.length);

  const [scrollAmount, setScrollAmount] = createSignal(0);
  const [hostHeight, setHostHeight] = createSignal(props.approximateInitialHostHeight);

  onMount(() => {
    setHostHeight(props.scrollableHost.getBoundingClientRect().height);

    const unobserve = observeResize(props.scrollableHost, (entry) => {
      setHostHeight(entry.contentRect.height);
    });

    props.scrollableHost.addEventListener('scroll', () => {
      setScrollAmount(props.scrollableHost.scrollTop);
    });

    onCleanup(() => {
      unobserve();
    });
  });

  const isVisible = createSelector(
    () => [scrollAmount(), hostHeight(), props.itemHeight, props.thresholdPadding] as const,
    (
      idx: number,
      [scrollAmount, hostHeight, itemHeight, padding]
    ) => (
      idx * itemHeight >= scrollAmount - padding &&
      (idx + 1) * itemHeight <= scrollAmount + hostHeight + padding
    )
  );


  return (
    <ul ref={props.ref} class={props.class} style={{
      height: totalCount() * props.itemHeight + 'px'
    }}>
      <For each={props.list}>
        {(item, idx) => (
          <Show when={isVisible(idx())}>
            <props.ListItem
              idx={idx()}
              item={item}
              top={createAnimatedValue(() => idx() * props.itemHeight, 120)()}
            />
          </Show>
        )}
      </For>
    </ul>
  );
};

export default VerticalVirtualList;

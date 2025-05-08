import {createSignal, onCleanup, onMount, Component, createSelector, createMemo, For, Show, Ref} from 'solid-js';

import createAnimatedValue from '../helpers/solid/createAnimatedValue';
import ListenerSetter from '../helpers/listenerSetter';
import useElementSize from '../hooks/useElementSize';


export type VerticalVirtualListItemProps<T = any> = {
  item: T;
  top: number;
  idx: number;
  animating: boolean;
};

const VerticalVirtualList: Component<{
  ref: Ref<HTMLUListElement>;
  list: any[];
  ListItem: Component<VerticalVirtualListItemProps>;

  class?: string;
  scrollableHost: HTMLElement;

  itemHeight: number;
  thresholdPadding: number;
}> = (props) => {
  const totalCount = createMemo(() => props.list.length);

  const [scrollAmount, setScrollAmount] = createSignal(0);
  const hostSize = useElementSize(() => props.scrollableHost);

  onMount(() => {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(props.scrollableHost)('scroll', () => {
      setScrollAmount(props.scrollableHost.scrollTop);
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });
  });

  const isVisible = createSelector(
    () => [scrollAmount(), hostSize.height, props.itemHeight, props.thresholdPadding] as const,
    (
      idx: number,
      [scrollAmount, hostHeight, itemHeight, padding]
    ) => (
      idx * itemHeight >= scrollAmount - padding &&
      (idx + 1) * itemHeight <= scrollAmount + hostHeight + padding
    )
  );


  const Item: Component<{idx: number, item: any}> = (itemProps) => {
    const animatedTop = createAnimatedValue(() => itemProps.idx * props.itemHeight, 120);

    return (
      <props.ListItem
        idx={itemProps.idx}
        item={itemProps.item}
        top={animatedTop()}
        animating={animatedTop.animating()}
      />
    );
  };

  return (
    <ul
      ref={props.ref}
      class={props.class}
      style={{
        height: totalCount() * props.itemHeight + 'px'
      }}
    >
      <For each={props.list}>
        {(item, idx) => (
          <Show when={isVisible(idx())}>
            <Item idx={idx()} item={item} />
          </Show>
        )}
      </For>
    </ul>
  );
};

export default VerticalVirtualList;

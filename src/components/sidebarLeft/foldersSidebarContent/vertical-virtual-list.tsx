import {createSignal, Index, onCleanup, onMount, Component, createSelector, createMemo, createRenderEffect, For, Show} from 'solid-js';
import {} from 'solid-js/store';
import {render, style} from 'solid-js/web';

import {observeResize} from '../../resizeObserver';

import styles from './some-styles.module.scss';
import classNames from '../../../helpers/string/classNames';
import Scrollable from '../../scrollable2';

const emptyArrayOf = (count: number) => new Array(count).fill(null);

const VerticalVirtualList: Component<{
  list: any[];
  renderItem: (item: any) => HTMLElement;

  itemHeight: number;
  approximateInitialHostHeight: number;
  thresholdPadding: number;
}> = (props) => {
  const count = createMemo(() => props.list.length);

  const [scrollAmount, setScrollAmount] = createSignal(0);
  const [hostHeight, setHostHeight] = createSignal(props.approximateInitialHostHeight);

  let hostRef: HTMLDivElement;

  onMount(() => {
    setHostHeight(hostRef.getBoundingClientRect().height);

    const unobserve = observeResize(hostRef, (entry) => {
      setHostHeight(entry.contentRect.height);
    });

    hostRef.addEventListener('scroll', () => {
      setScrollAmount(hostRef.scrollTop);
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

  const Item: Component<{idx: number, item: any}> = (itemProps) => {
    const element = props.renderItem(itemProps.item);

    createRenderEffect(() => {
      element.style.setProperty('top', itemProps.idx * props.itemHeight + 'px');
    });

    return element;
  };

  return (
    <Scrollable ref={hostRef} class={styles.VirtualList}>
      <div class={styles.VirtualListInner} style={{
        height: count() * props.itemHeight + 'px'
      }}>
        <For each={props.list}>
          {(item, idx) => (
            <Show when={isVisible(idx())}>
              <Item idx={idx()} item={item} />
            </Show>
          )}
        </For>
      </div>
    </Scrollable>
  );
};

export default VerticalVirtualList;

export function Sample() {
  const items = new Array(10000).fill(null).map((_, idx) => ({
    name: `Row ${idx + 1}`,
    even: !!(idx & 1)
  }));

  return (
    <div class={styles.Popup}>
      <VerticalVirtualList
        list={items}
        itemHeight={72}
        approximateInitialHostHeight={1200}
        renderItem={(item: any) => <div class={classNames(styles.Item, !item.even && styles.ItemOdd)}>{item.name}</div> as HTMLElement}
        thresholdPadding={72 * 3}
      />
    </div>
  )
}

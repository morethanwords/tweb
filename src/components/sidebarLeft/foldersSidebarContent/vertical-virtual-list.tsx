import {createSignal, Index, onCleanup, onMount, Component, createSelector, createMemo, createRenderEffect, For, Show, Accessor, createEffect, on} from 'solid-js';
import {} from 'solid-js/store';
import {render, style} from 'solid-js/web';

import classNames from '../../../helpers/string/classNames';
import {MOUNT_CLASS_TO} from '../../../config/debug';

import {observeResize} from '../../resizeObserver';
import Scrollable from '../../scrollable2';

import createAnimatedValue from './createAnimatedValue';

import styles from './some-styles.module.scss';


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

    const animatedTop = createAnimatedValue(() => itemProps.idx * props.itemHeight, 120);

    createRenderEffect(() => {
      element.style.setProperty('top', animatedTop() + 'px');
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
  const [items, setItems] = createSignal(new Array(10000).fill(null).map((_, idx) => ({
    id: idx + 1,
    even: !!(idx & 1)
  })));

  const f = (i: number) => {
    i = items().findIndex(({id}) => id === i);
    if(i === -1) throw 'WTF?'
    return i;
  }

  function swap(i1: number, i2: number) {
    const cpy = [...items()];
    i1 = f(i1);
    i2 = f(i2);

    const tmp = cpy[i1];
    cpy[i1] = cpy[i2];
    cpy[i2] = tmp;

    setItems(cpy);
  }

  function deleteItem(i1: number) {
    const cpy = [...items()];
    i1 = f(i1);
    cpy.splice(i1, 1);
    setItems(cpy);
  }

  function moveItem(i1: number, i2: number) {
    const cpy = [...items()];
    i1 = f(i1);
    i2 = f(i2);
    const item = cpy.splice(i1, 1)[0];

    cpy.splice(/* i1 < i2 ? i2 - 1 :  */i2, 0, item);
    setItems(cpy);
  }

  function addItem(i1: number, item: {id: number, even: boolean}) {
    const cpy = [...items()];
    i1 = f(i1);
    cpy.splice(i1, 0, item);
    setItems(cpy);
  }

  MOUNT_CLASS_TO.swapItems = swap
  MOUNT_CLASS_TO.deleteItem = deleteItem
  MOUNT_CLASS_TO.moveItem = moveItem
  MOUNT_CLASS_TO.addItem = addItem

  return (
    <div class={styles.Popup}>
      <VerticalVirtualList
        list={items()}
        itemHeight={72}
        approximateInitialHostHeight={window.innerHeight}
        renderItem={(item: any) => <div class={classNames(styles.Item, !item.even && styles.ItemOdd)}>Row {item.id}</div> as HTMLElement}
        thresholdPadding={72 * 3}
      />
    </div>
  )
}

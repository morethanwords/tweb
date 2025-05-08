import {createSignal, Index, onCleanup, onMount, Component, createSelector, createMemo, createRenderEffect, For, Show, Accessor, createEffect, on, createRoot, JSX, createResource, createComputed, mapArray, batch, children, Ref} from 'solid-js';
import {} from 'solid-js/store';
import {render, style} from 'solid-js/web';

import classNames from '../../../helpers/string/classNames';
import {MOUNT_CLASS_TO} from '../../../config/debug';

import {observeResize} from '../../resizeObserver';
import Scrollable from '../../scrollable2';

import createAnimatedValue from './createAnimatedValue';

import styles from './some-styles.module.scss';


const emptyArrayOf = (count: number) => new Array(count).fill(null);

function positionListItemByIndex<T>(element: T, list: T[], pos: number) {
  const prevPos = list.indexOf(element);

  if(prevPos === pos) {
    return list;
  }

  list = [...list];

  prevPos > -1 && list.splice(prevPos, 1);
  list.splice(pos, 0, element);

  return list;
}


export class SequentialCursorFetcher<T> {
  private fetchedItemsCount = 0;
  private neededCount = 0;

  private cursor: T;

  private isFetching = false;

  constructor(private fetcher: (cursor: T | undefined) => Promise<{cursor: T, count: number}>) {}

  public fetchUntil(neededCount: number) {
    this.neededCount = Math.max(this.neededCount, neededCount);

    if(this.isFetching) return;

    this.isFetching = true;
    this.fetchUntilNeededCount().finally(() => {
      this.isFetching = false;
    });
  }

  private async fetchUntilNeededCount() {
    while(this.fetchedItemsCount < this.neededCount) {
      const {cursor, count} = await this.fetcher(this.cursor);
      if(count === 0) break;
      this.cursor = cursor;
      this.fetchedItemsCount += count;
    }
  }
}


type CreateDeferredSortedVirtualListArgs<T> = {
  scrollable: HTMLElement;
  getItemElement: (item: T) => HTMLElement;
  requestItemForIdx: (idx: number) => void;
  sortWith: (a: number, b: number) => number;
  onLengthChange?: () => void;
};

export type DeferredSortedVirtualListItem<T> = {
  id: any;
  index: number;
  value: T;
};

export const createDeferredSortedVirtualList = <T, >({scrollable, getItemElement, requestItemForIdx, sortWith, onLengthChange}: CreateDeferredSortedVirtualListArgs<T>) => createRoot(dispose => {
  const [items, setItems] = createSignal<DeferredSortedVirtualListItem<T>[]>([]);

  const [totalCount, setTotalCount] = createSignal(0);

  const sortedItems = createMemo(() => items().slice().sort((a, b) => sortWith(a.index, b.index)));
  const itemsMap = createMemo(() => new Map(items().map(item => [item.id, item.value])));

  const fullItems = createMemo(() => {
    const realItems = sortedItems();

    return new Array(Math.max(totalCount(), realItems.length))
    .fill(null)
    .map((_, idx) => realItems[idx] || null);
  });

  const itemsLength = createMemo(() => items().length);

  createEffect(on(itemsLength, () => {
    onLengthChange?.();
  }, {defer: true}));

  const addItems = (newItems: DeferredSortedVirtualListItem<T>[]) => {
    const ids = new Set(newItems.map(item => item.id));
    setItems(prev => [
      ...prev.filter(item => !ids.has(item.id)),
      ...newItems
    ]);
  };

  const removeItem = (id: any) => {
    setItems(prev => prev.filter(item => id !== item.id));
  };

  const updateItem = (id: any, index: number, value?: T) => {
    setItems(prev =>
      prev.map(
        item => item.id === id ?
          {id, index, value: value || item.value} :
          item
      )
    );
  };

  const has = (id: any) => {
    return itemsMap().has(id);
  };

  const get = (id: any) => {
    return itemsMap().get(id);
  };

  const clear = () => {
    batch(() => {
      setItems([]);
      setTotalCount(0);
    });
  };


  let list: HTMLUListElement;

  const InnerItem = (props: {value: T, top: number}) => {
    const element = createMemo(() => getItemElement(props.value));

    element()?.classList.add(styles.ChatlistItem);

    createRenderEffect(() => {
      element()?.style.setProperty('top', props.top + 'px');
    });

    return <>{element()}</>;
  };

  <VerticalVirtualList
    ref={list}
    approximateInitialHostHeight={window.innerHeight}
    itemHeight={72}
    list={fullItems()}
    ListItem={(props: VerticalVirtualListItemProps<DeferredSortedVirtualListItem<T> | null>) => {
      return (
        <Show when={props.item} fallback={
          <>
            {void requestItemForIdx(props.idx)}
            <div class={styles.LoadingItem} style={{top: props.top + 'px'}}>Loading...</div>
          </>
        }>
          <InnerItem value={props.item?.value} top={props.top} />
        </Show>
      );
    }}
    scrollableHost={scrollable}
    thresholdPadding={72 * 4}
  />;

  return {
    dispose,

    list,

    setTotalCount,
    addItems,
    updateItem,
    removeItem,
    clear,
    has,
    get,
    getAll: () => itemsMap()
  }
});

type VerticalVirtualListItemProps<T = any> = {
  item: T;
  top: number;
  idx: number;
};

const VerticalVirtualList: Component<{
  ref: Ref<HTMLUListElement>;
  list: any[];
  ListItem: (props: VerticalVirtualListItemProps) => JSX.Element;

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
      {/* <VerticalVirtualList
        list={items()}
        itemHeight={72}
        approximateInitialHostHeight={window.innerHeight}
        renderItem={(item: any) => <div class={classNames(styles.Item, !item.even && styles.ItemOdd)}>Row {item.id}</div> as HTMLElement}
        thresholdPadding={72 * 3}
      /> */}
    </div>
  )
}

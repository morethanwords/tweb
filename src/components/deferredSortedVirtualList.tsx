import {createSignal, createMemo, createRenderEffect, Show, createEffect, on, createRoot, batch} from 'solid-js';

import VerticalVirtualList, {VerticalVirtualListItemProps} from './verticalVirtualList';

import styles from './deferredSortedVirtualList.module.scss';


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

export const createDeferredSortedVirtualList = <T, >(args: CreateDeferredSortedVirtualListArgs<T>) => createRoot(dispose => {
  const {
    scrollable,
    getItemElement,
    requestItemForIdx,
    sortWith,
    onLengthChange
  } = args;

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
  }, {defer: false}));


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

  const updateItem = (id: any, index: number) => {
    setItems(prev => {
      const foundItem = prev.find(item => item.id === id);
      if(foundItem) foundItem.index = index;
      return [...prev];
    });
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

  const InnerItem = (props: {value: T, top: number, animating: boolean}) => {
    const element = createMemo(() => {
      const element = getItemElement(props.value);
      element?.classList.add(styles.ChatlistItem);
      return element;
    });

    createRenderEffect(() => {
      element()?.style.setProperty('top', props.top + 'px');
    });

    createEffect(() => {
      if(props.animating)
        element()?.style.setProperty('--background', /* 'red' */'var(--surface-color)');
      else
        element()?.style.removeProperty('--background');
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
          <InnerItem value={props.item?.value} top={props.top} animating={props.animating} />
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

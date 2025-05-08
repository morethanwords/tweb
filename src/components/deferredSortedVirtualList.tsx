import {
  createSignal,
  createMemo,
  createRenderEffect,
  Show,
  createEffect,
  createRoot,
  batch,
  untrack,
  onCleanup
} from 'solid-js';

import useElementSize from '../hooks/useElementSize';

import LoadingDialogSkeleton, {LoadingDialogSkeletonSize} from './loadingDialogSkeleton';
import VerticalVirtualList, {VerticalVirtualListItemProps} from './verticalVirtualList';

import styles from './deferredSortedVirtualList.module.scss';


type CreateDeferredSortedVirtualListArgs<T> = {
  scrollable: HTMLElement;
  getItemElement: (item: T) => HTMLElement;
  requestItemForIdx: (idx: number) => void;
  sortWith: (a: number, b: number) => number;
  itemSize: LoadingDialogSkeletonSize;
  noAvatar?: boolean;
  onListLengthChange?: () => void;
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
    itemSize,
    onListLengthChange,
    noAvatar
  } = args;

  const [items, setItems] = createSignal<DeferredSortedVirtualListItem<T>[]>([]);
  const [totalCount, setTotalCount] = createSignal(0);
  const [wasAtLeastOnceFetched, setWasAtLeastOnceFetched] = createSignal(false);
  const [revealIdx, setRevealIdx] = createSignal(Infinity);

  const scrollableSize = useElementSize(() => scrollable);

  const sortedItems = createMemo(() => items().slice().sort((a, b) => sortWith(a.index, b.index)));
  const itemsMap = createMemo(() => new Map(items().map(item => [item.id, item.value])));

  const fullItems = createMemo(() => {
    if(!wasAtLeastOnceFetched()) return new Array((scrollableSize.height + itemSize - 1) / itemSize | 0).fill(null);

    const realItems = sortedItems();

    return new Array(Math.max(totalCount(), realItems.length))
    .fill(null)
    .map((_, idx) => realItems[idx] || null);
  });

  const itemsLength = createMemo(() => items().length);

  createEffect(() => {
    if(!wasAtLeastOnceFetched()) return;

    itemsLength();
    untrack(() => onListLengthChange?.());
  });

  createEffect(() => {
    if(revealIdx() !== Infinity) return;

    const timeout = self.setTimeout(() => {
      setRevealIdx(items().length);
    }, 50);

    onCleanup(() => {
      self.clearTimeout(timeout);
    });
  });

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
      if(foundItem) foundItem.index = index; // we're not spreading here as we want to keep the same object reference for the animation to trigger
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
      setWasAtLeastOnceFetched(false);
      setRevealIdx(Infinity);
    });
    // onListLengthChange?.();
  };


  let list: HTMLUListElement;

  const InnerItem = (props: {value: T, top: number, animating: boolean}) => {
    const element = createMemo(() => {
      const element = getItemElement(props.value);
      element?.classList.add(styles.Item);
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

  const [queuedToBeRevealed, setQueuedToBeRevealed] = createSignal<number[]>([]);

  const minQueuedToBeRevealed = createMemo(() =>
    !queuedToBeRevealed().length ?
      null :
      Math.min(...queuedToBeRevealed())
  );


  createEffect(() => {
    const mn = minQueuedToBeRevealed();

    if(mn === null) return;

    const timeout = self.setTimeout(() => {
      batch(() => {
        setRevealIdx(prev => Math.max(mn + 1, prev));
        setQueuedToBeRevealed(prev => prev.filter(n => revealIdx() <= n))
      });
    }, 1000 / 60 / 2);

    onCleanup(() => {
      self.clearTimeout(timeout);
    });
  });

  <VerticalVirtualList
    ref={list}
    itemHeight={itemSize}
    list={fullItems()}
    forceHostHeight={!wasAtLeastOnceFetched()}
    ListItem={(props: VerticalVirtualListItemProps<DeferredSortedVirtualListItem<T> | null>) => {
      const isRevealed = createMemo(() => revealIdx() > props.idx);
      const canShow = createMemo(() => props.item && isRevealed());

      createEffect(() => {
        if(!props.item || isRevealed()) return;

        const idx = props.idx;

        setQueuedToBeRevealed(prev => [...prev, idx]);

        onCleanup(() => {
          setQueuedToBeRevealed(prev => prev.filter(n => n !== idx));
        });
      });

      return (
        <Show when={canShow()} fallback={
          <>
            {void requestItemForIdx(props.idx)}
            <LoadingDialogSkeleton
              class={styles.Item}
              style={{top: props.top + 'px'}}
              seed={props.idx}
              size={itemSize}
              noAvatar={noAvatar}
            />
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

    itemsLength,
    addItems,
    updateItem,
    removeItem,
    setWasAtLeastOnceFetched,

    clear,
    has,
    get,
    getAll: () => itemsMap()
  }
});

import {
  createSignal,
  createMemo,
  createRenderEffect,
  Show,
  createEffect,
  createRoot,
  batch,
  untrack,
  onCleanup,
  createComputed,
  on
} from 'solid-js';

import LoadingDialogSkeleton, {LoadingDialogSkeletonSize} from './loadingDialogSkeleton';
import VerticalVirtualList, {VerticalVirtualListItemProps} from './verticalVirtualList';

import styles from './deferredSortedVirtualList.module.scss';


type CreateDeferredSortedVirtualListArgs<T> = {
  scrollable: HTMLElement;
  getItemElement: (item: T, id: any) => HTMLElement;
  onItemUnmount?: (item: T) => void;
  onListShrinked: () => void;
  requestItemForIdx: (idx: number, itemsLength: number) => void;
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


const EXTRA_ITEMS_TO_KEEP = 50;


export const createDeferredSortedVirtualList = <T, >(args: CreateDeferredSortedVirtualListArgs<T>) => createRoot(dispose => {
  const {
    scrollable,
    getItemElement,
    onItemUnmount,
    onListShrinked,
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

  const [visibleItems, setVisibleItems] = createSignal(new Set<number>(), {equals: false});

  // const scrollableSize = useElementSize(() => scrollable);

  const sortedItems = createMemo(() => items().slice().sort((a, b) => sortWith(a.index, b.index)));
  const itemsMap = createMemo(() => new Map(items().map(item => [item.id, item.value])));

  const fullItems = createMemo(() => {
    // if(!wasAtLeastOnceFetched()) return new Array((scrollableSize.height + itemSize - 1) / itemSize | 0).fill(null);

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

  createComputed(on(wasAtLeastOnceFetched, () => {
    if(!wasAtLeastOnceFetched()) return;

    setRevealIdx(items().length);
  }));

  const addItems = (newItems: DeferredSortedVirtualListItem<T>[]) => {
    if(!newItems.length) return;
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

  // createEffect(() => {
  //   console.log('[my-debug-1] ------ LOG --------');
  //   console.log('[my-debug-1] itemsLength()', itemsLength());
  //   console.log('[my-debug-1] totalCount()', totalCount());
  //   console.log('[my-debug-1] revealIdx()', revealIdx());
  //   console.log('[my-debug-1] queuedToBeRevealed()', queuedToBeRevealed());
  // })


  let list: HTMLUListElement;

  const InnerItem = (props: {id: any, value: T, top: number, animating: boolean}) => {
    const element = createMemo(() => {
      const element = getItemElement(props.value, props.id);
      element?.classList.add(styles.Item);

      onCleanup(() => {
        onItemUnmount?.(props.value);
      });

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


  createEffect(() => {
    console.log('[my-debug] list length and last index :>> ', itemsLength(), sortedItems()[sortedItems().length - 1]?.index);
  });

  function checkShrink(visibleItems: Set<number>, itemsLength: number) {
    const maxVisible = Math.max(0, ...Array.from(visibleItems.values()));

    const toKeep = maxVisible + EXTRA_ITEMS_TO_KEEP;

    if(itemsLength > toKeep) {
      console.log('[my-debug] shrinking list maxVisible, visibleItems, itemsLength(), toKeep :>> ', maxVisible, visibleItems, itemsLength, toKeep);
      batch(() => {
        // Should be sortedItems() here, because the updated cursor is based on the last item from the list, and might skip a few dialogs if wasn't set the right cursor
        setItems(sortedItems().slice(0, toKeep));
        setRevealIdx(toKeep);
      });
      onListShrinked();
    }
  }

  let shrinkTimeout: number;

  createEffect(on(visibleItems, () => {
    self.clearTimeout(shrinkTimeout);

    shrinkTimeout = self.setTimeout(() => {
      checkShrink(visibleItems(), itemsLength());
    }, 0);
  }));

  <VerticalVirtualList
    ref={list}
    itemHeight={itemSize}
    list={fullItems()}
    forceHostHeight={!wasAtLeastOnceFetched()}
    ListItem={(props: VerticalVirtualListItemProps<DeferredSortedVirtualListItem<T> | null>) => {
      const isRevealed = createMemo(() => props.idx < revealIdx());
      const canShow = createMemo(() => props.item && isRevealed());

      createEffect(() => {
        if(!props.item || isRevealed()) return;

        const idx = props.idx;

        setQueuedToBeRevealed(prev => [...prev, idx]);

        onCleanup(() => {
          setQueuedToBeRevealed(prev => prev.filter(n => n !== idx));
        });
      });

      createEffect(() => {
        if(canShow()) return;

        requestItemForIdx(props.idx, items().length);
      });

      createComputed(() => {
        const idx = props.idx;
        setVisibleItems(prev => prev.add(idx));

        onCleanup(() => {
          setVisibleItems(prev => {
            prev.delete(idx);
            return prev;
          });
        });
      });

      return (
        <Show
          when={canShow()}
          fallback={
            <LoadingDialogSkeleton
              class={styles.Item}
              style={{top: props.top + 'px'}}
              seed={props.idx}
              size={itemSize}
              noAvatar={noAvatar}
            />
          }
        >
          <InnerItem
            id={props.item?.id}
            value={props.item?.value}
            top={props.top}
            animating={props.animating}
          />
        </Show>
      );
    }}
    scrollableHost={scrollable}
    thresholdPadding={72 * 4}
    extraPaddingBottom={8} // 0.5rem
  />;

  return {
    dispose,

    list,

    setTotalCount,

    sortedItems,
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

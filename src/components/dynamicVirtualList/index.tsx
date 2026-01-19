import {
  type Accessor,
  batch,
  type Component,
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  For,
  getOwner,
  type JSX,
  mapArray,
  mergeProps,
  on,
  onCleanup,
  type Ref,
  runWithOwner,
  untrack
} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {requestRAF} from '@helpers/solid/requestRAF';
import useElementSize from '@hooks/useElementSize';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {useResizeObserver} from '@hooks/useResizeObserver';
import {useScrollTop} from '@hooks/useScrollTop';
import {lowerBound} from '@components/dynamicVirtualList/lowerBound';
import styles from '@components/dynamicVirtualList/styles.module.scss';


export type DynamicVirtualListItemProps<T, El extends HTMLElement> = {
  ref: Ref<El>;
  payload: T;
  isMeasuring: boolean;
  offset: number;
  translation: number;
  idx: number;
};

type RenderAtLeastFromBottomArgs = {
  clientHeight: number;
};

export type DynamicVirtualListProps<T, El extends HTMLElement> = {
  list: T[];
  scrollable: HTMLElement;
  estimateItemHeight: (item: T) => number;
  measureElementHeight: (el: El) => number;
  Item: (props: DynamicVirtualListItemProps<T, El>) => JSX.Element;
  maxBatchSize: number;
  verticalPadding?: number;

  /**
   * Useful when scrolled all the way to the bottom and collapsing all elements, make sure to give an integer
   */
  renderAtLeastFromBottom?: (args: RenderAtLeastFromBottomArgs) => number;

  nearBottomThreshold?: number;
  /**
   * Fires constantly when the list is near the bottom, even if empty, refires when the list changes too, dangerous thing
   */
  onNearBottom?: () => void;
};

const viewportThreshold = 0.05;
const stableResizeTimeout = 50;
const scrollAdjustmentThreshold = 1;

const createListItemStates = <T, >(list: Accessor<T[]>) => {
  const rawStates = mapArray(list, (payload, idx) => {
    const [cachedHeight, setCachedHeight] = createSignal<number>(); // to be immediately set when first estimating
    const [offset, setOffset] = createSignal(0);
    const [translate, setTranslate] = createSignal(0);

    return {
      payload,
      prevCachedHeight: 0, // to be immediately set when first estimating
      cachedHeight,
      setCachedHeight,
      offset,
      setOffset,
      translate,
      setTranslate,
      idx,
      needScrollAdjustment: false
    };
  });

  return createMemo(() => rawStates()); // memo is a must here, it reiterates the whole list when accessing directly
};

type ListItemState<T> = ReturnType<ReturnType<typeof createListItemStates<T>>>[number];

type CreateListHeightArgs<T> = {
  listItemStates: Accessor<ListItemState<T>[]>;
  estimateItemHeight: (item: T) => number;
  verticalPadding: Accessor<number>;
};

const createListHeight = <T, >({listItemStates, estimateItemHeight, verticalPadding}: CreateListHeightArgs<T>) => {
  const [height, setHeight] = createSignal(0);

  createComputed(() => {
    batch(() => {
      const newHeight = listItemStates().reduce((acc, item) => {
        const height = untrack(() => item.cachedHeight() ?? estimateItemHeight(item.payload));

        item.prevCachedHeight = height;
        item.setCachedHeight(height);
        item.setOffset(acc);

        return acc + height;
      }, verticalPadding());

      setHeight(newHeight + verticalPadding());
    });
  });

  return [height, setHeight] as const;
};

type CreateVirtualRenderStateArgs<T> = {
  list: Accessor<T[]>;
  scrollable: Accessor<HTMLElement>;
  estimateItemHeight: (item: T) => number;
  maxBatchSize: Accessor<number>;
  verticalPadding: Accessor<number>;
  renderAtLeastFromBottom: (args: RenderAtLeastFromBottomArgs) => number;
};

const createVirtualRenderState = <T, >({
  list,
  scrollable,
  maxBatchSize: batchSize,
  estimateItemHeight,
  verticalPadding,
  renderAtLeastFromBottom
}: CreateVirtualRenderStateArgs<T>) => {
  const scrollTop = useScrollTop(scrollable);
  const size = useElementSize(scrollable);

  const clientHeight = () => size.height;

  const listItemStates = createListItemStates(list);

  const [height, setHeight] = createListHeight({
    listItemStates,
    estimateItemHeight,
    verticalPadding
  });

  const [renderedItems, setRenderedItems] = createSignal<ListItemState<T>[]>([], {
    equals: (a, b) => a.length === b.length && a.every((item, i) => item === b[i])
  });

  // Here we care only by reference
  const [trackedRenderedItems, setTrackedRenderedItems] = createSignal<ListItemState<T>[]>([]);

  createEffect(() => {
    // We'll rerun the effect every time the rendered items change (but after measuring),
    // making sure it fills the viewport even if the items didn't change their height after updating
    trackedRenderedItems();

    const list = listItemStates();

    const localBatchSize = untrack(batchSize);

    const prevRenderedItems = untrack(renderedItems);
    const toRender: ListItemState<T>[] = [];

    const prevMinIdx = prevRenderedItems.length ?
      prevRenderedItems.reduce((minIdx, item) => Math.min(minIdx, item.idx()), Infinity) :
      0;

    let scrollTopAdjustment = 0;

    for(const item of prevRenderedItems)
      if(item.needScrollAdjustment) {
        const height = untrack(item.cachedHeight) || 0;
        const heightDiff = height - item.prevCachedHeight;
        scrollTopAdjustment += heightDiff;
        item.needScrollAdjustment = false;
      }

    const localScrollTop = scrollTop() + scrollTopAdjustment,
      localClientHeight = clientHeight();

    const viewportTop = localScrollTop - viewportThreshold * localClientHeight,
      viewportBottom = localScrollTop + localClientHeight * (1 + viewportThreshold);

    let totalHeightDiff = 0,
      queuedCount = 0,
      currentOffset = 0;

    batch(() => {
      let i = lowerBound(0, prevMinIdx - 1, viewportTop, idx =>
        untrack(() => list[idx].offset() + (list[idx].cachedHeight() || 0)),
      );

      const fromBottomIdx = list.length - renderAtLeastFromBottom({clientHeight: localClientHeight});

      i = Math.min(i, fromBottomIdx);
      i = Math.max(i, 0);

      currentOffset = untrack(() => list[i]?.offset()) || verticalPadding();

      for(; i < list.length; i++) {
        const item = list[i];

        const height = untrack(item.cachedHeight) || 0;
        const heightDiff = height - item.prevCachedHeight;
        totalHeightDiff += heightDiff;

        item.prevCachedHeight = height;
        item.setOffset(currentOffset);

        const top = currentOffset,
          bottom = top + height;

        const wasVisible = prevRenderedItems.includes(item);

        const isVisible = (bottom > viewportTop || i >= fromBottomIdx) && top < viewportBottom;

        if(!wasVisible && isVisible) queuedCount += 1;

        const tooManyQueued = queuedCount > localBatchSize;

        if(!tooManyQueued && isVisible) {
          toRender.push(item);
          item.needScrollAdjustment = i < prevMinIdx;
        } else if(toRender.length) break;

        currentOffset += height;
      }

      toRender.forEach(item => void item.cachedHeight()); // the height will be recomputed immediately and rerun this effect (if there are changes)

      if(Math.abs(scrollTopAdjustment) > scrollAdjustmentThreshold)
        untrack(scrollable).scrollTop += scrollTopAdjustment;

      setHeight(prev => prev + totalHeightDiff);
      setRenderedItems(toRender);
    });

    // console.log('my-debug rerender', {localScrollTop, viewportTop, viewportBottom, prevRenderedItemsLength: prevRenderedItems.length, toRenderLength: toRender.length})
  });

  return {
    scrollTop,
    clientHeight,
    height,
    renderedItems,
    onMeasure: () => {
      setTrackedRenderedItems(untrack(renderedItems));
    }
  };
};

type CreateItemComponentArgs<T, El extends HTMLElement> = {
  component: Accessor<Component<DynamicVirtualListItemProps<T, El>>>;
  measureElementHeight: (element: El) => number;
};

const createItemComponent = <T, El extends HTMLElement>({
  component,
  measureElementHeight
}: CreateItemComponentArgs<T, El>) => {
  const registerResizeCallback = useResizeObserver();

  return (props: { item: ListItemState<T> }) => {
    let ref!: El;

    const [isMeasuring, setIsMeasuring] = createSignal(false);

    const owner = getOwner();
    const isCleaned = useIsCleaned();

    const {offset, setCachedHeight, idx} = props.item;

    const [stableOffset, setStableOffset] = createSignal(0);
    const [translation, setTranslation] = createSignal(0);

    let timeoutId: number | undefined;

    onCleanup(() => {
      self.clearTimeout(timeoutId);
      props.item.needScrollAdjustment = false;
    });

    let afterMeasure = true;

    requestRAF(() => {
      if(isCleaned()) return;

      // we're already in a batch

      const height = measureElementHeight(ref);
      setCachedHeight(height);
      setIsMeasuring(false);

      afterMeasure = true;

      runWithOwner(owner, () => {
        registerResizeCallback(ref, ({size}) => {
          // setCachedHeight(size.height);
          // Looks like the resize observer is giving a little bit different height, especially visible when scrolled to bottom then collapse one element
          setCachedHeight(measureElementHeight(ref));
        });
      });
    });

    createComputed(
      on(offset, () => {
        if(afterMeasure) {
          afterMeasure = false;
          setStableOffset(offset());
          return;
        }

        const diff = offset() - stableOffset();
        if(!diff) return;

        setTranslation(diff);

        self.clearTimeout(timeoutId);
        timeoutId = self.setTimeout(() => {
          batch(() => {
            setStableOffset(offset());
            setTranslation(0);
          });
        }, stableResizeTimeout);
      }),
    );

    return (
      <Dynamic
        component={component()}
        ref={ref}
        payload={props.item.payload}
        isMeasuring={isMeasuring()}
        offset={isMeasuring() ? 0 : stableOffset()}
        translation={isMeasuring() ? 0 : translation()}
        idx={idx()}
      />
    );
  };
};

export const DynamicVirtualList = <T, El extends HTMLElement>(
  inProps: DynamicVirtualListProps<T, El>,
) => {
  const props = mergeProps({
    nearBottomThreshold: 120,
    verticalPadding: 0,
    renderAtLeastFromBottom: () => 0
  }, inProps);

  const {scrollTop, clientHeight, height, renderedItems, onMeasure} = createVirtualRenderState({
    list: () => props.list,
    estimateItemHeight: (...args) => props.estimateItemHeight(...args),
    maxBatchSize: () => props.maxBatchSize,
    scrollable: () => props.scrollable,
    verticalPadding: () => props.verticalPadding,
    renderAtLeastFromBottom: (args) => props.renderAtLeastFromBottom(args)
  });

  createEffect(() => {
    if(!props.onNearBottom) return;

    if(scrollTop() + clientHeight() >= height() - props.nearBottomThreshold) {
      untrack(() => props.onNearBottom());
    }
  })

  const Item = createItemComponent({
    component: () => props.Item,
    measureElementHeight: (...args) => {
      onMeasure(); // we're batching inside the measure and it will set by the same reference, so it should be fine
      return props.measureElementHeight(...args)
    }
  });

  return (
    <div class={styles.Container} style={{'--height': `${height()}px`}}>
      <For each={renderedItems()}>{item => <Item item={/* @once */ item} />}</For>
    </div>
  );
};

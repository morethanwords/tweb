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
  on,
  onCleanup,
  type Ref,
  runWithOwner,
  untrack
} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import {requestRAF} from '../../helpers/solid/requestRAF';
import useElementSize from '../../hooks/useElementSize';
import {useIsCleaned} from '../../hooks/useIsCleaned';
import {useResizeObserver} from '../../hooks/useResizeObserver';
import {useScrollTop} from '../../hooks/useScrollTop';
import {lowerBound} from './lowerBound';


export type DynamicVirtualListItemProps<T, El extends HTMLElement> = {
  ref: Ref<El>;
  payload: T;
  isMeasuring: boolean;
  offset: number;
  translation: number;
};

export type DynamicVirtualListProps<T, El extends HTMLElement> = {
  list: T[];
  scrollable: HTMLElement;
  estimateItemHeight: (item: T) => number;
  measureElementHeight: (el: El) => number;
  Item: (props: DynamicVirtualListItemProps<T, El>) => JSX.Element;
  maxBatchSize: number;
};

const viewportThreshold = 0.2;
const stableResizeTimeout = 100;
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
};

const createListHeight = <T, >({listItemStates, estimateItemHeight}: CreateListHeightArgs<T>) => {
  const [height, setHeight] = createSignal(0);

  createComputed(() => {
    batch(() => {
      const newHeight = listItemStates().reduce((acc, item) => {
        const height = untrack(() => item.cachedHeight() ?? estimateItemHeight(item.payload));

        item.prevCachedHeight = height;
        item.setCachedHeight(height);
        item.setOffset(acc);

        return acc + height;
      }, 0);

      setHeight(newHeight);
    });
  });

  return [height, setHeight] as const;
};

type CreateVirtualRenderStateArgs<T> = {
  listItemStates: Accessor<ListItemState<T>[]>;
  scrollable: Accessor<HTMLElement>;
  estimateItemHeight: (item: T) => number;
  maxBatchSize: Accessor<number>;
};

const createVirtualRenderState = <T, >({
  listItemStates,
  scrollable,
  maxBatchSize: batchSize,
  estimateItemHeight
}: CreateVirtualRenderStateArgs<T>) => {
  const scrollTop = useScrollTop(scrollable);
  const size = useElementSize(scrollable);

  const clientHeight = () => size.height;

  const [height, setHeight] = createListHeight({
    listItemStates,
    estimateItemHeight
  });

  const [renderedItems, setRenderedItems] = createSignal<ListItemState<T>[]>([]);

  createEffect(() => {
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
        item.needScrollAdjustment = false
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

      currentOffset = list[i]?.offset() || 0;

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

        const isVisible = bottom > viewportTop && top < viewportBottom;

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
      console.log('scrollTopAdjustment:', scrollTopAdjustment);

      setHeight(prev => prev + totalHeightDiff);
      setRenderedItems(toRender);
    });
  });

  return {height, renderedItems};
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

    const {offset, setCachedHeight} = props.item;

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
          setCachedHeight(size.height);
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
      />
    );
  };
};

export const DynamicVirtualList = <T, El extends HTMLElement>(
  props: DynamicVirtualListProps<T, El>,
) => {
  const listItemStates = createListItemStates(() => props.list);

  const {height, renderedItems} = createVirtualRenderState({
    listItemStates,
    estimateItemHeight: (...args) => props.estimateItemHeight(...args),
    maxBatchSize: () => props.maxBatchSize,
    scrollable: () => props.scrollable
  });

  const Item = createItemComponent({
    component: () => props.Item,
    measureElementHeight: (...args) => props.measureElementHeight(...args)
  });

  return (
    <div style={{height: `${height()}px`, position: 'relative'}}>
      <For each={renderedItems()}>{item => <Item item={/* @once */ item} />}</For>
    </div>
  );
};

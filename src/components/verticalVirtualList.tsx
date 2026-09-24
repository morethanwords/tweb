import {createSignal, onCleanup, onMount, Component, createSelector, createMemo, For, Show, Ref, createComputed, on, Accessor, untrack} from 'solid-js';

import createAnimatedValue from '@helpers/solid/createAnimatedValue';
import ListenerSetter from '@helpers/listenerSetter';
import useElementSize from '@hooks/useElementSize';
import styles from '@components/verticalVirtualList.module.scss';

/** What every item the list places wears - it lies over the list at the place the list gives it */
export const VIRTUAL_LIST_ITEM_CLASS_NAME = styles.item;


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
  /**
   * Where the items start, for a list whose items are not all `itemHeight` tall - a section header
   * between the rows, say (`createItemsLayout` lays one out). Without it every item is `itemHeight`,
   * and the items are laid out by their index alone.
   */
  layout?: ItemsLayout;
  thresholdPadding: number;

  animate: boolean;

  forceHostHeight?: boolean;
  extraPaddingBottom?: number;
}> = (props) => {
  const totalCount = createMemo(() => props.list.length);

  const [scrollAmount, setScrollAmount] = createSignal(0);
  const hostSize = useElementSize(() => props.scrollableHost);
  // * a host of no height is not laid out at all - its tab is hidden (`display: none`, settings
  // * opened over the chat list) - rather than one that shows nothing. The window of rows is kept as
  // * it was: shrinking it to nothing would drop every row, only to build them all anew - avatars and
  // * custom emoji along with them - the moment the tab is back
  const hostHeight = createMemo<number>((prev) => hostSize.height || prev, 0);

  onMount(() => {
    const listenerSetter = new ListenerSetter();

    listenerSetter.add(props.scrollableHost)('scroll', () => {
      setScrollAmount(props.scrollableHost.scrollTop);
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });
  });


  // * where every item starts, and where the last one ends: for a list of equal items it is their
  // * index times the height, as it always was
  const getLayout = (): ItemsLayout => props.layout || createUniformLayout(props.itemHeight);

  const onScrollShift = (amount: number) => {
    untrack(() => {
      props.scrollableHost.scrollTop -= amount;
    });
  };

  const shouldAnimate = useShouldAnimate({
    list: () => props.list,
    hostHeight,
    getLayout,
    scrollAmount,
    onScrollShift
  });

  const canAnimate = createMemo(() => shouldAnimate() && props.animate);

  const isVisible = createSelector(
    () => [scrollAmount(), hostHeight(), getLayout(), props.thresholdPadding] as const,
    (
      idx: number,
      [scrollAmount, hostHeight, layout, padding]
    ) => (
      layout.top(idx) >= scrollAmount - padding &&
      layout.top(idx + 1) <= scrollAmount + hostHeight + padding
    )
  );


  const Item: Component<{idx: number, item: any}> = (itemProps) => {
    const animatedTop = createAnimatedValue(() => getLayout().top(itemProps.idx), 120, undefined, canAnimate);

    return (
      <props.ListItem
        idx={itemProps.idx}
        item={itemProps.item}
        top={animatedTop()}
        animating={animatedTop.animating()}
      />
    );
  };

  const computedItemsHeight = () => getLayout().top(totalCount()) + Number(!!totalCount()) * (props.extraPaddingBottom || 0);

  const height = createMemo(() => props.forceHostHeight ? hostHeight() : computedItemsHeight());

  // `role="presentation"` is the same call `createChatList` already makes, for
  // the same reason: items go into this <ul> directly, so it has no <li> to own
  // and claiming to be a list would announce a structure that is not there. The
  // items are links and keep their own semantics — presentation only drops what
  // this element says about itself.
  //
  // Real list semantics would be worse than none here rather than better: the
  // list is windowed, so it would announce the size of the window instead of the
  // number of chats — "12 items" to someone who has two hundred is a confident
  // wrong answer. Giving that orientation back means `aria-setsize` /
  // `aria-posinset` carrying the real totals, and those need the items to be
  // listitems: a deliberate change, not an attribute.
  return (
    <ul
      ref={props.ref}
      class={props.class}
      role="presentation"
      style={{
        height: height() + 'px',
        overflow: props.forceHostHeight ? 'hidden' : undefined
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

/** Where the items of a list start: `top(idx)` for any index up to the length, which is where the list ends */
export type ItemsLayout = {
  top: (idx: number) => number
};

function createUniformLayout(itemHeight: number): ItemsLayout {
  return {
    top: (idx) => idx * itemHeight
  };
}

/** Lays out a list whose items differ in height, for `VerticalVirtualList`'s `layout` */
export function createItemsLayout(list: any[], getItemHeight: (item: any) => number): ItemsLayout {
  const tops = new Array<number>(list.length + 1);
  tops[0] = 0;
  for(let i = 0; i < list.length; ++i) {
    tops[i + 1] = tops[i] + getItemHeight(list[i]);
  }

  return {
    top: (idx) => tops[Math.min(idx, list.length)]
  };
}

type UseShouldAnimateArgs = {
  list: Accessor<any[]>;
  scrollAmount: Accessor<number>;
  getLayout: Accessor<ItemsLayout>;
  hostHeight: Accessor<number>;

  onScrollShift: (amount: number) => void;
};

/**
 * If all the items from the viewport of the host element shift by the same amount, don't animate them
 *
 * For example when a new chat appears on top, and we have some scroll, prevent all the chats from viewport
 * moving at the same time
 */
function useShouldAnimate({list, scrollAmount, hostHeight, getLayout, onScrollShift}: UseShouldAnimateArgs) {
  const [shouldAnimate, setShouldAnimate] = createSignal(true);

  const isActuallyVisible = (layout: ItemsLayout, idx: number) => {
    const top = scrollAmount();
    return layout.top(idx + 1) >= top &&
      layout.top(idx) <= top + hostHeight();
  };

  // * the layout the previous list was laid out with - an item that has not moved in the list can
  // * still have moved on screen, when an item of another height went in above it
  let prevLayout: ItemsLayout;
  createComputed(on(list, (current, prev = []) => {
    const layout = getLayout();
    const visiblePrev = prevLayout ? prev.filter((_, i) => isActuallyVisible(prevLayout, i)) : [];
    const visibleNow = current.filter((_, i) => isActuallyVisible(layout, i));

    const visiblePrevAndNow = Array.from(new Set([...visibleNow, ...visiblePrev]));

    let allChangedTheSameAmount = true;
    let prevDiff: number;

    for(const item of visiblePrevAndNow) {
      const prevIdx = prev.indexOf(item);
      const currentIdx = current.indexOf(item);

      if(prevIdx === -1 || currentIdx === -1) {
        allChangedTheSameAmount = false;
        break;
      }

      const diff = prevLayout.top(prevIdx) - layout.top(currentIdx);

      if(typeof prevDiff === 'undefined') {
        prevDiff = diff;
        continue;
      }

      if(prevDiff !== diff) {
        allChangedTheSameAmount = false;
        break;
      }
    }

    if(!visiblePrevAndNow.length) {
      allChangedTheSameAmount = false;
      prevDiff = 0;
    }

    prevLayout = layout;

    setShouldAnimate(!allChangedTheSameAmount);

    if(allChangedTheSameAmount) {
      onScrollShift(prevDiff);
    }

    return current;
  }));

  return shouldAnimate;
}

export default VerticalVirtualList;

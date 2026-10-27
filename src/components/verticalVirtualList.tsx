import {createSignal, onCleanup, onMount, Component, createSelector, createMemo, For, Show, Ref, createComputed, on, Accessor, createRenderEffect, untrack} from 'solid-js';

import {simpleEasing} from '@helpers/easings';
import liteMode from '@helpers/liteMode';
import noop from '@helpers/noop';
import ListenerSetter from '@helpers/listenerSetter';
import useElementSize from '@hooks/useElementSize';
import styles from '@components/verticalVirtualList.module.scss';

/** What every item the list places wears - it lies over the list at the place the list gives it */
export const VIRTUAL_LIST_ITEM_CLASS_NAME = styles.item;


export type VerticalVirtualListItemProps<T = any> = {
  item: T;
  top: number;
  idx: number;
  /** whether a move to another `top` may glide there (`createItemGlide`) */
  glide: boolean;
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
  const uniformLayout = createMemo(() => createUniformLayout(props.itemHeight));
  const getLayout = (): ItemsLayout => props.layout || uniformLayout();

  // * once the update is through: the list takes its new height in a render effect, after this is
  // * asked for, and a host scrolled further than the old height lets it would stop short
  let pendingScrollShift = 0;
  const onScrollShift = (amount: number) => {
    if(!amount) {
      return;
    }

    if(!pendingScrollShift) queueMicrotask(() => {
      if(pendingScrollShift) props.scrollableHost.scrollTop -= pendingScrollShift;
      pendingScrollShift = 0;
    });

    pendingScrollShift += amount;
  };

  let listEl: HTMLUListElement;
  // * where the screen starts, in the list: the host can scroll something above the list too (the
  // * chat list's stories), and a shift asked for in this task is not in it yet
  const getVisibleTop = () => {
    return props.scrollableHost.getBoundingClientRect().top - listEl.getBoundingClientRect().top - pendingScrollShift;
  };

  const shouldAnimate = useShouldAnimate({
    list: () => props.list,
    hostHeight,
    getLayout,
    scrollAmount,
    getVisibleTop,
    onScrollShift
  });

  // rows glide to a new place only with full animations - with reduced ones they step there
  const canAnimate = createMemo(() => shouldAnimate() && props.animate && liteMode.isAvailable('motion'));

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
    return (
      <props.ListItem
        idx={itemProps.idx}
        item={itemProps.item}
        top={getLayout().top(itemProps.idx)}
        glide={canAnimate()}
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
      ref={(el) => {
        listEl = el;
        if(typeof props.ref === 'function') props.ref(el);
      }}
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

const GLIDE_TIME = 120;

/**
 * Puts an item at `top`, and when it may glide there carries it from where it was drawn: the item
 * is at its new place at once, and a transform animation the compositor runs takes it there. A
 * `top` animated a frame at a time laid the list out again in every frame of every row that moved
 * (a chat going up the list moves every row above its old place). Gives whether it is gliding.
 */
export function createItemGlide(element: Accessor<HTMLElement>, top: Accessor<number>, canGlide: Accessor<boolean>) {
  const [gliding, setGliding] = createSignal(false);
  let glide: {animation: Animation, from: number, to: number}, lastElement: HTMLElement, lastTop: number;

  // * where the item is drawn now: a glide that is cut short starts the next one from there (the
  // * animation's own time - it starts with the next frame, not when it is asked for)
  const getDrawnTop = () => {
    if(!glide) {
      return lastTop;
    }

    const time = Number(glide.animation.currentTime) || 0;
    const progress = simpleEasing(Math.min(1, time / GLIDE_TIME));
    return glide.from + (glide.to - glide.from) * progress;
  };

  const stop = () => {
    glide?.animation.cancel();
    glide = undefined;
  };

  createRenderEffect(() => {
    const _element = element(), _top = top();
    // * an update that moves nothing (the dialog updated again in the place it has just taken)
    // * leaves the glide running
    if(_element && _element === lastElement && _top === lastTop) {
      return;
    }

    const from = _element && _element === lastElement ? getDrawnTop() : undefined;
    stop();
    lastElement = _element;
    lastTop = _top;
    if(!_element) {
      setGliding(false);
      return;
    }

    _element.style.setProperty('top', _top + 'px');
    if(from === undefined || from === _top || !untrack(canGlide) || typeof(_element.animate) !== 'function') {
      setGliding(false);
      return;
    }

    const animation = _element.animate([
      {transform: `translateY(${from - _top}px)`},
      {transform: 'translateY(0)'}
    ], {duration: GLIDE_TIME, easing: 'ease'}); // * `simpleEasing`
    glide = {animation, from, to: _top};
    setGliding(true);
    animation.finished.then(() => {
      if(glide?.animation === animation) {
        glide = undefined;
        setGliding(false);
      }
    }, noop);
  });

  onCleanup(stop);

  return gliding;
}

/** Where the items of a list start: `top(idx)` for any index up to the length, which is where the list ends */
export type ItemsLayout = {
  top: (idx: number) => number
};

function createUniformLayout(itemHeight: number): ItemsLayout {
  return {
    top: (idx) => idx * itemHeight
  };
}

/** The first of the `length` items that reaches below `offset` - `length` when none does */
export function findItemAtOffset(layout: ItemsLayout, length: number, offset: number) {
  let low = 0, high = length;
  while(low < high) {
    const middle = (low + high) >> 1;
    if(layout.top(middle + 1) <= offset) low = middle + 1;
    else high = middle;
  }

  return low;
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
  /** where the screen starts in the list, measured: unlike `scrollAmount`, nothing lags behind */
  getVisibleTop: () => number;

  onScrollShift: (amount: number) => void;
};

/**
 * If all the items from the viewport of the host element shift by the same amount, don't animate them
 *
 * For example when a new chat appears on top, and we have some scroll, prevent all the chats from viewport
 * moving at the same time
 */
function useShouldAnimate({list, scrollAmount, hostHeight, getLayout, getVisibleTop, onScrollShift}: UseShouldAnimateArgs) {
  const [shouldAnimate, setShouldAnimate] = createSignal(true);

  const isActuallyVisible = (layout: ItemsLayout, idx: number) => {
    const top = scrollAmount();
    return layout.top(idx + 1) >= top &&
      layout.top(idx) <= top + hostHeight();
  };

  // * the same items, only some of another height now (a chat list's row got its folder tags, or the
  // * list narrowed and they all lost theirs): the item at the top of the screen stays where it is, as
  // * a browser anchors its scroll, or a row that grew above the screen would push what is on it down
  const onHeightsChange = (length: number, layout: ItemsLayout) => {
    const anchorIdx = findItemAtOffset(prevLayout, length, getVisibleTop());
    const shift = anchorIdx < length ? prevLayout.top(anchorIdx) - layout.top(anchorIdx) : 0;
    // * an item moved by the scroll must not slide to its place on top of it
    setShouldAnimate(!shift);
    onScrollShift(shift);
  };

  // * the layout the list was last laid out with, heights included - an item that has not moved in
  // * the list can still have moved on screen, when an item of another height went in above it
  let prevLayout: ItemsLayout;
  createComputed(on([list, getLayout], ([current, layout], prevInput) => {
    const prev = prevInput?.[0] || [];
    if(current === prev) {
      if(prevLayout && layout !== prevLayout) {
        onHeightsChange(current.length, layout);
      }

      prevLayout = layout;
      return;
    }

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

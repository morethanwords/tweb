
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
  JSX
} from 'solid-js';
import type SwipeHandler from '@components/swipeHandler';
import handleHorizontalSwipe from '@helpers/dom/handleHorizontalSwipe';
import styles from '@components/slideshow.module.scss';
import classNames from '@helpers/string/classNames';
import {fastRaf} from '@helpers/schedulers';
import cancelEvent from '@helpers/dom/cancelEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import {IconTsx} from '@components/iconTsx';
import Modes from '@config/modes';

export type SlideshowProps<T> = {
  aspectRatio?: number;
  class?: string;
  items?: T[];
  getItemKey?: (item: T) => unknown;
  children?: (item: T, index: number) => JSX.Element;
  initialIndex?: number;
  activeIndex?: number;
  hideArrows?: boolean;
  keepItemsMounted?: boolean;
  onIndexChange?: (index: number) => void;
  onClick?: (index: number) => void;
};

const TRANSLATE_TEMPLATE = 'translate({x}, 0)';
// a press that moves less than this is a click (the item opens, a side pages) rather than a drag
const DRAG_DEAD_ZONE = 6;
// a drag pages once it went this part of the width, or was flicked faster than this (px/ms)
const PAGE_DISTANCE = .2;
const PAGE_VELOCITY = .4;
const VELOCITY_WINDOW = 100;

/** Whether a press is on a slideshow that pages: it takes horizontal swipes and clicks itself */
export function isPagingSlideshowTarget(target: EventTarget) {
  const slideshow = findUpClassName(target, styles.Slideshow);
  return !!slideshow && !slideshow.classList.contains(styles.IsSingle);
}

export default function Slideshow<T>(props: SlideshowProps<T>) {
  let container: HTMLDivElement;
  let itemsContainer: HTMLDivElement;
  let swipeHandler: SwipeHandler;

  const clampIndex = (value: number) => Math.max(0, Math.min(value, Math.max(0, props.items.length - 1)));
  const getItemKey = (item: T) => props.getItemKey ? props.getItemKey(item) : item;
  const initialIndex = clampIndex(props.initialIndex || 0);
  const [index, setIndex] = createSignal(initialIndex);
  const [isSwiping, setIsSwiping] = createSignal(false);
  const [noTransition, setNoTransition] = createSignal(false);
  let selectedKey = props.items.length ? getItemKey(props.items[initialIndex]) : undefined;
  let hasSelectedKey = !!props.items.length;

  const selectIndex = (value: number) => {
    const nextIndex = clampIndex(value);
    // * the key first: setting the index runs the effect that keeps the selected item across edits of
    // * the items at once, and with the key of the item left it put the index back - every page went to
    // * the one picked the time before
    if(props.items.length) {
      selectedKey = getItemKey(props.items[nextIndex]);
      hasSelectedKey = true;
    } else {
      selectedKey = undefined;
      hasSelectedKey = false;
    }
    setIndex(nextIndex);
    return nextIndex;
  };

  const getCount = () => props.items.length;

  const setTranslate = (value: string) => {
    itemsContainer.style.transform = TRANSLATE_TEMPLATE.replace('{x}', value);
  };

  // * A drag moves the items with the pointer - or the fingers on a trackpad - by one item at most, and
  // * pages when it went far enough or was flicked; otherwise the item it started on comes back
  let width = 0, startIndex = 0, offset = 0, dragging = false;
  let samples: {time: number, offset: number}[] = [];

  // how fast the drag went in its last moments: one held still before the release threw nothing,
  // however fast it got there (a pointer that stops sends no moves to say so)
  const getVelocity = () => {
    const last = samples[samples.length - 1];
    if(!last || performance.now() - last.time > VELOCITY_WINDOW) return 0;
    const first = samples.find((sample) => last.time - sample.time <= VELOCITY_WINDOW);
    return last.time > first.time ? (last.offset - first.offset) / (last.time - first.time) : 0;
  };

  // * The click a drag ends with is the drag's. Taken before anything inside sees it: an item opens
  // * itself on a click of its own (a photo its viewer), before the slideshow's handler would run
  const onClickCapture = (e: MouseEvent) => {
    if(isSwiping()) cancelEvent(e);
  };

  onMount(() => {
    container.addEventListener('click', onClickCapture, true);
    swipeHandler = handleHorizontalSwipe({
      element: container,
      wheelSwipe: true,
      axisThreshold: DRAG_DEAD_ZONE,
      verifyTouchTarget: (e) => {
        if(getCount() <= 1) return false;
        // a wheel pages only when swiped sideways: scrolling past it, zooming and a shift-scroll are not.
        // Not `instanceof WheelEvent`: one from a Document PiP window is of that window's class
        if(e.type === 'wheel') {
          const wheel = e as any as WheelEvent;
          return !wheel.ctrlKey && !wheel.metaKey && !wheel.shiftKey && Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY);
        }

        return true;
      },
      onFirstSwipe: () => {
        width = container.getBoundingClientRect().width;
        startIndex = index();
        offset = 0;
        dragging = false;
        samples = [];
      },
      onSwipe: (xDiff) => {
        const lastIndex = getCount() - 1;
        offset = Math.max(startIndex === lastIndex ? 0 : -width, Math.min(startIndex === 0 ? 0 : width, -xDiff));
        samples.push({time: performance.now(), offset});
        if(samples.length > 20) samples.shift();

        if(!dragging) {
          if(Math.abs(xDiff) < DRAG_DEAD_ZONE) return;
          dragging = true;
          setIsSwiping(true);
          setNoTransition(true);
        }

        setTranslate(`${-startIndex * width + offset}px`);
      },
      onReset: () => {
        if(!dragging) return;
        dragging = false;

        const velocity = getVelocity();
        const direction = Math.abs(offset) > width * PAGE_DISTANCE ? -Math.sign(offset) :
          Math.abs(velocity) > PAGE_VELOCITY && Math.sign(velocity) === Math.sign(offset) ? -Math.sign(offset) :
          0;

        setNoTransition(false);
        fastRaf(() => {
          const newIndex = clampIndex(startIndex + direction);
          if(newIndex === index()) applyIndex(newIndex); // * back to where it started
          else setActiveIndex(newIndex);
          setIsSwiping(false); // * after the click that ends a drag: that one is the drag's (handleClick)
        });
      }
    });
  });

  onCleanup(() => {
    container.removeEventListener('click', onClickCapture, true);
    swipeHandler?.removeListeners();
  });

  createEffect(() => {
    if(props.activeIndex !== undefined && props.activeIndex !== index()) {
      selectIndex(props.activeIndex);
    }
  });

  createEffect(() => {
    const keys = props.items.map(getItemKey);
    const currentIndex = index();
    let nextIndex = props.activeIndex === undefined && hasSelectedKey ?
      keys.findIndex((key) => Object.is(key, selectedKey)) :
      -1;
    if(nextIndex === -1) nextIndex = clampIndex(currentIndex);

    if(keys.length) {
      selectedKey = keys[nextIndex];
      hasSelectedKey = true;
    } else {
      selectedKey = undefined;
      hasSelectedKey = false;
    }
    if(nextIndex !== currentIndex) setIndex(nextIndex);
  });

  const applyIndex = (i: number) => {
    if(itemsContainer) {
      setTranslate(`${-i * 100}%`);
    }
  };

  createEffect(() => applyIndex(index()));

  const handleClick = (e: MouseEvent) => {
    if(isSwiping()) return;

    // Check if clicked buttons
    const target = e.target as HTMLElement;
    if(findUpClassName(target, styles.Arrow)) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isLeft = x < (rect.width / 3);
    const isRight = x > (rect.width * 2 / 3);

    if(isLeft) {
      handlePrev(e);
    } else if(isRight) {
      handleNext(e);
    } else {
      props.onClick?.(index());
    }
  };

  const setActiveIndex = (newIndex: number) => {
    if(newIndex === index() || newIndex < 0 || newIndex >= getCount()) return;
    selectIndex(newIndex);
    props.onIndexChange?.(newIndex);
  };

  const handlePrev = (e: Event) => {
    e.stopPropagation();
    setActiveIndex(index() - 1);
  };

  const handleNext = (e: Event) => {
    e.stopPropagation();
    setActiveIndex(index() + 1);
  };

  return (
    <div
      ref={container}
      class={classNames(
        styles.Slideshow,
        isSwiping() && styles.IsSwiping,
        getCount() <= 1 && styles.IsSingle,
        props.hideArrows && styles.NoArrows,
        noTransition() && styles.NoTransition,
        props.class
      )}
      style={{
        '--slideshow-aspect-ratio': `${props.aspectRatio || 16 / 9}`
      }}
      onClick={handleClick}
    >
      <div
        ref={itemsContainer}
        class={styles.Items}
      >
        <For each={props.items}>{(item, i) => {
          // The items off to the sides are kept mounted for the paging, out of view: no part of
          // what is read out, and no stops for Tab with the keyboard layer.
          const away = () => i() !== index();
          let element: HTMLDivElement;
          if(Modes.a11y) createEffect(() => {
            element.inert = away();
          });
          return (
            <div ref={element} class={styles.Item} aria-hidden={away() ? 'true' : undefined}>
              {props.keepItemsMounted ?
                untrack(() => props.children?.(item, i())) :
                <Show when={Math.abs(i() - index()) < 5}>
                  {props.children?.(item, i())}
                </Show>
              }
            </div>
          );
        }}</For>
      </div>

      <div class={styles.Dots}>
        <For each={new Array(getCount())}>{(_, i) => (
          <button
            type="button"
            class={classNames(styles.Dot, i() === index() && styles.Active)}
            aria-label={`${i() + 1} / ${getCount()}`}
            aria-current={i() === index() ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation();
              setActiveIndex(i());
            }}
          />
        )}</For>
      </div>

      <div class={styles.Arrow} onClick={handlePrev}>
        <IconTsx icon="avatarprevious" class={styles.ArrowIcon} />
      </div>
      <div class={classNames(styles.Arrow, styles.ArrowNext)} onClick={handleNext}>
        <IconTsx icon="avatarnext" class={styles.ArrowIcon} />
      </div>
    </div>
  );
}

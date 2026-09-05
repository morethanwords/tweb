
import {createEffect, createSignal, For, onCleanup, onMount, Show, JSX} from 'solid-js';
import SwipeHandler from '@components/swipeHandler';
import styles from '@components/slideshow.module.scss';
import classNames from '@helpers/string/classNames';
import {fastRaf} from '@helpers/schedulers';
import findUpClassName from '@helpers/dom/findUpClassName';
import {IconTsx} from '@components/iconTsx';

export type SlideshowProps<T> = {
  class?: string;
  items?: T[];
  getItemKey?: (item: T) => unknown;
  children?: (item: T, index: number) => JSX.Element;
  initialIndex?: number;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
  onClick?: (index: number) => void;
};

const SCALE = 1;
const TRANSLATE_TEMPLATE = 'translate({x}, 0)';

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
    setIndex(nextIndex);
    if(props.items.length) {
      selectedKey = getItemKey(props.items[nextIndex]);
      hasSelectedKey = true;
    } else {
      selectedKey = undefined;
      hasSelectedKey = false;
    }
    return nextIndex;
  };

  const getCount = () => props.items.length;

  let width = 0, x = 0, lastDiffX = 0, minX = 0;

  onMount(() => {
    swipeHandler = new SwipeHandler({
      element: container,
      onSwipe: (xDiff, yDiff) => {
        xDiff *= -1;

        lastDiffX = xDiff;
        let lastX = x + xDiff * -SCALE;
        if(lastX > 0) lastX = 0;
        else if(lastX < minX) lastX = minX;

        itemsContainer.style.transform = TRANSLATE_TEMPLATE.replace('{x}', lastX + 'px');
        return false;
      },
      verifyTouchTarget: (e) => {
        if(getCount() <= 1) return false;
        return true;
      },
      onFirstSwipe: () => {
        const rect = itemsContainer.getBoundingClientRect();
        width = rect.width;
        minX = -width * (getCount() - 1);
        x = rect.left - container.getBoundingClientRect().left;

        itemsContainer.style.transform = TRANSLATE_TEMPLATE.replace('{x}', x + 'px');

        setIsSwiping(true);
        setNoTransition(true);
        void itemsContainer.offsetLeft; // reflow
      },
      onReset: () => {
        const addIndex = Math.ceil(Math.abs(lastDiffX) / (width / SCALE)) * (lastDiffX >= 0 ? 1 : -1);

        setNoTransition(false);
        fastRaf(() => {
          let newIndex = index() + addIndex;
          if(newIndex < 0) newIndex = 0;
          if(newIndex >= getCount()) newIndex = getCount() - 1;

          selectIndex(newIndex);
          setIsSwiping(false);
        });
      }
    });
  });

  onCleanup(() => {
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

    if(nextIndex !== currentIndex) setIndex(nextIndex);
    if(keys.length) {
      selectedKey = keys[nextIndex];
      hasSelectedKey = true;
    } else {
      selectedKey = undefined;
      hasSelectedKey = false;
    }
  });

  createEffect(() => {
    const i = index();
    if(itemsContainer) {
      itemsContainer.style.transform = TRANSLATE_TEMPLATE.replace('{x}', `${-i * 100}%`);
    }
  });

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

  const handlePrev = (e: Event) => {
    e.stopPropagation();
    if(index() > 0) {
      const newIndex = index() - 1;
      selectIndex(newIndex);
      props.onIndexChange?.(newIndex);
    }
  };

  const handleNext = (e: Event) => {
    e.stopPropagation();
    if(index() < (getCount() - 1)) {
      const newIndex = index() + 1;
      selectIndex(newIndex);
      props.onIndexChange?.(newIndex);
    }
  };

  return (
    <div
      ref={container}
      class={classNames(
        styles.Slideshow,
        isSwiping() && styles.IsSwiping,
        getCount() <= 1 && styles.IsSingle,
        noTransition() && styles.NoTransition,
        props.class
      )}
      onClick={handleClick}
    >
      <div
        ref={itemsContainer}
        class={styles.Items}
      >
        <For each={props.items}>{(item, i) => (
          <div class={styles.Item}>
            <Show when={Math.abs(i() - index()) < 5}>
              {props.children?.(item, i())}
            </Show>
          </div>
        )}</For>
      </div>

      <div class={styles.Tabs}>
        <For each={new Array(getCount())}>{(_, i) => (
          <div class={classNames(styles.Tab, i() === index() && styles.Active)} />
        )}</For>
      </div>

      <div class={classNames(styles.Arrow, styles.ArrowPrev)} onClick={handlePrev}>
        <IconTsx icon="avatarprevious" class={styles.ArrowIcon} />
      </div>
      <div class={classNames(styles.Arrow, styles.ArrowNext)} onClick={handleNext}>
        <IconTsx icon="avatarnext" class={styles.ArrowIcon} />
      </div>
    </div>
  );
}

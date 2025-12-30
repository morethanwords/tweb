import {createEffect, createMemo, createSignal, For, type JSX, on, onCleanup, untrack} from 'solid-js';
import {animate, cancelAnimationByKey} from '../helpers/animation';
import fastSmoothScroll from '../helpers/fastSmoothScroll';
import {keepMe} from '../helpers/keepMe';
import swipe, {SwipeDirectiveArgs} from '../helpers/useSwipe';
import useElementSize from '../hooks/useElementSize';
import {useIsCleaned} from '../hooks/useIsCleaned';
import {useScrollTop} from '../hooks/useScrollTop';
import {animateValue} from './mediaEditor/utils';
import styles from './verticalOptionWheel.module.scss';

keepMe(swipe);

type Option<V> = {
  value: V;
  label: JSX.Element;
}

const snapTimeout = 250;
const diffSampleCount = 5;
const scrollDuration = 320;
const optionSize = 40;
const dragThreshold = 10;

export const VerticalOptionWheel = <V, >(props: {
  /**
   * For now, changing the value from the parent component is not supported, it scrolls into view only on first render.
   * Still, make sure this is the latest value to prevent onChange firing too many times.
   */
  value: V;
  options: Option<V>[];
  onChange: (value: V) => void;
}) => {
  const [scrollable, setScrollable] = createSignal<HTMLDivElement>();
  const [hasScrolledInitially, setHasScrolledInitially] = createSignal(false);
  const [isDragging, setIsDragging] = createSignal(false);
  const [hasDraggedALittle, setHasDraggedALittle] = createSignal(false);

  const scrollTop = useScrollTop(scrollable);
  const size = useElementSize(scrollable);

  const isCleaned = useIsCleaned();

  const elementsAndOptions =
    createMemo(() => props.options.map((option, idx) => ({
      option,
      element: (
        <div class={styles.Option} onClick={[onOptionClick, idx]}>
          {option.label}
        </div>
      ) as HTMLDivElement
    })));

  createEffect(on(elementsAndOptions, () => {
    const localScrollable = scrollable();
    const localElementsAndOptions = elementsAndOptions();
    if(!localScrollable || !localElementsAndOptions.length) return;

    const selectedOptionIdx = Math.max(0, localElementsAndOptions.findIndex(({option}) => option.value === props.value));

    if(selectedOptionIdx) {
      localScrollable.scrollTop = selectedOptionIdx * optionSize;
    }
    setHasScrolledInitially(true);
  }));

  createEffect(() => {
    const localElementsAndOptions = elementsAndOptions();
    if(!localElementsAndOptions.length || !hasScrolledInitially()) return;

    let bestItem = localElementsAndOptions[0];
    let bestDiff = Infinity;

    for(const item of localElementsAndOptions) {
      const element = item.element;

      const diff = getDiff(element);
      const absDiff = Math.abs(diff);
      const distSigned = diff / size.height * 2;
      const dist = Math.abs(distSigned);

      if(absDiff < bestDiff) {
        bestItem = item;
        bestDiff = absDiff;
      }

      element.classList.toggle(styles.hidden, dist > 1);

      if(dist <= 1) {
        element.style.setProperty('--current-dist', `${dist}`);
        element.style.setProperty('--current-dist-sign', `${Math.sign(distSigned)}`);
      } else {
        element.style.removeProperty('--current-dist');
        element.style.removeProperty('--current-dist-sign');
      }
    }

    const prevValue = untrack(() => props.value);
    const newValue = bestItem.option.value;

    if(newValue !== prevValue) props.onChange(newValue);
  });


  let timeoutId: number;

  createEffect(() => {
    if(isDragging()) return;

    scrollTop();

    timeoutId = self.setTimeout(snapClosestToCenter, snapTimeout);

    onCleanup(() => {
      self.clearTimeout(timeoutId);
    });
  });

  onCleanup(() => {
    cancelSmoothScroll();
    cancelDeceleration?.();
  });

  let initialScroll = 0;
  let lastDiffs: number[] = []
  let cancelDeceleration: () => void;

  const swipeArgs: SwipeDirectiveArgs = {
    onStart: () => {
      initialScroll = scrollable()?.scrollTop ?? 0;
      lastDiffs = [];

      cancelDeceleration?.();
      cancelSmoothScroll();
      setIsDragging(true);
    },
    onMove: (_, yDiff) => {
      const localScrollable = scrollable();
      if(!localScrollable) return;

      lastDiffs = [yDiff, ...lastDiffs.slice(0, diffSampleCount - 1)];

      if(yDiff > dragThreshold) setHasDraggedALittle(true);

      localScrollable.scrollTop = initialScroll - yDiff;
    },
    onEnd: () => {
      cancelDeceleration = runDeceleration();
      setIsDragging(false);
      setTimeout(() => {
        setHasDraggedALittle(false);
      }, 0);
    }
  };

  function getDiff(element: HTMLElement) {
    const center = size.height / 2 + scrollTop();
    return center - (element.offsetTop + element.offsetHeight / 2);
  };

  function runDeceleration() {
    const localScrollable = scrollable();

    if(lastDiffs.length < 2 || !localScrollable) {
      lastDiffs = [];
      return;
    }

    let isCanceled = false;
    const deceleration = 0.1;
    const referenceFrameTime = 1000 / 60;

    let speed = 0;
    for(let i = 0; i < lastDiffs.length - 1; i++) {
      speed += lastDiffs[i + 1] - lastDiffs[i];
    }

    speed = speed / (lastDiffs.length - 1);

    let lastTime = performance.now();

    animate(() => {
      if(isCleaned() || isCanceled) return false;

      const time = performance.now();
      const deltaTime = time - lastTime;
      lastTime = time;

      localScrollable.scrollTop += speed;
      speed -= Math.sign(speed) * (deceleration * deltaTime / referenceFrameTime);

      if(Math.abs(speed) > 1) return true;

      lastDiffs = [];
    });

    return () => {
      isCanceled = true;
    };
  }

  function snapClosestToCenter() {
    const localScrollable = scrollable();
    const localElementsAndOptions = elementsAndOptions();
    if(!localElementsAndOptions.length || !localScrollable) return;

    let bestItem = localElementsAndOptions[0];
    let bestDiff = Infinity;

    for(const item of elementsAndOptions()) {
      const element = item.element;
      const diff = Math.abs(getDiff(element));

      if(diff < bestDiff) {
        bestItem = item;
        bestDiff = diff;
      }
    }

    fastSmoothScroll({
      container: localScrollable,
      element: bestItem.element,
      position: 'center',
      axis: 'y',
      forceDuration: scrollDuration
    });
  }

  function onOptionClick(idx: number) {
    const localScrollable = scrollable();
    if(!localScrollable || hasDraggedALittle()) return;

    animateValue(
      localScrollable.scrollTop,
      idx * optionSize,
      scrollDuration,
      (value) => {
        localScrollable.scrollTop = value;
      }
    );
  }

  function cancelSmoothScroll() {
    cancelAnimationByKey(scrollable());
  };

  return (
    <div class={styles.Container} style={{'--option-size': `${optionSize}px`}}>
      <div class={styles.Scrollable} ref={setScrollable} use:swipe={swipeArgs}>
        <div class={styles.EmptyOption} />
        <div class={styles.EmptyOption} />
        <For each={elementsAndOptions()}>
          {({element}) => element}
        </For>
        <div class={styles.EmptyOption} />
        <div class={styles.EmptyOption} />
      </div>

      <div class={`${styles.Divider} ${styles.upper}`} />
      <div class={`${styles.Divider} ${styles.lower}`} />
    </div>
  );
};

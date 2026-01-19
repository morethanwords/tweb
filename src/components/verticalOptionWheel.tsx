import {createEffect, createMemo, createSignal, For, type JSX, on, onCleanup, untrack} from 'solid-js';
import {animateValue} from '@helpers/animateValue';
import {animate} from '@helpers/animation';
import lastItem from '@helpers/array/lastItem';
import {keepMe} from '@helpers/keepMe';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import swipe, {SwipeDirectiveArgs} from '@helpers/useSwipe';
import useElementSize from '@hooks/useElementSize';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {useScrollTop} from '@hooks/useScrollTop';
import styles from '@components/verticalOptionWheel.module.scss';

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
const generousDiffError = 0.1;

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

    for(let i = 0; i < localElementsAndOptions.length; i++) {
      const item = localElementsAndOptions[i];
      const element = item.element;

      const diffSigned = calcDiffFromCenterFor(i);
      const diff = Math.abs(diffSigned);

      const distSigned = diffSigned / size.height * 2;
      const dist = Math.abs(distSigned);

      if(diff < bestDiff) {
        bestItem = item;
        bestDiff = diff;
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

  createEffect(() => {
    const localScrollable = scrollable();
    if(!localScrollable) return;

    subscribeOn(localScrollable)('wheel', () => {
      cancelSmoothScroll?.();
    }, {passive: true});
  })

  let cancelDeceleration: () => void;
  let cancelSmoothScroll: () => void;

  onCleanup(() => {
    cancelSmoothScroll?.();
    cancelDeceleration?.();
  });

  let initialScroll = 0;

  type DiffWithTime = {
    time: number;
    diff: number;
  };

  let lastDiffs: DiffWithTime[] = []

  // let c = -1;

  const swipeArgs: SwipeDirectiveArgs = {
    onStart: () => {
      initialScroll = scrollable()?.scrollTop ?? 0;
      lastDiffs = [];

      cancelDeceleration?.();
      cancelSmoothScroll?.();
      setIsDragging(true);
    },
    onMove: (_, yDiff) => {
      const localScrollable = scrollable();
      if(!localScrollable) return;

      // c = (c + 1) % 4;
      // if(c % 4 === 0) {
      pushDiffWithTime(yDiff);
      // }

      if(Math.abs(yDiff) > dragThreshold) setHasDraggedALittle(true);

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

  function calcDiffFromCenterFor(idx: number) {
    const center = size.height / 2 + scrollTop();
    return center - (idx + 2.5) * optionSize;
  };

  function runDeceleration() {
    const localScrollable = scrollable();

    if(lastDiffs.length < 2 || !localScrollable) {
      lastDiffs = [];
      return;
    }

    const endTime = performance.now();

    let isCanceled = false;
    const deceleration = 0.2;
    const referenceFrameTime = 1000 / 60;

    let speed = 0;
    for(let i = 0; i < lastDiffs.length - 1; i++) {
      speed += lastDiffs[i + 1].diff - lastDiffs[i].diff;
    }

    speed = speed * referenceFrameTime / (endTime - lastItem(lastDiffs).time);

    let lastTime = performance.now();
    let lastScrollTop = -1;

    animate(() => {
      if(isCleaned() || isCanceled) return false;

      const time = performance.now();
      const deltaTime = time - lastTime;
      lastTime = time;

      const currentScrollTop = localScrollable.scrollTop;

      if(currentScrollTop === lastScrollTop) return false; // hit an end

      lastScrollTop = localScrollable.scrollTop;
      localScrollable.scrollTop = lastScrollTop + speed;

      speed -= Math.sign(speed) * (deceleration * deltaTime / referenceFrameTime);

      return Math.abs(speed) > 1;
    });

    return () => {
      isCanceled = true;
    };
  }

  function pushDiffWithTime(yDiff: number) {
    lastDiffs = [{
      time: performance.now(),
      diff: yDiff
    }, ...lastDiffs.slice(0, diffSampleCount - 1)];
  }

  function snapClosestToCenter() {
    const localScrollable = scrollable();
    const localElementsAndOptions = elementsAndOptions();
    if(!localElementsAndOptions.length || !localScrollable) return;


    let bestIdx = 0;
    let bestDiff = Infinity;

    for(let i = 0; i < localElementsAndOptions.length; i++) {
      const diff = Math.abs(calcDiffFromCenterFor(i));

      if(diff < bestDiff) {
        bestIdx = i;
        bestDiff = diff;
      }
    }

    if(bestDiff > generousDiffError) scrollToIdx(bestIdx);
  }

  function onOptionClick(idx: number) {
    if(hasDraggedALittle()) return;

    scrollToIdx(idx);
  }

  function scrollToIdx(idx: number) {
    const localScrollable = scrollable();
    if(!localScrollable) return;

    cancelSmoothScroll?.();
    cancelSmoothScroll = animateValue(
      localScrollable.scrollTop,
      idx * optionSize,
      scrollDuration,
      (value) => {
        localScrollable.scrollTop = value;
      }
    );
  }

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

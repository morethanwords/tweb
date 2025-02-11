import SwipeHandler from '../components/swipeHandler';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import {animateSingle, cancelAnimationByKey} from '../helpers/animation';
import {CancellablePromise} from '../helpers/cancellablePromise';
import cancelEvent from '../helpers/dom/cancelEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import liteMode from '../helpers/liteMode';
import clamp from '../helpers/number/clamp';
import debounce from '../helpers/schedulers/debounce';
import {subscribeOn} from '../helpers/solid/subscribeOn';
import {createSignal, createMemo, onCleanup, createEffect} from 'solid-js';

const STATE_FOLDED = 1;
const STATE_UNFOLDED = 0;

export function useCollapsable(props: {
  scrollable: () => HTMLElement,
  listenWheelOn: HTMLElement,
  container: () => HTMLElement,
  shouldIgnore?: () => boolean,
  skipAnimationClassName?: string,
  disableHoverWhenFolded?: boolean
}) {
  const [progress, _setProgress] = createSignal(STATE_FOLDED);
  const [isTransition, setIsTransition] = createSignal(false);
  const folded = createMemo(() => progress() === STATE_FOLDED);

  const setProgress = (progress: number, skipAnimation?: boolean) => {
    if(liteMode.isAvailable('animations') && !skipAnimation) setIsTransition(true);
    _setProgress(progress);
  };

  const scrollTo = (wasProgress: number, open?: boolean) => {
    const startTime = Date.now();
    const _animation = animation = animateSingle(() => {
      const value = clamp((Date.now() - startTime) / 125, 0, 1);

      let progress = wasProgress;
      if((wasProgress > 0.5 || open === false) && open !== true) {
        progress += (1 - wasProgress) * value;
        animationOpening = false;
      } else {
        animationOpening = true;
        progress -= wasProgress * value;
      }

      setProgress(progress);
      return value < 1;
    }, props.container()).finally(() => {
      if(_animation === animation) {
        animation = undefined;
      }
    });
  };

  const clearAnimation = () => {
    cancelAnimationByKey(props.container());
  };

  let animation: CancellablePromise<void>, animationOpening: boolean;
  const onScrolled = () => {
    return;

    const wasProgress = progress();
    if(wasProgress >= 1 || wasProgress <= 0) {
      return;
    }

    scrollTo(wasProgress);
  };

  const debounced = debounce(onScrolled, 75, false, true);

  const onMove = (delta: number, e?: WheelEvent | TouchEvent) => {
    const scrollTop = props.scrollable().scrollTop;
    const isWheel = e instanceof WheelEvent;
    if(isWheel || true) {
      const newState = delta < 0 ? STATE_UNFOLDED : STATE_FOLDED;
      if((scrollTop && progress() !== STATE_UNFOLDED) || debounced.isDebounced()) {
        debounced();
        return;
      }

      if(progress() === newState) {
        return;
      }

      e && cancelEvent(e);
      setProgress(newState);
      return;
    }

    const wasProgress = progress();
    props.container().classList.add(props.skipAnimationClassName);

    // if user starts to scroll down when it's being opened
    if(delta > 0 && animation && animationOpening) {
      debounced.clearTimeout();
      scrollTo(wasProgress, false);
      return;
    }

    if(
      animation ||
      (wasProgress >= STATE_FOLDED && delta > 0) ||
      (wasProgress <= STATE_UNFOLDED && delta <= 0)/*  ||
      (scrollTop && progress() !== STATE_UNFOLDED) */
    ) {
      return;
    }

    // if(animation) {
    //   cancelEvent(e);
    //   return;
    // }

    let value = delta / 600;
    value = clamp(wasProgress + value, 0, 1);
    setProgress(value);
    if(value >= 1 || value <= 0) {
      debounced.clearTimeout();
      onScrolled();
    } else {
      e && cancelEvent(e);
      debounced();
    }
  };

  const onWheel = (e: WheelEvent) => {
    if(props.shouldIgnore?.()) {
      return;
    }

    const wheelDeltaY = (e as any).wheelDeltaY as number;
    const delta: number = -wheelDeltaY;
    onMove(delta, e);
  };
  subscribeOn(props.listenWheelOn)('wheel', onWheel, {passive: false});

  if(IS_TOUCH_SUPPORTED) {
    const swipeHandler = new SwipeHandler({
      element: props.listenWheelOn,
      onSwipe: (xDiff, yDiff, e) => {
        const delta = -yDiff;
        onMove(delta, e as any as TouchEvent);
      },
      cancelEvent: false,
      cursor: '',
      verifyTouchTarget: (e) => {
        return e instanceof TouchEvent && !props.shouldIgnore?.() && !findUpClassName(e.target, 'folders-tabs-scrollable');
      }
    });

    onCleanup(() => {
      swipeHandler.removeListeners();
    });
  }

  const unfold = (e?: MouseEvent) => {
    const wasProgress = progress();
    if(wasProgress !== STATE_UNFOLDED) {
      // scrollTo(wasProgress, true);
      clearAnimation();
      setProgress(STATE_UNFOLDED);
      e && cancelEvent(e);
    }
  };

  const fold = () => {
    scrollTo(progress(), false);
  };

  createEffect(() => {
    const container = props.container();
    if(!container) {
      return;
    }

    container.classList.toggle('disable-hover', (props.disableHoverWhenFolded ? folded() : false) || isTransition());
    props.skipAnimationClassName && container.classList.toggle(props.skipAnimationClassName, folded() && !isTransition());
  });

  createEffect(() => {
    const container = props.container();
    if(!container) {
      return;
    }

    subscribeOn(container)('transitionstart', (e) => e.target === container && setIsTransition(true));
    subscribeOn(container)('transitionend', (e) => e.target === container && setIsTransition(false));
  });

  return {folded, unfold, fold, progress, clearAnimation, isTransition, STATE_FOLDED, STATE_UNFOLDED};
}

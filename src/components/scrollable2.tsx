/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {children, createContext, createEffect, createMemo, createSignal, JSX, on, onCleanup, Ref} from 'solid-js';
import {IS_OVERLAY_SCROLL_SUPPORTED} from '@environment/overlayScrollSupport';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE_SAFARI, IS_SAFARI} from '@environment/userAgent';
import cancelEvent from '@helpers/dom/cancelEvent';
import classNames from '@helpers/string/classNames';
import useHeavyAnimationCheck from '@hooks/useHeavyAnimationCheck';

const SCROLL_THROTTLE = /* IS_ANDROID ? 200 :  */24;
const USE_OWN_SCROLL = !IS_OVERLAY_SCROLL_SUPPORTED;

let throttleMeasurement: (callback: () => void) => number,
  cancelMeasurement: (id: number) => void;
if(USE_OWN_SCROLL) {
  throttleMeasurement = (callback) => requestAnimationFrame(callback);
  cancelMeasurement = (id) => cancelAnimationFrame(id);
} else {
  throttleMeasurement = (callback) => window.setTimeout(callback, SCROLL_THROTTLE);
  cancelMeasurement = (id) => window.clearTimeout(id);
}

export type ScrollableContextValue = {
  scrollPosition: number,
  scrollSize: number,
  clientSize: number,
  offsetSize: number,
  getDistanceToEnd: () => number,
  container: HTMLDivElement,
  onSizeChange: () => void,
  setScrollPositionSilently: (value: number) => void
};

export const ScrollableContext = createContext<ScrollableContextValue>();

export default function Scrollable(props: {
  children: JSX.Element,
  ref?: Ref<HTMLDivElement>,
  thumbRef?: (el: HTMLDivElement) => void,
  class?: string,
  classList?: JSX.HTMLAttributes<HTMLDivElement>['classList'],
  axis?: 'x' | 'y',
  withBorders?: 'both' | 'top' | 'bottom' | 'manual',
  onScrolledTop?: () => void,
  onScrolledBottom?: () => void,
  onScroll?: () => void,
  onScrollOffset?: number,
  relative?: boolean
}) {
  const axis = props.axis ?? 'y';
  const scrollPositionProperty: 'scrollTop' | 'scrollLeft' = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  const scrollSizeProperty: 'scrollHeight' | 'scrollWidth' = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
  const clientSizeProperty: 'clientHeight' | 'clientWidth' = axis === 'x' ? 'clientWidth' : 'clientHeight';
  const offsetSizeProperty: 'offsetHeight' | 'offsetWidth' = axis === 'x' ? 'offsetWidth' : 'offsetHeight';
  const clientAxis: 'clientY' | 'clientX' = axis === 'x' ? 'clientX' : 'clientY';

  const [ignoreScrollEvent, setIgnoreScrollEvent] = createSignal(false);
  const scrollPosition = () => ref[scrollPositionProperty];
  const setScrollPosition = (value: number) => ref[scrollPositionProperty] = value;
  const scrollSize = () => ref[scrollSizeProperty];
  const clientSize = () => ref[clientSizeProperty];
  const offsetSize = () => ref[offsetSizeProperty];
  const getDistanceToEnd = () => scrollSize() - Math.round(scrollPosition() + offsetSize());

  const onScrollOffset = createMemo(() => props.onScrollOffset ?? 300);

  let lastScrollDirection: -1 | 0 | 1 = 0;
  let lastScrollPosition = 0;

  let startMousePosition: number;
  let startScrollPosition: number;

  let isHeavyAnimationInProgress = false;
  let needCheckAfterAnimation = false;

  const [isScrolledToStart, setIsScrolledToStart] = createSignal(true);
  const [isScrolledToEnd, setIsScrolledToEnd] = createSignal(true);

  let onScrollMeasure = 0;

  const removeHeavyAnimationListener = useHeavyAnimationCheck(() => {
    isHeavyAnimationInProgress = true;

    if(onScrollMeasure) {
      cancelMeasure();
      needCheckAfterAnimation = true;
    }
  }, () => {
    isHeavyAnimationInProgress = false;

    if(needCheckAfterAnimation) {
      onScroll();
      needCheckAfterAnimation = false;
    }
  });

  onCleanup(removeHeavyAnimationListener);

  const onScroll = () => {
    // if(this.debug) {
    // this.log('onScroll call', this.onScrollMeasure);
    // }

    // return;

    if(isHeavyAnimationInProgress) {
      cancelMeasure();
      needCheckAfterAnimation = true;
      return;
    }

    // if(this.onScrollMeasure || ((this.scrollLocked || (!this.onScrolledTop && !this.onScrolledBottom)) && !this.splitUp && !this.onAdditionalScroll)) return;
    if((!props.onScrolledTop && !props.onScrolledBottom)/*  && !this.splitUp */ && !onScrollCallbacks().length && !USE_OWN_SCROLL) return;
    if(onScrollMeasure) return;
    onScrollMeasure = throttleMeasurement(() => {
      onScrollMeasure = 0;

      const _scrollPosition = scrollPosition();
      lastScrollDirection = lastScrollPosition === _scrollPosition ? 0 : (lastScrollPosition < _scrollPosition ? 1 : -1); // * 1 - bottom, -1 - top
      lastScrollPosition = _scrollPosition;

      updateThumb(_scrollPosition);

      // lastScrollDirection check is useless here, every callback should decide on its own
      if(true/*  && lastScrollDirection !== 0 */) {
        onScrollCallbacks().forEach((callback) => callback());
      }

      checkForTriggers();
    });
  };

  const cancelMeasure = () => {
    if(onScrollMeasure) {
      cancelMeasurement(onScrollMeasure);
      onScrollMeasure = 0;
    }
  };

  const checkForTriggers = () => {
    if(!props.onScrolledTop && !props.onScrolledBottom) return;

    // if(this.isHeavyAnimationInProgress) {
    //   this.onScroll();
    //   return;
    // }

    const _scrollSize = scrollSize();
    if(!_scrollSize) { // незачем вызывать триггеры если блок пустой или не виден
      return;
    }

    const _scrollPosition = scrollPosition();
    const _clientSize = offsetSize();
    const _onScrollOffset = onScrollOffset();
    const maxScrollPosition = _scrollSize - _clientSize;

    // this.log('checkForTriggers:', scrollTop, maxScrollTop);

    if(props.onScrolledTop && _scrollPosition <= _onScrollOffset && lastScrollDirection <= 0/* && direction === -1 */) {
      props.onScrolledTop();
    }

    if(props.onScrolledBottom && (maxScrollPosition - _scrollPosition) <= _onScrollOffset && lastScrollDirection >= 0/* && direction === 1 */) {
      props.onScrolledBottom();
    }
  };

  const checkEnds = () => {
    setIsScrolledToStart(!scrollPosition());
    setIsScrolledToEnd(getDistanceToEnd() <= 1);
  };

  const updateThumb = (_scrollPosition = scrollPosition()) => {
    if(!USE_OWN_SCROLL || !thumbRef) {
      return;
    }

    const _scrollSize = scrollSize();
    const _clientSize = clientSize();
    const divider = _scrollSize / _clientSize / 0.75;
    const thumbSize = Math.max(20, _clientSize / divider);
    const value = _scrollPosition / (_scrollSize - _clientSize) * _clientSize;
    // const b = (scrollPosition + clientSize) / scrollSize;
    const b = _scrollPosition / (_scrollSize - _clientSize);
    const maxValue = _clientSize - thumbSize;
    if(_clientSize < _scrollSize) {
      thumbRef.style.height = thumbSize + 'px';
      // this.thumb.style.top = `${Math.min(maxValue, value - thumbSize * b)}px`;
      thumbRef.style.transform = `translateY(${Math.min(maxValue, value - thumbSize * b)}px)`;
    } else {
      thumbRef.style.height = '0px';
    }
  };

  const setScrollPositionSilently = (value: number) => {
    lastScrollPosition = value;
    ignoreNextScrollEvent();

    setScrollPosition(value);
  };

  const ignoreNextScrollEvent = () => {
    setIgnoreScrollEvent(true);
    ref.addEventListener('scroll', (e) => {
      cancelEvent(e);
      setIgnoreScrollEvent(false);
      // this.addScrollListener();
    }, {capture: true, passive: false, once: true});
  };

  const onScrollCallbacks = createMemo(() => [props.onScroll, props.withBorders && checkEnds].filter(Boolean));

  const onThumbMouseMove = (e: MouseEvent) => {
    cancelEvent(e);

    const contentHeight = scrollSize();
    const viewportHeight = clientSize();
    const scrollbarSize = thumbRef.offsetHeight;
    const maxScrollTop = contentHeight - viewportHeight;

    const maxScrollbarOffset = viewportHeight - scrollbarSize;
    const deltaY = e[clientAxis] - startMousePosition;
    const scrollAmount = (deltaY / maxScrollbarOffset) * maxScrollTop;
    const newScrollTop = startScrollPosition + scrollAmount;

    ref[scrollPositionProperty] = newScrollTop;
  };

  const onThumbMouseDown = (e: MouseEvent) => {
    cancelEvent(e);
    startMousePosition = e[clientAxis];
    startScrollPosition = scrollPosition();
    (e.target as HTMLElement).classList.add('is-focused');

    window.addEventListener('mousemove', onThumbMouseMove);
    window.addEventListener('mouseup', onThumbMouseUp, {once: true});
  };

  const onThumbMouseUp = (e: MouseEvent) => {
    window.removeEventListener('mousemove', onThumbMouseMove);
    thumbRef.classList.remove('is-focused');
  };

  const onWheel = (e: WheelEvent) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if(!e.deltaX && target.scrollWidth > target.clientWidth) {
      target.scrollLeft += e.deltaY / 4;
      cancelEvent(e);
    }
  };

  const onSizeChange = () => {
    if(USE_OWN_SCROLL && thumbRef) {
      onScroll();
    }
  };

  const value: ScrollableContextValue = {
    get scrollPosition() {
      return scrollPosition();
    },
    get scrollSize() {
      return scrollSize();
    },
    get clientSize() {
      return clientSize();
    },
    get offsetSize() {
      return offsetSize();
    },
    getDistanceToEnd,
    get container() {
      return ref;
    },
    onSizeChange,
    setScrollPositionSilently
  };

  const resolvedChildren = children(() => {
    return (
      <ScrollableContext.Provider value={value}>
        {props.children}
      </ScrollableContext.Provider>
    );
  });

  createEffect(on(resolvedChildren, onSizeChange));

  let ref: HTMLDivElement, thumbRef: HTMLDivElement;
  return (
    <div
      ref={(_ref) => {
        ref = _ref;
        (props.ref as any)?.(_ref);
      }}
      class={classNames(
        'scrollable',
        `scrollable-${axis}`,
        props.class,
        props.relative && 'relative',
        IS_SAFARI && !IS_MOBILE_SAFARI && 'no-scrollbar',
        ...(props.withBorders ? [
          isScrolledToStart() && 'scrolled-start',
          isScrolledToEnd() && 'scrolled-end',
          axis === 'y' && 'scrollable-y-bordered',
          (props.withBorders === 'top' || props.withBorders === 'both') && 'scrollable-y-bordered-top',
          (props.withBorders === 'bottom' || props.withBorders === 'both') && 'scrollable-y-bordered-bottom'
        ] : [])
      )}
      onScroll={!ignoreScrollEvent() && onScroll}
      onWheel={(axis === 'x' && !IS_TOUCH_SUPPORTED && onWheel) || undefined}
    >
      {USE_OWN_SCROLL && axis === 'y' && (
        <div class="scrollable-thumb-container">
          <div
            class="scrollable-thumb"
            ref={(el) => {
              thumbRef = el;
              props.thumbRef?.(el);
            }}
            onMouseDown={onThumbMouseDown}
          ></div>
        </div>
      )}
      {resolvedChildren()}
    </div>
  );
}

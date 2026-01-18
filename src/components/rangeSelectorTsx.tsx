/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, onMount, onCleanup, createEffect} from 'solid-js';
import attachGrabListeners, {GrabEvent} from '@helpers/dom/attachGrabListeners';
import clamp from '@helpers/number/clamp';
import I18n from '@lib/langPack';

export interface RangeSelectorProps {
  step: number;
  min?: number;
  max?: number;
  withTransition?: boolean;
  useTransform?: boolean;
  vertical?: boolean;
  useProperty?: boolean;
  offsetAxisValue?: number;
  value?: number;
  onMouseDown?: (event: GrabEvent) => void;
  onMouseUp?: (event: GrabEvent) => void;
  onScrub?: (value: number) => void;
}

export default function RangeSelector(props: RangeSelectorProps) {
  const [mousedown, setMousedown] = createSignal(false);
  const [rect, setRect] = createSignal<DOMRect>();
  const [value, setValue] = createSignal(props.value || 0);
  let containerRef: HTMLDivElement;
  let filledRef: HTMLDivElement;
  let seekRef: HTMLInputElement;
  let removeListeners: (() => void) | null = null;

  const min = props.min ?? 0;
  const max = props.max ?? 0;
  const step = props.step;
  const withTransition = props.withTransition || false;
  const useTransform = props.useTransform || false;
  const useProperty = props.useProperty || false;
  const vertical = props.vertical || false;
  const offsetAxisValue = props.offsetAxisValue || 0;

  const stepStr = '' + step;
  const index = stepStr.indexOf('.');
  const decimals = index === -1 ? 0 : stepStr.length - index - 1;

  const setFilled = (val: number) => {
    let percents = (val - min) / (max - min);
    percents = clamp(percents, 0, 1);

    // using scaleX and width even with vertical because it will be rotated
    if(useTransform) {
      filledRef.style.transform = `scaleX(${percents})`;
    } else if(useProperty) {
      containerRef.style.setProperty('--progress', '' + percents);
    } else {
      filledRef.style.width = (percents * 100) + '%';
    }
  };

  const setProgress = (val: number) => {
    seekRef.value = '' + val;
    setFilled(+seekRef.value); // clamp
    setValue(+seekRef.value);
  };

  const onInput = () => {
    const val = +seekRef.value;
    setFilled(val);
    setValue(val);
    props.onScrub?.(val);
  };

  const onMouseMove = (event: GrabEvent) => {
    scrub(event);
  };

  const onMouseDown = (event: GrabEvent) => {
    setRect(containerRef.getBoundingClientRect());
    setMousedown(true);
    scrub(event);
    containerRef.classList.add('is-focused');
    props.onMouseDown?.(event);
  };

  const onMouseUp = (event: GrabEvent) => {
    setMousedown(false);
    containerRef.classList.remove('is-focused');
    props.onMouseUp?.(event);
  };

  const scrub = (event: GrabEvent, snapValue?: (value: number) => number) => {
    const currentRect = rect();
    if(!currentRect) return 0;

    let rectMax = vertical ? currentRect.height : currentRect.width;

    if(offsetAxisValue) {
      rectMax -= offsetAxisValue;
    }

    let offsetAxisValue_ = clamp(
      vertical ?
        -(event.y - currentRect.bottom) :
        event.x - currentRect.left - offsetAxisValue / 2,
      0,
      rectMax
    );

    if(!vertical && I18n.isRTL) {
      offsetAxisValue_ = rectMax - offsetAxisValue_;
    }

    let val = min + (offsetAxisValue_ / rectMax * (max - min));

    if((val - min) < ((max - min) / 2)) {
      val -= step / 10;
    }

    val = +val.toFixed(decimals);
    val = clamp(val, min, max);
    if(snapValue) val = snapValue(val);

    setProgress(val);
    props.onScrub?.(val);

    return val;
  };

  onMount(() => {
    // Set initial value
    if(props.value) {
      setProgress(props.value);
    }

    removeListeners = attachGrabListeners(containerRef, onMouseDown, onMouseMove, onMouseUp);
  });

  onCleanup(() => {
    removeListeners?.();
  });

  // Update value when props change
  createEffect(() => {
    if(props.value !== undefined) {
      setProgress(props.value);
    }
  });

  return (
    <div
      ref={containerRef!}
      class={`progress-line ${useTransform ? 'use-transform' : ''} ${withTransition ? 'with-transition' : ''}`}
    >
      <div ref={filledRef!} class="progress-line__filled" />
      <input
        ref={seekRef!}
        class="progress-line__seek"
        type="range"
        step={step}
        min={min}
        max={max}
        value={value()}
        onInput={onInput}
      />
    </div>
  );
}

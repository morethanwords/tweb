import {batch, createEffect, createMemo, createSignal, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import ListenerSetter from '../../helpers/listenerSetter';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {logger} from '../../lib/logger';

import {animateValue} from '../mediaEditor/utils';
import {observeResize} from '../resizeObserver';
import DotRenderer from '../dotRenderer';
import type {AnimationItemGroup} from '../animationIntersector';

import {drawImageFromSource} from './drawImageFromSource';
import {
  computeMaxDistToMargin,
  CustomDOMRect,
  getInnerCustomRect,
  getTimeForDist,
  isMouseCloseToAnySpoilerElement,
  SPAN_BOUNDING_BOX_THRESHOLD_Y,
  toDOMRectArray,
  UnwrapEasing
} from './utils';

type MessageSpoilerOverlayProps = {
  messageElement: HTMLDivElement;
  animationGroup: AnimationItemGroup;
};

type InternalMessageSpoilerOverlayProps = MessageSpoilerOverlayProps & {
  parentElement: HTMLDivElement;
  controlsRef: (controls: MessageSpoilerOverlayControls) => void;
};

type MessageSpoilerOverlayControls = {
  update: () => void;
};

const UNWRAPPED_TIMEOUT_MS = 10e3;

const log = logger('spoiler-overlay');

function MessageSpoilerOverlay(props: InternalMessageSpoilerOverlayProps) {
  const [spanRects, setSpanRects] = createSignal<CustomDOMRect[]>([]);
  const [backgroundColor, setBackgroundColor] = createSignal('transparent');
  const [unwrapProgress, setUnwrapProgress] = createSignal<number>(0);
  const [clickCoordinates, setClickCoordinates] = createSignal<[number, number]>();
  const [maxDist, setMaxDist] = createSignal<number>();
  const [rendererInitResult, setRendererInitResult] =
    createSignal<ReturnType<typeof DotRenderer.attachTextSpoilerTarget>>();

  const dpr = createMemo(() => rendererInitResult()?.dpr || window.devicePixelRatio);

  const controls: MessageSpoilerOverlayControls = {
    update() {
      update();
    }
  };

  props.controlsRef(controls);

  let unwrapTimeout: number;
  let cancelAnimation: () => void;

  onMount(() => {
    update();

    const listenerSetter = new ListenerSetter();
    listenerSetter.add(props.messageElement)('click', onMessageClick, true);
    listenerSetter.add(props.messageElement)('mousemove', onMessageHover);
    listenerSetter.add(props.messageElement)('mouseout', onMessageOut);

    const unobserve = observeResize(props.parentElement, () => {
      update();
    });

    attachDotRendererTarget();

    onCleanup(() => {
      cancelAnimation?.();
      window.clearTimeout(unwrapTimeout);
      listenerSetter.removeAll();
      unobserve();

      const bubble = props.messageElement.closest('[data-mid]') as HTMLElement;
      log('cleaning-up', bubble?.dataset.mid);
    });
  });

  createEffect(() => {
    updateCanvasSize();
  });

  const canvas = (
    <canvas
      class="message-spoiler-overlay__canvas"
      classList={{
        'message-spoiler-overlay__canvas--hidden': unwrapProgress() === 1
      }}
    />
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  async function attachDotRendererTarget() {
    const middlewareHelper = createMiddleware();

    onCleanup(() => {
      middlewareHelper.destroy();
    });

    const initResult = DotRenderer.attachTextSpoilerTarget({
      animationGroup: props.animationGroup,
      canvas,
      draw,
      middleware: middlewareHelper.get()
    });
    await initResult.readyResult;

    setRendererInitResult(initResult);
  }

  function update() {
    batch(() => {
      updateCanvasSize();
      updateSpanRects();
      updateBackgroundColor();
    });
  }

  function updateCanvasSize() {
    // const bubble = props.messageElement.closest('[data-mid]') as HTMLElement;
    const rect = props.parentElement.getBoundingClientRect();
    // console.log('rect, bubble.id :>> ', rect, bubble.dataset.mid);
    canvas.width = rect.width * dpr();
    canvas.height = rect.height * dpr();
  }

  function updateSpanRects() {
    const parentRect = props.parentElement.getBoundingClientRect();
    const spoilers = props.messageElement.querySelectorAll('.spoiler-text');

    const rects: DOMRect[] = [];

    spoilers.forEach((_el) => {
      const el = _el as HTMLElement;
      rects.push(...toDOMRectArray(el.getClientRects()));
    });

    const adjustedRects: CustomDOMRect[] = rects.map((spoilerRect) => getInnerCustomRect(parentRect, spoilerRect));

    setSpanRects(adjustedRects);
  }

  function updateBackgroundColor() {
    let bg: string = 'transparent';
    const targetElement = props.messageElement.parentElement;
    if(targetElement) {
      const computedStyle = window.getComputedStyle(targetElement);
      bg = computedStyle.backgroundColor;
    }

    setBackgroundColor(bg);
  }

  function onMessageClick(e: MouseEvent) {
    if(!isMouseCloseToAnySpoilerElement(e, props.parentElement, spanRects())) return;

    if(unwrapProgress()) {
      // if(DEBUG)
      returnToInitial();
      return;
    }

    e.stopImmediatePropagation();

    const rect = props.parentElement.getBoundingClientRect();

    setClickCoordinates([e.clientX - rect.left, e.clientY - rect.top]);
    setMaxDist(computeMaxDistToMargin(e, rect) + 20);

    cancelAnimation = animateValue(0, 1, getTimeForDist(maxDist()), setUnwrapProgress, {
      easing: UnwrapEasing,
      onEnd: () => {
        unwrapTimeout = window.setTimeout(() => {
          returnToInitial();
        }, UNWRAPPED_TIMEOUT_MS);
      }
    });
  }

  // There is some space between span lines, so we need to manually set the cursor because of this
  function onMessageHover(e: MouseEvent) {
    props.messageElement.classList.toggle(
      'is-hovering-spoiler',
      isMouseCloseToAnySpoilerElement(e, props.parentElement, spanRects())
    );
  }

  function onMessageOut() {
    props.messageElement.classList.remove('is-hovering-spoiler');
  }

  function returnToInitial() {
    cancelAnimation?.();
    window.clearTimeout(unwrapTimeout);

    if(unwrapProgress() !== 1) {
      cancelAnimation = animateValue(unwrapProgress(), 0, 200, setUnwrapProgress, {
        onEnd: () => {
          batch(() => {
            setClickCoordinates();
            setMaxDist();
          });
        }
      });
    } else {
      batch(() => {
        setUnwrapProgress(0);
        setClickCoordinates();
        setMaxDist();
      });
    }
  }

  function draw() {
    drawSpoilerRects();
    drawClippingCircle();
  }

  function timesDpr<T extends number[]>(...values: T) {
    return values.map((value) => value * dpr()) as T;
  }

  function drawSpoilerRects() {
    const bg = backgroundColor();
    const rects = spanRects();
    const progress = unwrapProgress();
    const initialCoords = clickCoordinates();

    if(!rects) return;

    const {sourceCanvas} = rendererInitResult() || {};

    for(const rect of rects) {
      const x = rect.left; // - offset;
      const y = rect.top - SPAN_BOUNDING_BOX_THRESHOLD_Y;
      const dw = rect.width; // + offset * 2;
      const dh = rect.height + SPAN_BOUNDING_BOX_THRESHOLD_Y * 2;

      ctx.fillStyle = bg;
      // ctx.fillStyle = 'red';
      ctx.fillRect(...timesDpr(x, y, dw, dh));

      if(!sourceCanvas) continue;

      if(!initialCoords) {
        drawImageFromSource(ctx, sourceCanvas, ...timesDpr(x, y, dw, dh, x, y, dw, dh));
        continue;
      }

      const scaledProgress = progress * 0.125;
      drawImageFromSource(
        ctx,
        sourceCanvas,
        ...timesDpr(
          x + (initialCoords[0] - x) * scaledProgress,
          y + (initialCoords[1] - y) * scaledProgress,
          dw * (1 - scaledProgress),
          dh * (1 - scaledProgress),
          x,
          y,
          dw,
          dh
        )
      );
    }
  }

  function drawClippingCircle() {
    const initialCoords = clickCoordinates();
    const radius = maxDist();
    if(!initialCoords || !radius) return;

    const progress = unwrapProgress();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'white';
    ctx.shadowBlur = 200 * dpr() * progress + 60;
    ctx.shadowColor = 'white';
    ctx.beginPath();
    ctx.arc(...timesDpr(initialCoords[0], initialCoords[1], radius * progress), 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  return <>{canvas}</>;
}

export function createMessageSpoilerOverlay(props: MessageSpoilerOverlayProps) {
  const element = document.createElement('div');
  element.classList.add('message-spoiler-overlay');

  let controls: MessageSpoilerOverlayControls;

  const dispose = render(
    () => (
      <MessageSpoilerOverlay
        parentElement={element}
        controlsRef={(value) => {
          controls = value;
        }}
        {...props}
      />
    ),
    element
  );

  return {
    element,
    get controls() {
      return controls;
    },
    dispose
  };
}

import {batch, createEffect, createMemo, createSignal, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import ListenerSetter from '../../helpers/listenerSetter';
import createMiddleware from '../../helpers/solid/createMiddleware';
import {logger} from '../../lib/logger';
import type SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import {useHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import debounce from '../../helpers/schedulers/debounce';
import {animate} from '../../helpers/animation';

import {animateValue} from '../mediaEditor/utils';
import DotRenderer from '../dotRenderer';
import type {AnimationItemGroup} from '../animationIntersector';
import {observeResize} from '../resizeObserver';

import {drawImageFromSource} from './drawImageFromSource';
import {
  adjustSpaceBetweenCloseRects,
  computeMaxDistToMargin,
  CustomDOMRect,
  getCustomDOMRectsForSpoilerSpan,
  getParticleColor,
  getTimeForDist,
  isMouseCloseToAnySpoilerElement,
  UnwrapEasing,
  waitResizeToBePainted
} from './utils';

type MessageSpoilerOverlayProps = {
  mid: number;
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
  const {rootScope} = useHotReloadGuard();

  const [spanRects, setSpanRects] = createSignal<CustomDOMRect[]>([]);
  const [backgroundColor, setBackgroundColor] = createSignal('transparent'); // For now is just as fallback if inner spans fail to compute individual color
  const [particleColor, setParticleColor] = createSignal(getParticleColor());
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
    // const resizeObserver = new ResizeObserver(resizeObserverCallback);
    const unobserve = observeResize(props.parentElement, debounce(resizeObserverCallback, 100));

    listenerSetter.add(props.messageElement)('click', onMessageClick, true);
    listenerSetter.add(props.messageElement)('mousemove', onMessageHover);
    listenerSetter.add(props.messageElement)('mouseout', onMessageOut);
    // listenerSetter.add(window)('blur', returnToInitial);
    listenerSetter.add(rootScope)('chat_background_set', onChatBackgroundSet);

    listenerSetter.add(rootScope)('theme_changed', () => {
      setTimeout(() => {
        update();
      }, 200);
    });
    // resizeObserver.observe(props.parentElement);

    attachDotRendererTarget();

    onCleanup(() => {
      cancelAnimation?.();
      window.clearTimeout(unwrapTimeout);
      listenerSetter.removeAll();
      unobserve();
      // resizeObserver.disconnect();

      log('cleaning-up', props.mid);
    });
  });

  const canShowSpoilers = createMemo(() => rendererInitResult() && spanRects().length);

  createEffect(() => {
    if(canShowSpoilers()) {
      setTimeout(() => {
        props.parentElement.closest('.spoilers-container')?.classList.add('can-show-spoiler-text')
      }, 400);
    }
  });

  createEffect(() => {
    // Hide text when collapsing / uncollapsing blockquote
    if(!spanRects().length && unwrapProgress() === 0) {
      props.parentElement.closest('.spoilers-container')?.classList.remove('can-show-spoiler-text')
    }
  });


  /**
   * If it fails the first time to compute the rects, try again after some time
  */
  let failTimeout: number;
  createEffect(() => {
    if(spanRects().length) return;

    failTimeout ||= window.setTimeout(() => {
      failTimeout = undefined;
      if(spanRects().length) return;

      update();
    }, 3000);
  });

  const canvas = (
    <canvas
      class="message-spoiler-overlay__canvas"
      classList={{
        'message-spoiler-overlay__canvas--hidden': unwrapProgress() === 1 || !canShowSpoilers()
      }}
    />
  ) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');

  const offScreenCanvas = (
    <canvas />
  ) as HTMLCanvasElement;
  const offScreenCtx = offScreenCanvas.getContext('2d');


  //


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
      updateColors();
    });
  }

  async function resizeObserverCallback(entry: ResizeObserverEntry) {
    if(!entry) return;

    resetBeforeResize(); // When opening / closing collapsible blockquote
    await waitResizeToBePainted(entry);
    update();
    draw();
  }

  function resetBeforeResize() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSpanRects([]);
  }

  createEffect(() => {
    updateCanvasSize(); // React to dpr() change
  });

  function updateCanvasSize() {
    const rect = props.parentElement.getBoundingClientRect();

    offScreenCanvas.width =
    canvas.width = rect.width * dpr();

    offScreenCanvas.height =
    canvas.height = rect.height * dpr();
  }

  function updateSpanRects() {
    const parentRect = props.parentElement.getBoundingClientRect();
    const spoilers = Array.from(props.messageElement.querySelectorAll('.spoiler-text'));

    const rects = spoilers.map((el) => getCustomDOMRectsForSpoilerSpan(el as HTMLElement, parentRect)).flat();
    const adjustedRects = adjustSpaceBetweenCloseRects(rects);
    setSpanRects(adjustedRects);
  }

  function updateColors() {
    batch(() => {
      updateBackgroundColor();
      updateParticleColor();
    });
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

  function updateParticleColor() {
    setParticleColor(getParticleColor());
  }

  function onMessageClick(e: MouseEvent) {
    if(!isMouseCloseToAnySpoilerElement(e, props.parentElement, spanRects())) return;

    if(unwrapProgress()) {
      // returnToInitial();
      return;
    }

    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();

    const rect = props.parentElement.getBoundingClientRect();

    setClickCoordinates([e.clientX - rect.left, e.clientY - rect.top]);
    setMaxDist(computeMaxDistToMargin(e, rect, spanRects() || []) + 20);

    props.messageElement.classList.remove('is-hovering-spoiler');

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
    if(unwrapProgress()) return;
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
      if(rendererInitResult()?.animation.paused) {
        animate(() => {
          draw();
        });
      }
    }
  }

  function onChatBackgroundSet() {
    resetBeforeResize();
    setTimeout(() => {
      update();
      draw();
    }, 200);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      const x = rect.left;
      const y = Math.max(0, rect.top);
      const dw = rect.width;
      const dh = rect.height;

      ctx.fillStyle = rect.color || bg;
      // ctx.fillStyle = 'red';
      ctx.fillRect(...timesDpr(x, y, dw, dh));

      if(!sourceCanvas) continue;

      offScreenCtx.clearRect(...timesDpr(x, y, dw, dh));
      if(!initialCoords) {
        drawImageFromSource(offScreenCtx, sourceCanvas, ...timesDpr(x, y, dw, dh, x, y, dw, dh));
      } else {
        const scaledProgress = progress ** 2 /* * Math.sqrt(progress) */ * 0.4;
        drawImageFromSource(
          offScreenCtx,
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

      offScreenCtx.globalCompositeOperation = 'source-atop';

      offScreenCtx.fillStyle = particleColor();
      offScreenCtx.fillRect(...timesDpr(x, y, dw, dh));

      offScreenCtx.globalCompositeOperation = 'source-over';

      ctx.drawImage(offScreenCanvas, ...timesDpr(x, y, dw, dh, x, y, dw, dh));
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
    ctx.shadowBlur = radius / 3.5 * dpr() * progress;
    ctx.shadowColor = 'white';
    ctx.beginPath();
    ctx.arc(...timesDpr(initialCoords[0], initialCoords[1], radius * progress), 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  return <>{canvas}</>;
}

export function createMessageSpoilerOverlay(props: MessageSpoilerOverlayProps, HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider) {
  const element = document.createElement('div');
  element.classList.add('message-spoiler-overlay');

  let controls: MessageSpoilerOverlayControls;

  const dispose = render(
    () => (
      <HotReloadGuardProvider>
        <MessageSpoilerOverlay
          parentElement={element}
          controlsRef={(value) => {
            controls = value;
          }}
          {...props}
        />
      </HotReloadGuardProvider>
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

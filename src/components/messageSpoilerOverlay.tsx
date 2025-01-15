import {batch, createSignal, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import ListenerSetter from '../helpers/listenerSetter';
import BezierEasing from '../vendor/bezierEasing';
import createMiddleware from '../helpers/solid/createMiddleware';
import nMap from '../helpers/number/nMap';
import findUpClassName from '../helpers/dom/findUpClassName';
import {logger} from '../lib/logger';

import {animateValue} from './mediaEditor/utils';
import {observeResize} from './resizeObserver';
import DotRenderer from './dotRenderer';
import type {AnimationItemGroup} from './animationIntersector';

type MessageSpoilerOverlayProps = {
  messageElement: HTMLDivElement;
  animationGroup: AnimationItemGroup;
};

type InternalMessageSpoilerOverlayProps = MessageSpoilerOverlayProps & {
  parentElement: HTMLDivElement;
  controlsRef: (controls: MessageSpoilerOverlayControls) => void;
}

type MessageSpoilerOverlayControls = {
  update: () => void;
};

type CustomDOMRect = {
  left: number;
  top: number;
  width: number;
  height: number;
}

const UNWRAPPED_TIMEOUT_MS = 10e3;

const log = logger('spoiler-overlay');

function MessageSpoilerOverlay(props: InternalMessageSpoilerOverlayProps) {
  const controls: MessageSpoilerOverlayControls = {
    update() {
      update();
    }
  };

  props.controlsRef(controls);

  const [spanRects, setSpanRects] = createSignal<CustomDOMRect[]>([]);
  const [backgroundColor, setBackgroundColor] = createSignal('transparent');
  const [unwrapProgress, setUnwrapProgress] = createSignal<number>(0);
  const [clickCoordinates, setClickCoordinates] = createSignal<[number, number]>();
  const [maxDist, setMaxDist] = createSignal<number>();
  const [rendererInitResult, setRendererInitResult] = createSignal<ReturnType<typeof DotRenderer.attachTextSpoilerTarget>>();

  let unwrapTimeout: number;
  let cancelAnimation: () => void;

  onMount(() => {
    update();

    const listenerSetter = new ListenerSetter();
    listenerSetter.add(props.messageElement)('click', onMessageClick);

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

  const canvas = <canvas
    class="message-spoiler-overlay__canvas"
    classList={{
      'message-spoiler-overlay__canvas--hidden': unwrapProgress() === 1
    }}
  /> as HTMLCanvasElement;
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
    const rect = props.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function updateSpanRects() {
    const messageRect = props.messageElement.getBoundingClientRect();
    const spoilers = props.messageElement.querySelectorAll('.spoiler-text');

    const rects: DOMRect[] = [];

    spoilers.forEach((_el) => {
      const el = _el as HTMLElement;
      rects.push(
        ...toDOMRectArray(el.getClientRects())
      );
    });

    const adjustedRects: CustomDOMRect[] = rects.map(spoilerRect => ({
      left: spoilerRect.left - messageRect.left,
      top: spoilerRect.top - messageRect.top,
      width: spoilerRect.width,
      height: spoilerRect.height
    }));

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
    if(!findUpClassName(e.target, 'spoiler')) return;

    if(unwrapProgress()) {
      // if(DEBUG)
      returnToInitial();
      return;
    }

    const rect = props.messageElement.getBoundingClientRect();

    setClickCoordinates([e.clientX - rect.left, e.clientY - rect.top]);
    setMaxDist(
      Math.max(
        Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.left, e.clientY - rect.bottom),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.bottom)
      ) + 20
    );

    cancelAnimation = animateValue(
      0,
      1,
      Math.min(820, (maxDist() / 160) * 400), // per 160px move time = 400ms
      (value) => {
        setUnwrapProgress(value)
      },
      {
        easing: BezierEasing(0.45, 0.37, 0.29, 1),
        onEnd: () => {
          unwrapTimeout = window.setTimeout(() => {
            returnToInitial();
          }, UNWRAPPED_TIMEOUT_MS);
        }
      }
    );
  }

  function returnToInitial() {
    cancelAnimation?.();
    window.clearTimeout(unwrapTimeout);
    setUnwrapProgress(0);
    setClickCoordinates();
    setMaxDist();
  }

  function draw() {
    drawSpoilerRects();
    drawClippingCircle();
  }

  function drawSpoilerRects() {
    const bg = backgroundColor();
    const rects = spanRects();
    const progress = unwrapProgress();
    const initialCoords = clickCoordinates();

    if(!ctx || !rects) return;

    const {sourceCanvas} = rendererInitResult() || {};

    const offset = 1; // cover space between lines of the message;

    for(const rect of rects) {
      const x = rect.left; // - offset;
      const y = rect.top - offset;
      const dw = rect.width; // + offset * 2;
      const dh = rect.height + offset * 2;

      ctx.fillStyle = bg;
      // ctx.fillStyle = 'red';
      ctx.fillRect(x, y, dw, dh);

      if(!sourceCanvas) continue;

      if(!initialCoords) {
        drawImageFromSource(sourceCanvas, x, y, dw, dh, x, y, dw, dh);
        continue;
      }

      const scaledProgress = progress * 0.125;
      drawImageFromSource(
        sourceCanvas,
        x + (initialCoords[0] - x) * scaledProgress,
        y + (initialCoords[1] - y) * scaledProgress,
        dw * (1 - scaledProgress),
        dh * (1 - scaledProgress),
        x,
        y,
        dw,
        dh
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
    ctx.shadowBlur = 120;
    ctx.shadowColor = 'white';
    ctx.beginPath();
    ctx.arc(initialCoords[0], initialCoords[1], radius * progress, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawImageFromSource(sourceCanvas: HTMLCanvasElement,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number
  ) {
    const sourceWidth = sourceCanvas.width;
    const sourceHeight = sourceCanvas.height;


    const startChunkX = Math.floor(sx / sourceWidth) * sourceWidth;
    const startChunkY = Math.floor(sy / sourceHeight) * sourceHeight;

    const lastChunkX = (Math.floor((sx + sw) / sourceWidth) + 1) * sourceWidth;
    const lastChunkY = (Math.floor((sy + sh) / sourceHeight) + 1) * sourceHeight;

    for(let cx = startChunkX; cx < lastChunkX; cx += sourceWidth) {
      for(let cy = startChunkY; cy < lastChunkY; cy += sourceHeight) {
        const rawX = Math.max(sx, cx);
        const rawY = Math.max(sy, cy);
        const x = rawX % sourceWidth;
        const y = rawY % sourceHeight;
        const w = Math.min(sourceWidth - x, sx + sw - rawX);
        const h = Math.min(sourceHeight - y, sy + sh - rawY);

        ctx.drawImage(sourceCanvas,
          x, y, w, h,
          nMap(rawX, sx, sx + sw, dx, dx + dw), nMap(rawY, sy, sy + sh, dy, dy + dh), w / sw * dw, h / sh * dh
        );
      }
    }
  }

  // createEffect(() => {
  //   console.log('spanRects() :>> ', spanRects());
  // });

  return (
    <>{canvas}</>
  );
}

function toDOMRectArray(list: DOMRectList) {
  const result: DOMRect[] = [];
  for(let i = 0; i < list.length; i++) {
    result.push(list.item(i));
  }
  return result;
}

export function createMessageSpoilerOverlay(props: MessageSpoilerOverlayProps) {
  const element = document.createElement('div');
  element.classList.add('message-spoiler-overlay');

  let controls: MessageSpoilerOverlayControls;

  const dispose = render(() => <MessageSpoilerOverlay
    parentElement={element}
    controlsRef={(value) => {
      controls = value;
    }}
    {...props}
  />, element);

  return {
    element,
    get controls() {
      return controls;
    },
    dispose
  };
}

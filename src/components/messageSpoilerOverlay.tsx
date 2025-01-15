import {batch, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';

import ListenerSetter from '../helpers/listenerSetter';
import BezierEasing from '../vendor/bezierEasing';

import {animateValue} from './mediaEditor/utils';

type MessageSpoilerOverlayProps = {
  messageElement: HTMLDivElement;
};

type InternalMessageSpoilerOverlayProps = MessageSpoilerOverlayProps & {
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

function MessageSpoilerOverlay(props: InternalMessageSpoilerOverlayProps) {
  let canvas: HTMLCanvasElement;

  const controls: MessageSpoilerOverlayControls = {
    update() {
      update();
    }
  };

  props.controlsRef(controls);

  const [spanRects, setSpanRects] = createSignal<CustomDOMRect[]>([]);
  const [backgroundColor, setBackgroundColor] = createSignal('transparent');
  const [unwrapProgress, setUnwrapProgress] = createSignal<number>(0);
  const [ctx, setCtx] = createSignal<CanvasRenderingContext2D>();

  const resizeObserver = new ResizeObserver(() => {
    update();
  });

  const listenerSetter = new ListenerSetter();
  onMount(() => {
    resizeObserver.observe(props.messageElement);
    listenerSetter.add(props.messageElement)('click', onMessageClick);
  });

  onCleanup(() => {
    listenerSetter.removeAll();
    resizeObserver.disconnect();
  });

  function update() {
    batch(() => {
      updateSpanRects();
      updateBackgroundColor();
    });
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
      left: messageRect.left - spoilerRect.left,
      top: messageRect.top - spoilerRect.top,
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
    const rect = props.messageElement.getBoundingClientRect();

    initialCoords = [e.clientX - rect.left, e.clientY - rect.top];
    maxDist =
      Math.max(
        Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.left, e.clientY - rect.bottom),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.top),
        Math.hypot(e.clientX - rect.right, e.clientY - rect.bottom)
      ) + 20;

    animateValue(
      0,
      1,
      Math.min(820, (maxDist / 160) * 400), // per 160px move time = 400ms
      (p) => {
        progress = p;
      },
      {
        easing: BezierEasing(0.45, 0.37, 0.29, 1)
      }
    );
  }

  function draw() {
    const rects = spanRects();
    const offset = 1; // cover space between lines of the message;

    for(const rect of rects) {
      const x = rect.left; // - offset;
      const y = rect.top - offset;
      const dw = rect.width; // + offset * 2;
      const dh = rect.height + offset * 2;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, dw, dh);
      if (initialCoords) {
        const scaledProgress = progress * 0.125;
        ctx.drawImage(
          renderer.canvas,
          x + (initialCoords[0] - x) * scaledProgress,
          y + (initialCoords[1] - y) * scaledProgress,
          dw * (1 - scaledProgress),
          dh * (1 - scaledProgress),
          x,
          y,
          dw,
          dh
        );
      } else ctx.drawImage(renderer.canvas, x, y, dw, dh, x, y, dw, dh);
    }
  }

  return (
    <Show when={spanRects().length > 0}>
      <canvas class="spoiler-text-canvas" ref={(el) => {
        canvas = el;
      }} />
    </Show>
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
  let controls: MessageSpoilerOverlayControls;

  const dispose = render(() => <MessageSpoilerOverlay
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

/*
const canvas = document.createElement('canvas');
canvas.classList.add('spoiler-text-canvas');
const ctx = canvas.getContext('2d');
const [w, h] = [480, 480];
canvas.width = w;
canvas.height = h;

setTimeout(() => {
  messageDiv.append(canvas);
}, 2000);

let progress = 0;
let initialCoords: [number, number];
let maxDist = 0;

messageDiv.addEventListener('click', (e) => {
  const rect = messageDiv.getBoundingClientRect();
  initialCoords = [e.clientX - rect.left, e.clientY - rect.top];
  maxDist =
    Math.max(
      Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
      Math.hypot(e.clientX - rect.left, e.clientY - rect.bottom),
      Math.hypot(e.clientX - rect.right, e.clientY - rect.top),
      Math.hypot(e.clientX - rect.right, e.clientY - rect.bottom)
    ) + 20;
  animateValue(
    0,
    1,
    Math.min(820, (maxDist / 160) * 400),
    (p) => {
      progress = p;
    },
    {
      easing: BezierEasing(0.45, 0.37, 0.29, 1)
    }
  );
});

animate(() => {
  if (!DotRenderer.instance) return true;
  const renderer = DotRenderer.instance;

  ctx.clearRect(0, 0, w, h);

  let bg: string = 'transparent';
  if (messageDiv.parentElement) {
    const computedStyle = window.getComputedStyle(messageDiv.parentElement);
    bg = computedStyle.backgroundColor;
  }
  const rect = messageDiv.getBoundingClientRect();
  const spoilers = messageDiv.querySelectorAll('.spoiler-text');
  const offset = 1;
  spoilers.forEach((_el) => {
    const el = _el as HTMLElement;
    const srects = el.getClientRects();

    for (let i = 0; i < srects.length; i++) {
      const crect = srects.item(i);
      const x = crect.left - rect.left; // - offset;
      const y = crect.top - rect.top - offset;
      const dw = crect.width; // + offset * 2;
      const dh = crect.height + offset * 2;
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, dw, dh);
      if (initialCoords) {
        const scaledProgress = progress * 0.125;
        ctx.drawImage(
          renderer.canvas,
          x + (initialCoords[0] - x) * scaledProgress,
          y + (initialCoords[1] - y) * scaledProgress,
          dw * (1 - scaledProgress),
          dh * (1 - scaledProgress),
          x,
          y,
          dw,
          dh
        );
      } else ctx.drawImage(renderer.canvas, x, y, dw, dh, x, y, dw, dh);
    }
  });
  if (initialCoords) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'white';
    ctx.shadowBlur = 120;
    ctx.shadowColor = 'white';
    ctx.beginPath();
    ctx.arc(initialCoords[0], initialCoords[1], maxDist * progress, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
  return true;
});
*/

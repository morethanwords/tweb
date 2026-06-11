import BezierEasing from '@vendor/bezierEasing';
import callbackify from '@helpers/callbackify';
import DotRendererCore, {drawClippingCircle, DotRendererConfig} from '@components/dotRendererCore';

export type MediaSpoilerDotsInitMessage = {
  type: 'init',
  width: number,
  height: number,
  dpr: number,
  config: DotRendererConfig,
  vertexURL: string,
  fragmentURL: string
};

export type MediaSpoilerDotsAttachMessage = {
  type: 'attach',
  id: number,
  canvas: OffscreenCanvas,
  x: number,
  y: number,
  color?: string
};

export type MediaSpoilerDotsRevealMessage = {
  type: 'reveal',
  id: number,
  coords: {x: number, y: number},
  maxDist: number,
  duration: number
};

export type MediaSpoilerDotsMessage =
  MediaSpoilerDotsInitMessage |
  MediaSpoilerDotsAttachMessage |
  MediaSpoilerDotsRevealMessage |
  {type: 'play' | 'pause' | 'detach', id: number};

const ctx = self as any as DedicatedWorkerGlobalScope;

const FRAME_INTERVAL = 1000 / 60;
const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1); // mirrors simpleEasing from @helpers/animateValue

type Target = {
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  color?: string,
  playing?: boolean,
  revealed?: boolean,
  reveal?: {coords: {x: number, y: number}, maxDist: number, duration: number, startTime: number}
};

let core: DotRendererCore;
let dpr: number;
let timerId: number;
const targets = new Map<number, Target>();

const drawTarget = (target: Target) => {
  const {canvas, context, x, y, reveal} = target;
  const {width, height} = canvas;

  context.clearRect(0, 0, width, height);

  if(!reveal) {
    context.drawImage(core.canvas as OffscreenCanvas, x, y, width, height, 0, 0, width, height);
  } else {
    const progress = simpleEasing(Math.min((Date.now() - reveal.startTime) / reveal.duration, 1));

    // Zoom (push) the particles
    const scaledProgress = progress ** 2 /* * Math.sqrt(progress) */ * 0.5;
    context.drawImage(core.canvas as OffscreenCanvas,
      x + reveal.coords.x * scaledProgress, y + reveal.coords.y * scaledProgress, width * (1 - scaledProgress), height * (1 - scaledProgress),
      0, 0, width, height
    );

    // Draw a clipping circle growing from where the user clicked
    drawClippingCircle(context, progress, reveal.coords, reveal.maxDist, dpr);

    if(progress >= 1) {
      target.revealed = true;
    }
  }

  if(target.color) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = target.color;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }
};

const needsFrame = () => {
  for(const target of targets.values()) {
    if(!target.revealed && (target.playing || target.reveal)) return true;
  }
  return false;
};

const frame = () => {
  core.draw();

  targets.forEach((target) => {
    if(target.revealed || (!target.playing && !target.reveal)) return;
    drawTarget(target);
  });

  timerId = needsFrame() ? ctx.setTimeout(frame, FRAME_INTERVAL) : undefined;
};

const ensureLoop = () => {
  if(timerId === undefined && needsFrame()) {
    if(core) core.lastDrawTime = Date.now();
    frame();
  }
};

const handlers = {
  init: (message: MediaSpoilerDotsInitMessage) => {
    dpr = message.dpr;
    const canvas = new OffscreenCanvas(message.width * dpr, message.height * dpr);
    core = new DotRendererCore(canvas, {vertex: message.vertexURL, fragment: message.fragmentURL});
    core.resize(message.width, message.height, dpr, message.config);
    callbackify(core.init(), () => ctx.postMessage('inited'));
  },

  attach: (message: MediaSpoilerDotsAttachMessage) => {
    targets.set(message.id, {
      canvas: message.canvas,
      context: message.canvas.getContext('2d'),
      x: message.x,
      y: message.y,
      color: message.color
    });
  },

  play: ({id}: {id: number}) => {
    const target = targets.get(id);
    if(!target) return;
    target.playing = true;
    ensureLoop();
  },

  pause: ({id}: {id: number}) => {
    const target = targets.get(id);
    if(target) target.playing = false;
  },

  reveal: (message: MediaSpoilerDotsRevealMessage) => {
    const target = targets.get(message.id);
    if(!target || target.revealed) return;
    target.reveal = {
      coords: message.coords,
      maxDist: message.maxDist,
      duration: message.duration,
      startTime: Date.now()
    };
    ensureLoop();
  },

  detach: ({id}: {id: number}) => {
    targets.delete(id);
  }
};

ctx.addEventListener('message', (event: MessageEvent<MediaSpoilerDotsMessage>) => {
  handlers[event.data.type]?.(event.data as any);
});

// A 16px picture of a blurred frame changes slowly, so it is repainted a few times a second, not on
// every frame of every tile.
const REPAINT_INTERVAL = 100;

/**
 * @param options.isSeen whether the blur shows round the picture right now: a video that covers its
 * whole box hides it, and then a GPU readback a frame is spent on nothing
 * @param options.isAlive while its owner is: one gone before the canvas was ever on screen would
 * otherwise keep it painting
 */
export default function callVideoCanvasBlur(video: HTMLVideoElement, options: {
  isSeen?: () => boolean,
  isAlive?: () => boolean
} = {}) {
  const {isSeen, isAlive} = options;
  const canvas = document.createElement('canvas');
  canvas.classList.add('call-video-blur');
  canvas.setAttribute('aria-hidden', 'true');
  const size = 16;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.filter = 'blur(2px)';
  const renderFrame = () => {
    if(video.videoWidth) {
      ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
    }
  };

  // Painted until the canvas, once on screen, is taken off it. The video tells when it has a new
  // frame where it can; elsewhere animation frames stand in, throttled the same way.
  let wasConnected = false, lastPaint = 0;
  const hasFrameCallback = typeof(video.requestVideoFrameCallback) === 'function';
  const tick = () => {
    if(isAlive?.() === false) {
      return;
    }

    if(canvas.isConnected) {
      wasConnected = true;
    } else if(wasConnected) {
      return;
    }

    const now = performance.now();
    if(now - lastPaint >= REPAINT_INTERVAL && isSeen?.() !== false) {
      lastPaint = now;
      renderFrame();
    }

    if(hasFrameCallback) video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
  };

  renderFrame();
  if(hasFrameCallback) video.requestVideoFrameCallback(tick);
  else requestAnimationFrame(tick);

  return canvas;
}

export type RLottieColor = [number, number, number];

// a leaf module so that workers can use it too (@lib/rlottie/rlottiePlayer pulls
// in a main-thread-only import chain)
export const rlottieColorToString = (color: RLottieColor | string) => typeof(color) === 'string' ? color : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

export default function applyColorOnContext(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  color: RLottieColor | string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = rlottieColorToString(color);
  context.fillRect(x, y, width, height);
  context.globalCompositeOperation = 'source-over';
}

// draw a decoded frame at the origin, then overlay the tint across the whole canvas when a color is set.
// shared by the rlottie worker's paintStaged and the emoji compositor's sticker path (paintSticker).
export function paintFrameTinted(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: CanvasImageSource,
  color: string
) {
  context.drawImage(frame, 0, 0);
  if(color) {
    applyColorOnContext(context, color, 0, 0, context.canvas.width, context.canvas.height);
  }
}

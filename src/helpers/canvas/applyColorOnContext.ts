export type RLottieColor = [number, number, number];

// a leaf module so that workers can use it too (@lib/rlottie/rlottiePlayer pulls
// in a main-thread-only import chain)
export default function applyColorOnContext(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  color: RLottieColor | string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = typeof(color) === 'string' ? color : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  context.fillRect(x, y, width, height);
  context.globalCompositeOperation = 'source-over';
}

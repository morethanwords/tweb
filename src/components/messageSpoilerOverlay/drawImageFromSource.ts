import nMap from '../../helpers/number/nMap';

export function drawImageFromSource(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
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

      ctx.drawImage(
        sourceCanvas,
        x,
        y,
        w,
        h,
        nMap(rawX, sx, sx + sw, dx, dx + dw),
        nMap(rawY, sy, sy + sh, dy, dy + dh),
        (w / sw) * dw,
        (h / sh) * dh
      );
    }
  }
}

export default function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill?: boolean, stroke?: boolean) {
  const dpr = ctx.canvas.dpr;
  if(dpr) {
    x *= dpr;
    y *= dpr;
    radius *= dpr;
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
  ctx.closePath();

  if(fill) {
    ctx.fill();
  }

  if(stroke) {
    ctx.stroke();
  }
}

export function drawCircleFromStart(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill?: boolean, stroke?: boolean) {
  return drawCircle(ctx, x + radius, y + radius, radius, fill, stroke);
}

export default function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: {[k in 'tl' | 'tr' | 'br' | 'bl']?: number} | number,
  fill?: boolean,
  stroke?: boolean
) {
  const dpr = ctx.canvas.dpr;
  if(dpr) {
    x *= dpr;
    y *= dpr;
    width *= dpr;
    height *= dpr;
  }

  if(typeof(radius) === 'number') {
    if(dpr) radius *= dpr;
    radius = {tl: radius, tr: radius, br: radius, bl: radius};
  } else {
    const defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
    for(const side in defaultRadius) {
      // @ts-ignore
      radius[side] = radius[side] ? (dpr ? radius[side] * dpr : radius[side]) : defaultRadius[side];
    }
  }

  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();

  if(fill) {
    ctx.fill();
  }

  if(stroke) {
    ctx.stroke();
  }
}

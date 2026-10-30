import {BACKDROP_MID_OFFSET, BACKDROP_VERTICAL_MID_OFFSET, BackdropColors} from './colors';
import {BACKDROP_TILT, SurfaceGeometry} from './layout';

/**
 * The backdrop gradient, described once: the screen sets it as CSS, the exported picture draws it on a canvas, both
 * from the same stops and the same line (`generateQrBackdrop`: three stops, a radial one centred on the card or, for
 * the tuned backdrop, a linear one leaning 18 degrees off the vertical).
 */

export type BackdropStop = {offset: number, color: string};

export type BackdropGradient = {
  stops: BackdropStop[]
} & ({
  kind: 'radial',
  cx: number,
  cy: number,
  radius: number
} | {
  kind: 'linear',
  x0: number,
  y0: number,
  x1: number,
  y1: number
});

export function gradientStops(colors: Pick<BackdropColors, 'center' | 'mid' | 'edge' | 'vertical'>): BackdropStop[] {
  return [
    {offset: 0, color: colors.center},
    {offset: colors.vertical ? BACKDROP_VERTICAL_MID_OFFSET : BACKDROP_MID_OFFSET, color: colors.mid},
    {offset: 1, color: colors.edge}
  ];
}

export function backdropGradient(colors: Pick<BackdropColors, 'center' | 'mid' | 'edge' | 'vertical'>, surface: Pick<SurfaceGeometry, 'width' | 'height' | 'cardCenterY' | 'backdropRadius'>): BackdropGradient {
  const stops = gradientStops(colors);
  if(!colors.vertical) {
    return {kind: 'radial', stops, cx: surface.width / 2, cy: surface.cardCenterY, radius: surface.backdropRadius};
  }

  // from the corner the line starts in to the one it ends in, through the middle of the surface
  const dx = Math.sin(BACKDROP_TILT), dy = Math.cos(BACKDROP_TILT);
  const length = surface.width * dx + surface.height * dy;
  const mx = surface.width / 2, my = surface.height / 2;
  return {
    kind: 'linear',
    stops,
    x0: mx - dx * length / 2,
    y0: my - dy * length / 2,
    x1: mx + dx * length / 2,
    y1: my + dy * length / 2
  };
}

const stopsToCss = (stops: BackdropStop[]) => stops.map(({offset, color}) => `${color} ${+(offset * 100).toFixed(2)}%`).join(', ');

export function backdropToCss(gradient: BackdropGradient) {
  if(gradient.kind === 'radial') {
    return `radial-gradient(circle ${gradient.radius.toFixed(1)}px at ${gradient.cx.toFixed(1)}px ${gradient.cy.toFixed(1)}px, ${stopsToCss(gradient.stops)})`;
  }

  const angle = Math.atan2(gradient.x1 - gradient.x0, -(gradient.y1 - gradient.y0)) * 180 / Math.PI;
  return `linear-gradient(${angle.toFixed(2)}deg, ${stopsToCss(gradient.stops)})`;
}

/** Fills the rectangle (0, 0, width, height) of the context with the gradient, at scale 1 of the surface. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, gradient: BackdropGradient, width: number, height: number) {
  const canvasGradient = gradient.kind === 'radial' ?
    ctx.createRadialGradient(gradient.cx, gradient.cy, 0, gradient.cx, gradient.cy, gradient.radius) :
    ctx.createLinearGradient(gradient.x0, gradient.y0, gradient.x1, gradient.y1);
  gradient.stops.forEach(({offset, color}) => canvasGradient.addColorStop(offset, color));
  ctx.fillStyle = canvasGradient;
  ctx.fillRect(0, 0, width, height);
}

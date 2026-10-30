import roundRect from '@helpers/canvas/roundRect';
import canvasToBlob from '@helpers/canvas/canvasToBlob';
import isRTL from '@helpers/string/isRTL';
import {BackdropGradient, paintBackdrop} from './backdrop';
import {Caption, captionFont, captionPlacement} from './caption';
import {SurfaceGeometry} from './layout';

/**
 * The picture the screen is copied, shared and saved as: the card on its backdrop, with a margin round it. It is the
 * screen itself cut down, drawn from the same stops, the same field and the same code, so what is exported is what is
 * seen. Nothing here repaints a screen-sized canvas of its own for every change: it runs on demand, at copy.
 */

/** The margin round the card, against the card's width */
const MARGIN_RATIO = 0.16;
const MIN_MARGIN = 24;
/** The picture's pixels per pixel of the screen */
const SCALE = 3;

export type ExportInput = {
  surface: SurfaceGeometry,
  gradient: BackdropGradient,
  ink: string,
  shadow: string,
  caption?: Caption,
  /** The painted code and field, as the screen holds them; the field is not there for a theme with none */
  qr: HTMLCanvasElement,
  field?: HTMLCanvasElement
};

export function exportRect(surface: SurfaceGeometry) {
  const margin = Math.max(MIN_MARGIN, surface.card.width * MARGIN_RATIO);
  const left = Math.max(0, surface.width / 2 - surface.card.width / 2 - margin);
  const top = Math.max(0, surface.cardTop - margin);
  return {
    left,
    top,
    width: Math.min(surface.width - left, surface.card.width + 2 * margin),
    height: Math.min(surface.height - top, surface.card.height + 2 * margin)
  };
}

export default function exportImage(input: ExportInput): Promise<Blob> {
  const {surface, gradient, ink, shadow, caption, qr, field} = input;
  const {card} = surface;
  const crop = exportRect(surface);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width * SCALE);
  canvas.height = Math.round(crop.height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.translate(-crop.left, -crop.top);

  paintBackdrop(ctx, gradient, surface.width, surface.height);
  if(field) ctx.drawImage(field, 0, 0, surface.width, surface.height);

  const cardLeft = (surface.width - card.width) / 2;
  ctx.save();
  ctx.shadowColor = shadow;
  ctx.shadowBlur = card.shadowBlur * SCALE;
  ctx.shadowOffsetY = card.shadowOffset * SCALE;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cardLeft, surface.cardTop, card.width, card.height, card.radius, true);
  ctx.restore();

  ctx.drawImage(qr, cardLeft + card.qrLeft, surface.cardTop + card.qrTop, card.qrSide, card.qrSide);

  const placement = captionPlacement(card, caption);
  if(placement) {
    ctx.fillStyle = ink;
    ctx.font = captionFont(placement.fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // a canvas takes the page's direction: '@NAME' would read 'NAME@' in a right to left page, so each line takes its own
    ctx.direction = caption.kind !== 'name' ? 'ltr' : isRTL(caption.text) ? 'rtl' : 'ltr';
    placement.lines.forEach((line, idx) => {
      ctx.fillText(line, cardLeft + card.width / 2, surface.cardTop + placement.top + placement.lineHeight * (idx + 0.5));
    });
  }

  return canvasToBlob(canvas, 'image/png');
}

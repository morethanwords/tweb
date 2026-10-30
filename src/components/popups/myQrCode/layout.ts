/**
 * The geometry of the QR screen, as ratios of the card's width (`QrShareView` of the Android client, measured on a
 * 360 dp phone where the card is 268 dp wide). The screen, the export and the panels of later briefs read the same
 * numbers from here.
 */

/** The card's width against the width of the screen (`cardW`) */
export const CARD_WIDTH_RATIO = 0.745;
/** The card's height against its width; a square one for a link with no caption (`cardH`) */
export const CARD_HEIGHT_RATIO = 1.07;
/** Where the card's middle sits against the screen's height at rest (`cardTop`) … */
export const CARD_CENTER_RATIO = 0.468;
/** … raised by this much (px), and settling this much lower when no pill stands under the card */
export const CARD_RAISE = 15;
export const CARD_NO_PILL_DROP = 16;
/** The pill under the card: its gap from the card and its height, which move and scale with the card */
export const PILL_GAP = 14;
export const PILL_HEIGHT = 36;

const ANDROID_CARD_WIDTH = 268;

/** The radius of the card's corners */
export const CARD_RADIUS_RATIO = 30 / ANDROID_CARD_WIDTH;
/** The shadow: a blur of 24 dp, 4 dp down */
export const CARD_SHADOW_BLUR_RATIO = 24 / ANDROID_CARD_WIDTH;
export const CARD_SHADOW_OFFSET_RATIO = 4 / ANDROID_CARD_WIDTH;
/** The code's side and its top inset (when there is a caption) */
export const QR_SIDE_RATIO = 0.70;
export const QR_TOP_RATIO = 0.12;
/** The caption's sizes, from the largest, and the room it has either side of it (`prepareContent`) */
export const CAPTION_FONT_RATIOS = [30, 25, 19].map((size) => size / ANDROID_CARD_WIDTH);
export const CAPTION_INSET_RATIO = 20 / ANDROID_CARD_WIDTH;
export const CAPTION_LINE_HEIGHT = 1.2;
/** A caption that fits on no line at the smallest size takes this many */
export const CAPTION_MAX_LINES = 3;

/** The backdrop's radius against the screen's diagonal (`putBackdropScene`) */
export const BACKDROP_RADIUS_RATIO = 0.62;
/** The tuned backdrop runs this far off the vertical */
export const BACKDROP_TILT = 18 * Math.PI / 180;

export type CardGeometry = {
  width: number,
  height: number,
  radius: number,
  shadowBlur: number,
  shadowOffset: number,
  qrSide: number,
  /** From the card's left; the code is centred */
  qrLeft: number,
  qrTop: number,
  /** The space under the code that the caption centres in (the card's bottom less the code's) */
  captionTop: number,
  captionHeight: number,
  captionWidth: number,
  captionFonts: number[]
};

/** Everything about a card of this width. `captioned`: a link with no caption makes it a square. */
export function cardGeometry(width: number, captioned = true): CardGeometry {
  const height = width * (captioned ? CARD_HEIGHT_RATIO : 1);
  const qrSide = width * QR_SIDE_RATIO;
  const qrTop = captioned ? width * QR_TOP_RATIO : (width - qrSide) / 2;
  const qrBottom = qrTop + qrSide;
  return {
    width,
    height,
    radius: width * CARD_RADIUS_RATIO,
    shadowBlur: width * CARD_SHADOW_BLUR_RATIO,
    shadowOffset: width * CARD_SHADOW_OFFSET_RATIO,
    qrSide,
    qrLeft: (width - qrSide) / 2,
    qrTop,
    captionTop: qrBottom,
    captionHeight: height - qrBottom,
    captionWidth: width - 2 * width * CAPTION_INSET_RATIO,
    captionFonts: CAPTION_FONT_RATIOS.map((ratio) => width * ratio)
  };
}

export type SurfaceGeometry = {
  width: number,
  height: number,
  card: CardGeometry,
  /** The card's top, from the top of the surface */
  cardTop: number,
  /** Where the card is centred, along the surface */
  cardCenterY: number,
  /** The backdrop's radius or length */
  backdropRadius: number,
  /** What stands under the card and goes with it: the pill and its gap, or nothing */
  pillExtra: number
};

/** The card's place on a screen of this size: a function of nothing else, so it is read once and on resize. */
export function surfaceGeometry(width: number, height: number, options: {captioned?: boolean, pill?: boolean} = {}): SurfaceGeometry {
  const card = cardGeometry(Math.round(width * CARD_WIDTH_RATIO), options.captioned !== false);
  const cardTop = height * CARD_CENTER_RATIO - card.height / 2 - CARD_RAISE + (options.pill ? 0 : CARD_NO_PILL_DROP);
  return {
    width,
    height,
    card,
    cardTop,
    cardCenterY: cardTop + card.height / 2,
    backdropRadius: Math.hypot(width, height) * BACKDROP_RADIUS_RATIO,
    pillExtra: options.pill ? PILL_GAP + PILL_HEIGHT : 0
  };
}

/* A panel open (`QrShareView.cardTop`, `sheetH`): the sheet stands at the bottom, the card makes room above it */

/** The sheet's margin from the sides of the screen, and its corners */
export const SHEET_INSET = 10;
export const SHEET_RADIUS = 28;
/** … and from the bottom, where the island of buttons stands under it */
export const SHEET_BOTTOM = 10;
/** The room kept for the close button above the card */
export const SHEET_TOP_INSET = 51;
/** The gap between the card and the sheet */
export const SHEET_CARD_GAP = 13;
/** The card does not shrink below this share of its size */
const MIN_CARD_SCALE = 0.5;

// Android's `sheetH`: from the card, its chip's place and the gap down to the bottom; at the least 160
export const sheetHeightFor = (surfaceHeight: number, surfaceWidth: number) => Math.round(Math.max(160, surfaceHeight - SHEET_BOTTOM - (SHEET_TOP_INSET + surfaceWidth * 0.745 * 1.07 + 24 + 11 + SHEET_CARD_GAP)));

export type OpenLayout = {
  /** The card's scale, about its top middle */
  scale: number,
  /** … and how far its top moves (px, down is positive) */
  shift: number
};

/**
 * Where the card goes while a sheet of this height stands under it: it rises only as far as it must, never above the
 * top inset or below its place at rest, and shrinks when the room above the sheet is not enough for it. A function of
 * constants, so the move is one `transform`.
 */
export function openLayout(surface: SurfaceGeometry, sheetHeight: number): OpenLayout {
  const top = SHEET_TOP_INSET;
  const bottom = surface.height - SHEET_BOTTOM - sheetHeight - SHEET_CARD_GAP;
  const room = Math.max(0, bottom - top);
  // the card and the pill under it move and shrink as one
  const full = surface.card.height + surface.pillExtra;
  const scale = Math.max(MIN_CARD_SCALE, Math.min(1, room / full));
  const height = full * scale;
  const openTop = Math.max(top, Math.min(surface.cardTop, top + (room - height) / 2));
  return {scale, shift: openTop - surface.cardTop};
}

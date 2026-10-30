// The card's layout in Figma design units (the card is 336×205).

import {Vec2} from '@components/wallet/visual/math';

export const DESIGN = {
  width: 336,
  height: 205,
  radius: 20,
  /** Card thickness: four times thinner than the iOS demo (9 points on a 361 card there). */
  thickness: 2.25 * 336 / 361,
  /**
   * Centre of the gem canvas: the «Diamond 20» glyph is centred at (36, 85.05),
   * and the gem's silhouette sits 0.71 points below the canvas centre.
   */
  gemCenter: [36, 84.34] as Vec2,
  /** The gem canvas is wider than the gem, for growth and sparkles (96 on a 361 card). */
  gemCanvas: 96 * 336 / 361,
  /** Gem width — the glyph's width in the design. */
  gemWidth: 20,
  /** The gem's touch circle. */
  gemHitRadius: 19,
  /** The QR chip: a 48×36 rectangle, corner radius 8. */
  chip: {x: 242, y: 74, width: 48, height: 36, radius: 8}
};

/**
 * The gem's middle on the card. The card's text is the interface's and stands mirrored right to left; the gem heads
 * the balance, so it goes with it to the inline start, and the QR chip to the inline end.
 */
export function cardGemCenter(rtl: boolean): Vec2 {
  return rtl ? [DESIGN.width - DESIGN.gemCenter[0], DESIGN.gemCenter[1]] : DESIGN.gemCenter;
}

/** The QR chip's left edge on the card, mirrored as the gem is */
export function cardChipX(rtl: boolean) {
  return rtl ? DESIGN.width - DESIGN.chip.x - DESIGN.chip.width : DESIGN.chip.x;
}
